# Streamly — Product Requirements Document

| | |
|---|---|
| **Status** | Living document — reflects the system as built, updated each phase |
| **Last updated** | 2026-08-10 |
| **Owner** | Rahil |
| **Audience** | Engineering / technical review |

---

## 1. Summary

Streamly is a self-hosted OTT platform — live TV channels and video-on-demand, streamed as HLS from an existing Flussonic media server. Flussonic supplies video and nothing else: no metadata, no artwork, no EPG. Streamly owns the entire catalog (titles, cast, channel lists, programme guide) in its own database, managed through a built-in admin back office, and is responsible for everything a viewer sees other than the video bytes themselves.

The product goal beyond "plays video" was explicit from early on: **do not look like a Netflix clone.** The UI ships under a custom design language — internally named **Projection** — built around a brass-on-warm-ink palette, a recurring "torn-ticket" chamfer motif, and film-grain texture, deliberately avoiding the red-accent, white-focus-ring look shared by Netflix, YouTube and most competing OTT UIs evaluated during design (Playboox, ihub.live).

## 2. Problem statement

The operator has an existing Flussonic streaming server with a real content library (Bollywood/Hollywood film library, TV series, live channel feeds) but no consumer-facing product in front of it — no catalog system, no user accounts, no discovery, no admin tooling to manage what's published. Flussonic's own capabilities stop at "serve HLS given a stream path and a token."

## 3. Goals

- Ship a complete viewer experience — auth, profiles, browse, search, playback, live TV, watchlist, continue-watching — backed entirely by content already sitting on the operator's Flussonic server.
- Give admins a back office to manage the catalog without touching the database directly: titles, seasons/episodes, channels, EPG, subtitles, user roles.
- Make cataloging fast by leaning on TMDB for metadata and cast, rather than manual data entry per title.
- Establish a visual identity distinct enough that it does not read as a reskinned Netflix.
- Build the backend so a single-VPS deployment can scale to multiple app servers behind a load balancer as a **configuration change**, not a rewrite.

## 4. Non-goals (explicitly out of scope for now)

- **Monetization** — no subscriptions, paywalls, or payment processing. Deferred by product decision, not a technical gap.
- **DRM** — Flussonic securelink token auth only; no Widevine/FairPlay/PlayReady.
- **Native mobile/TV apps** — advisory guidance was given on the least-complex path to Android + TV, but nothing has been built. Web is the only client today.
- **Multi-language subtitle authoring** — admins upload subtitle files (typically one language per title); the platform does not generate or translate subtitles.
- **Recommendation ML** — rails (Trending, Because You Watched, New Releases) are rule-based, not model-driven.

## 5. Target users

| Persona | Need |
|---|---|
| **Viewer** | Browse a large multi-language catalog (Bengali, Hindi, Malayalam, Tamil, Telugu, English, and others), resume where they left off, watch live TV with a programme guide, get results even with typos in search. |
| **Admin / cataloger** | Add hundreds to thousands of titles quickly, attach streams as files land (often before metadata is ready, and vice versa), manage a large live-channel lineup and EPG, upload subtitles at the episode or season level. |

The catalog is multi-language by design — search, subtitles, and browse filtering were all built around that requirement rather than added later.

## 6. Product scope

Status legend: ✅ Shipped · 🚧 In progress · ⬜ Planned

### 6.1 Accounts & profiles ✅
- Email/password registration and login. First account to register becomes admin.
- JWT access tokens (15 min, held in memory only, never localStorage) + rotating refresh tokens (30 days, stored hashed, httpOnly cookie).
- Refresh-token reuse detection: presenting an already-rotated token revokes the entire token family, treating it as a signal of leakage.
- Up to several profiles per account (name, avatar, kids flag). Selecting a profile exchanges the account token for a **profile-scoped** token — personalized endpoints read the profile from the token itself, never from a request parameter, so one profile cannot read another's history by guessing an id.

### 6.2 Catalog & admin back office ✅
- Titles (`MOVIE` / `SERIES`), Seasons, Episodes, Genres, Channels, Programmes (EPG).
- Full CRUD from `/admin`: create/edit/publish titles, manage seasons and episodes independently (episodes can exist with metadata and no stream yet, or vice versa), channel management with an inline stream tester before publishing, EPG import via XMLTV, user role management.
- Image uploads (poster/backdrop/logo/still) are re-encoded server-side to WebP — this also strips anything hidden inside a file that merely claims to be an image.
- Storage is behind a `StorageService` seam: local disk today, S3 driver stubbed and selected by one environment variable.

### 6.3 TMDB integration ✅
- Admin attaches a TMDB id to a title (or searches TMDB by name) → **preview** the fetched metadata and cast before committing → **apply** writes it to the catalog. Nothing is written sight-unseen.
- Series import pulls seasons and episodes from TMDB in one pass.
- Cast/crew are stored as first-class `Person`/`Credit` rows (not just text), deduplicated by TMDB id, so cast pages link to every other title in *this* catalog that person appears in — not out to TMDB or IMDB.
- Artwork is linked directly to TMDB's CDN rather than re-hosted.

### 6.4 Playback ✅
Video never transits the API — the app only mints access; segments flow client → Flussonic directly.

1. Client calls `POST /api/playback/:kind/:id`.
2. API checks the title/episode/channel is published, resolves the Flussonic stream path, and mints a **securelink** token (`sha1(stream + ip + start + end + key + salt)`).
3. Client receives a ready-to-play manifest URL and starts hls.js (native HLS on Safari) directly against Flussonic.
4. Flussonic can optionally call back to the API to approve each session server-side — the hook future entitlement logic (concurrent-stream limits, etc.) would use.

Player behaviour:
- Recovers in place from transient network/media errors (hls.js retry policy) rather than dropping the viewer to browse.
- Re-mints the playback token and resumes at the same position if it expires mid-session, instead of erroring out.
- Progress heartbeats every 15s plus on pause/visibility-change/unload (`keepalive` fetch, since `sendBeacon` cannot carry the auth header this API needs).
- "Next episode" countdown card on series.
- CC menu merges the platform's own uploaded subtitle tracks with any subtitle renditions already embedded in Flussonic's HLS manifest — both surface through the same `video.textTracks` interface, so there's no special-casing between the two sources.

### 6.5 Subtitles ✅
- Admin uploads SRT, ASS/SSA, or WebVTT; the server converts to WebVTT and serves it with the CORS headers the `<track>` element needs.
- Encoding detection handles BOM'd UTF-8/UTF-16, strict UTF-8, and a hand-built Windows-1252 fallback (Node's built-in decoder for that label turned out to alias Latin-1 and silently corrupt curly quotes/em dashes — caught in testing, not assumed to work).
- Non-Latin scripts (Bengali, Malayalam, etc.) require a real UTF-8 export — there's no reliable heuristic for legacy single-byte encodings of those, so a bad file gets a clear rejection rather than mojibake.
- Bulk import at the season level: admin selects every subtitle file for a season at once; filenames like `S01E03`, `1x03`, `Episode 3` are matched to episodes automatically, every match is shown and editable before anything uploads, and one mismatched file never blocks the rest of the batch.

### 6.6 Search ✅
- Typo- and punctuation-tolerant: "spiderman", "spider man", and "Spider-Man" all resolve to the same results. Punctuation and spacing are normalized on both write and query so the two paths can never drift apart.
- Tiered ranking — exact prefix match outranks substring match outranks fuzzy (trigram) match — so a three-letter query doesn't drag in the whole catalog by similarity alone.
- Backed by Postgres `pg_trgm` with GIN trigram indexes; a similarity floor keeps very short or nonsense queries from returning noise.

### 6.7 Browse ✅
- Faceted filtering by type, genre, and language, with counts computed against *all other active filters* (selecting one facet narrows the counts shown for the rest, standard faceted-search semantics — verified, not assumed).
- Keyset (cursor) pagination rather than offset, so it stays performant at catalog scale.
- Language facet uses `Intl.DisplayNames` to show each language in its own script (বাংলা, தமிழ், മലയാളം, …), not just an ISO code.

### 6.8 Live TV ✅
- Channel grid grouped by category, "on air now" shown per channel.
- EPG guide as a horizontal timeline with a live-updating "now" marker.
- An ambient "on air" strip on the home page surfaces live content without it being a separate destination tab.

### 6.9 Home & recommendations ✅
- One request (`GET /home`) returns the full page — billboard + every rail — cached per profile in Redis for 5 minutes, except Continue Watching, which is always computed fresh so a resume position is never stale.
- Rule-based rails: Continue Watching, Trending (rolling play-count window), New Releases, per-genre rails, Live Now. No ML ranking.

### 6.10 Design system — "Projection" ✅
Built and rolled out screen-by-screen (see roadmap, §8) rather than all at once, with sign-off at each step:
- Palette: brass (`#C8963E`) on warm near-black, explicitly not red — red is what every competitor evaluated during design used.
- Recurring "torn-ticket" chamfer clip-path as the one repeated shape motif across cards, buttons, and panels.
- Inline SVG film-grain texture over artwork.
- Shelf cards expand on hover with an intent delay (150ms to expand, 80ms to collapse) so a pointer sweeping across a row doesn't trigger every card — only one you actually pause on responds.
- Dark-only by deliberate choice, not an oversight — a light mode would compete with the artwork, which is the point of the visual system.

### 6.11 Trailers ⬜ (Phase 7, next)
TMDB `videos` field into the import/preview flow, a YouTube embed modal on the title page, autoplay muted. Scoped as "embed a YouTube player," not another Flussonic stream — confirmed most trailers only exist on YouTube for this catalog.

### 6.12 Admin at scale ⬜ (Phase 8)
- Retheme all seven admin screens to Projection (currently still on the original red/white components).
- Bulk stream attach — flagged as needed sooner than "later," since attaching streams one episode at a time doesn't hold up as the catalog grows.
- Bulk publish, an "awaiting stream" dashboard, and removal of the superseded pre-Projection components.

## 7. Technical architecture

```
apps/api          NestJS 11 — REST API, auth, catalog, playback tokens, admin
apps/web           Next.js 15 (App Router) — viewer app + /admin back office
packages/shared    Zod schemas — single source of truth for DTOs, shared by both
ops/               PM2 ecosystem config, nginx, deployment runbook
```

| Layer | Choice |
|---|---|
| Backend | NestJS 11, TypeScript |
| Database | PostgreSQL 16 via Prisma 6 (`pg_trgm` extension for search) |
| Cache / session state | Redis (ioredis) |
| Auth | JWT access + rotating refresh tokens, argon2id password hashing |
| Validation | Zod, shared schemas between API and web forms |
| Frontend | Next.js 15 App Router, React 19, TanStack Query v5, Tailwind CSS v4 |
| Video | hls.js (native HLS on Safari), Flussonic securelink token auth |
| Rate limiting | `@nestjs/throttler`, Redis-backed |
| Logging | pino / nestjs-pino, structured with request ids |
| Deployment | PM2 cluster mode + nginx, single VPS today |

### Data model (core entities)

`User` → `Profile` (≤ a few per user) · `Title` (movie/series) → `Season` → `Episode` · `Genre` ↔ `Title` (join) · `Person` ↔ `Credit` ↔ `Title` (cast/crew, deduplicated by TMDB id) · `Channel` → `Programme` (EPG) · `Subtitle` (scoped to a title or a specific episode, mirrors the nullable-episode pattern already used by `WatchProgress`) · `WatchProgress` / `WatchlistItem` / `PlayEvent` (per-profile) · `RefreshToken` (hashed, family-based revocation).

Stream identity is stored as a **bare Flussonic path** (e.g. `ftp2/bollywood/2025/Pongala (2025)/Pongala.1080p.mp4`), never a full URL — the Flussonic host is environment config, so moving servers is a one-variable change, not a data migration.

## 8. Roadmap status

| Phase | Scope | Status |
|---|---|---|
| Foundation | Monorepo, auth, catalog/admin API, Flussonic playback tokens, HLS player, ops config | ✅ |
| TMDB integration | Metadata + cast import, public cast pages | ✅ |
| Projection design system | 1. Foundation (tokens, cards, shell) · 2. Home · 3. Title/person · 4. Browse & search at scale · 5. Live & player chrome · 6. Subtitles end to end | ✅ all six |
| Projection design system | 7. Trailers | ⬜ next |
| Projection design system | 8. Admin at scale | ⬜ |

Each Projection phase was built, demonstrated, and explicitly signed off before the next began — the UI was not built in one pass.

## 9. Non-functional requirements

The single-VPS deployment is deliberately written to scale out later without a rewrite:

- **No in-process state.** Sessions, caches, and rate-limit counters live in Redis, not a module-level `Map`. Verified by running two app instances behind the same config and diffing responses — identical output confirms nothing leaked into process memory.
- **No local disk as a source of truth.** All uploads (artwork, subtitles) go through `StorageService`; switching from local disk to S3 is one environment variable, not a code change.
- **Video never transits the API**, so app servers are sized for API traffic, not bandwidth.
- **All configuration from environment variables** — no hostnames, keys, or paths in code.
- **Migrations run as an explicit deploy step**, never on application boot, so N instances can start concurrently without racing each other on schema changes.
- `/healthz` and `/readyz` exist from day one for a future load balancer to probe.
- Scale-out path today: PM2 cluster mode uses every core on the current box; adding a second box means pointing it at the same Postgres/Redis and putting a load balancer in front — a config change per the constraints above, not a rewrite.

## 10. Security notes

- Access tokens are short-lived and held in memory only (never `localStorage`), mitigating XSS token theft.
- Refresh tokens are rotated on every use and stored hashed; reuse of an already-rotated token revokes the whole token family under the assumption it has leaked.
- All `/admin` routes are guarded server-side by role (`RolesGuard`); the client-side redirect for non-admins is convenience only and cannot be bypassed by editing client state.
- Flussonic's signing key never leaves the server — clients cannot mint their own playback URLs.
- Image uploads are re-encoded server-side (stripping anything hidden in a file that merely claims to be an image); subtitle uploads are parsed and converted, never served as the raw uploaded file.

## 11. Open decisions & risks

| Item | Detail |
|---|---|
| **Brand identity** | Still shipping as "iHub" in the nav and "Streamly" on the login screen — inconsistent, and a placeholder brass palette stands in for real brand colors. Cheap to resolve now, progressively less so post-launch. |
| **Flussonic is on `http://`** | Once the app is served over HTTPS, browsers will block those manifests as mixed content. Needs TLS on the Flussonic origin (or a proxy) before public launch. |
| **Bulk admin tooling** | Attaching streams one episode at a time doesn't hold up at current catalog growth rate; pulled forward as a priority within Phase 8 rather than treated as a nice-to-have. |
| **Cast search** | People/cast are not yet searchable — only titles and channels are. |
| **Native apps** | Advisory only. Android + TV client strategy was discussed but no build has started; needs a separate scoping pass (Chromecast/AndroidTV surface for the existing HLS + securelink backend is the likely lowest-complexity path, but this hasn't been formally spec'd). |
| **Monetization** | Explicitly deferred — no payment, subscription, or entitlement-tier work has been started, though the Flussonic auth-callback hook (§6.4) is where per-session entitlement checks would eventually attach. |

## 12. Appendix — key technical decisions worth flagging in review

- **Flussonic securelink token format** was reverse-engineered against a known-good production token (not documented cleanly by Flussonic) and is locked in place by a reference-vector test — if this test ever needs to change, it means the target Flussonic server's config changed, and playback will break in production until it's re-derived.
- **Search normalization** strips combining diacritical marks only in the Latin/Greek/Cyrillic Unicode block (U+0300–U+036F) — a blanket strip would also remove Bengali/Malayalam vowel signs, corrupting search for exactly the scripts this catalog most needs to support.
- **`episodeKey` pattern**: several tables (`WatchProgress`, `Subtitle`) need a unique constraint across "this title" + "this episode, or the title itself if it's a movie." Postgres treats `NULL` as distinct in unique indexes, so a plain nullable `episodeId` can't enforce that — each such table carries a parallel non-nullable `episodeKey` (empty string standing in for "no episode") purely to make the constraint hold.
