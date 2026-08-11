# Streamly

A Netflix-style OTT service — live channels and VOD streamed over HLS from a Flussonic server.

Flussonic supplies the video and nothing else, so this platform owns the whole catalog: titles, artwork, channel lists and EPG all live in its own database and are managed from a built-in back office.

```
apps/api          NestJS  · REST API, auth, catalog, playback tokens
apps/web          Next.js · viewer app + /admin back office
packages/shared   Zod schemas shared by both — one source of truth for DTOs
ops/              PM2, nginx, deployment runbook
```

## Quick start

```bash
brew services start postgresql@16 redis   # or your own instances
createdb ott

cp .env.example .env                       # then set the secrets — see below
pnpm install
pnpm --filter @ott/api exec prisma migrate deploy
pnpm seed
pnpm dev
```

Web on **http://localhost:3000**, API on **http://localhost:4000**.
Seeded admin: `admin@ott.local` / `changeme123`.

Before anything else, set real values for `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` (`openssl rand -base64 48`) and point `FLUSSONIC_BASE_URL` at your server. Every variable is documented in [`.env.example`](.env.example).

## How playback works

Video never passes through this application.

1. The client asks the API for a session: `POST /api/playback/:kind/:id`.
2. The API checks entitlement and mints a Flussonic **securelink** token.
3. The client gets back a ready-to-play manifest URL and fetches segments **straight from Flussonic**.
4. Flussonic optionally calls back to `GET /api/playback/flussonic-auth` to have the API approve each session.

### Securelink token format

Derived from a known-good token issued by the target server and locked by a reference vector in the test suite:

```
hash  = sha1(stream + ip + starttime + endtime + key + salt)
token = <hash>-<salt>-<endtime>-<starttime>
```

`salt` is 16 random bytes as hex; timestamps are unix seconds; `stream` is the bare stream name with no leading slash and no manifest filename. `ip` is the viewer's address, or the literal `no_check_ip` when the key is configured with `?no_check_ip=true`.

That suffix lives inside Flussonic's own "Securelink auth key" field, so it arrives as part of the key and is parsed out rather than signed as key material — signing it produces a hash the server can never reproduce, and every request 403s with nothing to point at.

### Manifest names and scope

Live uses `index.m3u8`, VOD uses `playlist.m3u8`. `FLUSSONIC_TOKEN_SCOPE` controls where tokens are attached — commonly `live`, because many deployments authenticate live channels and serve VOD openly. Signing a URL the server does not expect to be signed gets it rejected.

The signing key never leaves the server, so a client cannot mint its own URLs. And because segments bypass the API entirely, app servers are sized for API traffic, not bandwidth.

Stream names are stored as bare Flussonic paths, unencoded — `ftp2/bollywood/Pongala (2025)/Pongala.1080p.Dual[Hindi-Malayalam].mp4` — and each segment is percent-encoded when the URL is built. Moving the Flussonic server is a change to one environment variable.

## Scaling

Written for horizontal scale, deployed vertically today. PM2 cluster mode uses every core; adding a second box is configuration, not a rewrite. The rules that keep it true:

- **No in-process state** — sessions, caches and rate-limit counters live in Redis.
- **No local disk as a source of truth** — artwork goes through `StorageService`; swapping the local driver for S3 is one env var (the S3 driver is stubbed).
- **Video never transits the API.**
- **All config from the environment**, no hostnames or keys in code.
- **Migrations are a deploy step**, never run on boot.
- `/healthz` and `/readyz` for load-balancer probes.

To confirm you have not broken this, run two instances and diff their responses — identical output means no state leaked into process memory. [`ops/deploy.md`](ops/deploy.md) has the full runbook and the scale-out checklist.

## Commands

| | |
|---|---|
| `pnpm dev` | API + web with hot reload |
| `pnpm build` | production build of all packages |
| `pnpm test` | API unit tests |
| `pnpm typecheck` | typecheck every package |
| `pnpm seed` | load the sample catalog |
| `pnpm db:studio` | browse the database |

## Notable behaviour

**Auth.** Access tokens are short-lived JWTs held in memory only — never localStorage. Refresh tokens are rotated on every use and stored hashed; presenting an already-rotated token revokes the whole family, since that means it leaked. The first account to register becomes admin.

**Profiles.** Selecting a profile swaps the account token for a profile-scoped one. Personalised endpoints read the profile from the token, never from a request parameter, so one account cannot read another profile's history by guessing an id.

**Player.** hls.js on Chrome/Firefox/Edge, native HLS on Safari, behind one hook. It recovers in place from transient network and media errors, and when a playback token expires mid-session it re-mints and resumes at the same position rather than dropping the viewer back to browse.

**Home page.** One request returns every rail. The expensive ones are cached per profile in Redis for five minutes; Continue Watching is always computed fresh so a resume position is never stale.
