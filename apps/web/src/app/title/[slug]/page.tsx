'use client';

import Image from 'next/image';
import Link from 'next/link';
import { use, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type { Paginated, TitleCard as TitleCardModel, TitleDetail } from '@ott/shared';
import { api } from '@/lib/api';
import { getLocalProgress } from '@/lib/local-progress';
import { useSession } from '@/lib/session';
import { useWatchlist } from '@/lib/use-watchlist';
import { loadYoutubeIframeApi, type YoutubePlayer } from '@/lib/youtube-iframe-api';
import { cn, formatDuration, formatRating } from '@/lib/format';
import { MuteIcon, VolumeIcon } from '@/components/icons';
import { PersonCard, PosterCard } from '@/projection/cards';
import { EpisodeRow, SeasonPicker } from '@/projection/episodes';
import { TabBar, TopNav } from '@/projection/shell';
import { Button, SectionHead } from '@/projection/ui';

/** Dwell before the hero trailer autoplays — long enough that a viewer just
 *  passing through isn't immediately hit with video+audio, short enough that
 *  someone reading the synopsis still sees it kick in. */
const HERO_TRAILER_DWELL_MS = 3000;

export default function TitlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  return <TitleView slug={slug} />;
}

function TitleView({ slug }: { slug: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile, user } = useSession();
  const [seasonIndex, setSeasonIndex] = useState(0);

  const { data: title, isLoading } = useQuery({
    queryKey: ['title', slug, profile?.id],
    queryFn: () => api<TitleDetail>(`/catalog/titles/${slug}`),
  });

  // Server-side episode.progressSec (already in the response above) only
  // exists for a signed-in profile — an anonymous viewer's progress lives in
  // this device's localStorage instead (see EpisodeRow, which prefers the
  // server value and falls back to this). Read after mount, not during
  // render: localStorage doesn't exist during SSR, and reading it
  // synchronously here would produce a server/client hydration mismatch.
  const [localEpisodeProgress, setLocalEpisodeProgress] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    if (!title) return;
    const map = new Map<string, number>();
    for (const season of title.seasons) {
      for (const episode of season.episodes) {
        const local = getLocalProgress('episode', episode.id);
        if (local) map.set(episode.id, local.positionSec);
      }
    }
    setLocalEpisodeProgress(map);
  }, [title]);

  const playHref = title?.resume
    ? `/watch/${title.resume.kind}/${title.resume.id}`
    : title?.type === 'MOVIE'
      ? `/watch/movie/${title.id}`
      : null;

  // `?play=1` from a card's play button starts without a second click.
  useEffect(() => {
    if (title && playHref && searchParams.get('play') === '1') router.replace(playHref);
  }, [title, playHref, searchParams, router]);

  if (isLoading || !title) {
    return (
      <div className="min-h-dvh bg-night font-projection text-bone">
        <TopNav />
        <div className="px-4 pt-6 md:px-12">
          <div className="chamfer-lg aspect-[3/4] animate-pulse bg-night-2 sm:aspect-[16/9] md:aspect-[21/9]" />
        </div>
      </div>
    );
  }

  const season = title.seasons[seasonIndex];

  return (
    <div className="min-h-dvh bg-night pb-24 font-projection text-bone md:pb-16">
      <TopNav />

      <Hero title={title} playHref={playHref} />

      <div className="grid gap-10 px-4 pt-8 md:grid-cols-[minmax(0,1fr)_240px] md:px-12">
        <div className="flex min-w-0 flex-col gap-10">
          {title.type === 'SERIES' && title.seasons.length > 0 && (
            <section className="flex flex-col gap-4">
              <SectionHead
                title="Episodes"
                meta={season ? `${season.name || `Season ${season.number}`} · ${season.episodes.length} episodes` : undefined}
              />
              <SeasonPicker seasons={title.seasons} activeIndex={seasonIndex} onSelect={setSeasonIndex} />

              <div className="-mx-4 flex flex-col md:mx-0">
                {season?.episodes.map((episode) => (
                  <EpisodeRow
                    key={episode.id}
                    episode={episode}
                    href={`/watch/episode/${episode.id}`}
                    localProgressSec={localEpisodeProgress.get(episode.id)}
                  />
                ))}
              </div>
            </section>
          )}

          {title.cast.length > 0 && (
            <section className="flex flex-col gap-4">
              <SectionHead title="Cast" meta={`${title.cast.length} credited`} />
              <div className="no-scrollbar flex gap-4 overflow-x-auto pb-1">
                {title.cast.map((person) => (
                  <PersonCard key={`${person.personId}-${person.role}`} person={person} />
                ))}
              </div>
            </section>
          )}

          {title.crew.length > 0 && (
            <section className="flex flex-col gap-4">
              <SectionHead title="Crew" />
              <div className="no-scrollbar flex gap-4 overflow-x-auto pb-1">
                {title.crew.map((person) => (
                  <PersonCard key={`${person.personId}-${person.role}`} person={person} />
                ))}
              </div>
            </section>
          )}

          <MoreLikeThis title={title} />
        </div>

        <Facts title={title} />
      </div>

      {playHref && <StickyResume title={title} playHref={playHref} />}
      <TabBar />
    </div>
  );
}

/* ── Hero ────────────────────────────────────────────────────────────────── */

function Hero({ title, playHref }: { title: TitleDetail; playHref: string | null }) {
  const { inList, toggle, pending } = useWatchlist(title.id);
  const frameRef = useRef<HTMLDivElement>(null);
  const playerHostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YoutubePlayer | null>(null);
  const [dwellPassed, setDwellPassed] = useState(false);
  const [inView, setInView] = useState(false);
  const [trailerPlaying, setTrailerPlaying] = useState(false);
  // Starts muted on every (re)mount — required for autoplay to reliably work at
  // all across browsers — with a visible toggle so a viewer can opt into sound
  // with one real click, which also satisfies the browser's user-gesture
  // requirement for audio.
  const [trailerMuted, setTrailerMuted] = useState(true);

  useEffect(() => {
    if (!title.trailerYoutubeId) return;
    const timer = setTimeout(() => setDwellPassed(true), HERO_TRAILER_DWELL_MS);
    return () => clearTimeout(timer);
  }, [title.trailerYoutubeId]);

  useEffect(() => {
    if (!title.trailerYoutubeId) return;
    const node = frameRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.4 });
    observer.observe(node);
    return () => observer.disconnect();
  }, [title.trailerYoutubeId]);

  // Re-entering view after the dwell has already passed resumes immediately —
  // the delay is a first-load courtesy, not something to repeat every scroll.
  const showTrailer = Boolean(title.trailerYoutubeId) && dwellPassed && inView;
  const trailerYoutubeId = title.trailerYoutubeId;

  // Plain iframe embeds have no way to react to the video ending, so a loop
  // has to go through YouTube's own loop=1&playlist=<id> param — which
  // triggers "playlist mode" and brings back a prev/pause/next control
  // cluster that controls=0 does not suppress. Driving the player through
  // the real IFrame API instead means we see the ended state ourselves and
  // restart it manually, so nothing YouTube-owned ever needs to render.
  //
  // The API replaces whatever element it's given with its own iframe,
  // entirely outside React's reconciliation. React must never be handed
  // that element to render/unmount itself, or it eventually tries to
  // remove a node the API already swapped out from under it and crashes
  // ("removeChild... not a child of this node"). playerHostRef points at
  // a permanent wrapper div (always rendered, see below); the actual
  // mount target is created here imperatively instead, so React never
  // tracks the node the API touches.
  useEffect(() => {
    if (!showTrailer || !trailerYoutubeId || !playerHostRef.current) return;
    let cancelled = false;
    let player: YoutubePlayer | null = null;
    let revealTimer: ReturnType<typeof setTimeout> | undefined;
    const host = playerHostRef.current;
    const mountPoint = document.createElement('div');
    host.appendChild(mountPoint);

    void loadYoutubeIframeApi().then((YT) => {
      if (cancelled) return;
      player = new YT.Player(mountPoint, {
        // Matches TrailerModal's youtube-nocookie.com choice — this plays
        // automatically with no click from the viewer, so it should be at
        // least as conservative about tracking cookies as the click-to-open
        // version was.
        host: 'https://www.youtube-nocookie.com',
        videoId: trailerYoutubeId,
        playerVars: {
          autoplay: 1,
          mute: 1,
          controls: 0,
          rel: 0,
          modestbranding: 1,
          disablekb: 1,
          iv_load_policy: 3,
          playsinline: 1,
        },
        events: {
          onReady: (event) => {
            playerRef.current = event.target;
            // The API replaces our container with its own iframe rather than
            // filling it, so the crop/no-interaction treatment has to be
            // applied to that generated element directly.
            //
            // A flat oversize (e.g. 130%/130% at every breakpoint) only covers
            // the frame when the frame's own aspect ratio is already close to
            // the video's 16:9 — true at sm (16:9) and roughly true at md
            // (21:9), but badly wrong at the mobile default (3:4, portrait):
            // a 16:9 video filling 130% of a 3:4 box's width is still far
            // shorter than the box is tall, so YouTube's own iframe-internal
            // placement of the video within that leftover space (observed:
            // bottom-anchored, not centered) shows up as a large empty gap
            // rather than a vertically-centered trailer. Each breakpoint's
            // width/height is sized to just cover that breakpoint's real
            // aspect ratio (the same math as `object-fit: cover`), with a
            // couple of percent of slack against rounding.
            event.target.getIframe().className =
              'pointer-events-none absolute top-1/2 left-1/2 h-full w-[239%] -translate-x-1/2 -translate-y-1/2 sm:w-full md:h-[133%]';
          },
          onStateChange: (event) => {
            if (event.data === YT.PlayerState.PLAYING) {
              // Cross-origin iframe — nothing inside it (including its own
              // brief play/pause icon flash on this exact transition) is
              // reachable from our CSS/JS at all. Rather than fight that,
              // the poster stays covering the video until we know we're
              // past this state, so the flash plays out unseen behind it.
              // The extra 400ms is a buffer for the flash itself, which can
              // still be animating in the same instant this event fires.
              revealTimer = setTimeout(() => setTrailerPlaying(true), 400);
            }
            if (event.data === YT.PlayerState.ENDED) {
              event.target.seekTo(0, true);
              event.target.playVideo();
            }
          },
        },
      });
    });

    return () => {
      cancelled = true;
      clearTimeout(revealTimer);
      player?.destroy();
      playerRef.current = null;
      // Belt and suspenders: destroy() should already remove whatever the
      // API put here, but the host div (React-owned) must come back empty
      // regardless, ready for the next imperative mount.
      host.replaceChildren();
      // Reset so the next mount (e.g. scrolling back into view) waits for
      // its own PLAYING signal rather than instantly revealing a stale one,
      // and so the mute button reflects the fresh player's real muted-by-default state.
      setTrailerPlaying(false);
      setTrailerMuted(true);
    };
  }, [showTrailer, trailerYoutubeId]);

  const toggleTrailerMute = () => {
    const player = playerRef.current;
    if (!player) return;
    if (trailerMuted) player.unMute();
    else player.mute();
    setTrailerMuted((m) => !m);
  };

  const facts = [
    formatRating(title.rating),
    title.year ? String(title.year) : '',
    title.type === 'SERIES'
      ? `${title.seasons.length} season${title.seasons.length === 1 ? '' : 's'} · ${title.seasons.reduce((n, s) => n + s.episodes.length, 0)} episodes`
      : formatDuration(title.durationSec),
    title.genres.map((g) => g.name).join(' · '),
  ].filter(Boolean);

  return (
    <section className="relative px-4 pt-6 md:px-12 md:pt-8">
      <div
        ref={frameRef}
        className="chamfer-lg grain-over relative aspect-[3/4] overflow-hidden bg-night-3 shadow-[0_0_90px_rgb(200_150_62/0.10)] sm:aspect-[16/9] md:aspect-[21/9]"
      >
        {trailerYoutubeId && (
          // Always rendered whenever there's a trailer at all — never
          // conditioned on showTrailer. The effect above is what actually
          // creates/destroys the player (so scrolling away genuinely stops
          // playback and audio); this div only needs to exist as a stable
          // home for it to imperatively mount into and clear back out of.
          <div ref={playerHostRef} />
        )}
        {(title.posterUrl ?? title.backdropUrl) && (
          <Image
            src={(title.posterUrl ?? title.backdropUrl)!}
            alt=""
            fill
            priority
            sizes="100vw"
            className={cn(
              'object-cover sm:hidden',
              trailerPlaying && 'opacity-0 transition-opacity duration-700',
            )}
          />
        )}
        {title.backdropUrl && (
          <Image
            src={title.backdropUrl}
            alt=""
            fill
            priority
            sizes="100vw"
            className={cn(
              'hidden object-cover sm:block',
              trailerPlaying && 'opacity-0 transition-opacity duration-700',
            )}
          />
        )}
        <span
          className="absolute inset-0"
          style={{ background: 'radial-gradient(70% 90% at 58% 45%, transparent 28%, rgb(10 9 8 / 0.88) 100%)' }}
        />
        {trailerPlaying && (
          <button
            onClick={toggleTrailerMute}
            aria-label={trailerMuted ? 'Unmute trailer' : 'Mute trailer'}
            title={trailerMuted ? 'Unmute trailer' : 'Mute trailer'}
            className="focus-brass chamfer-sm absolute top-4 right-4 z-2 bg-night/50 p-2.5 text-bone/90 backdrop-blur transition hover:bg-night/80 hover:text-brass-hot md:top-6 md:right-6"
          >
            {trailerMuted ? <MuteIcon className="h-5 w-5" /> : <VolumeIcon className="h-5 w-5" />}
          </button>
        )}
        <span className="absolute inset-x-0 bottom-0 h-2/3 bg-linear-to-t from-night via-night/80 to-transparent md:hidden" />
      </div>

      {/*
        A constant lift, not one that grows with the breakpoint.
        The row below the heading sits at (frameBottom − lift + headingHeight +
        gap), so as long as the lift stays under the heading's own height it can
        never reach the frame — at any width. Scaling the lift instead means
        re-checking every viewport, which is how the metadata ended up behind
        the artwork twice.
      */}
      <div className="absolute inset-x-4 bottom-4 z-2 flex max-w-2xl flex-col gap-3 md:static md:-mt-10 md:ml-6">
        <h1 className="text-[clamp(2rem,5.5vw,3.75rem)] leading-[0.92] font-semibold tracking-[-0.045em] text-balance drop-shadow-[0_6px_40px_rgb(10_9_8/0.9)]">
          {title.name}
        </h1>

        <div className="flex flex-wrap items-center gap-2.5 text-xs text-ash md:text-sm">
          {facts.map((fact, index) => (
            <span key={fact} className="flex items-center gap-2.5">
              {index > 0 && <span aria-hidden className="size-[3px] rounded-full bg-ash-dim" />}
              {index === 0 && title.rating ? (
                <span className="label-mono border border-ash-dim px-1.5 py-0.5 text-bone">{fact}</span>
              ) : (
                <span>{fact}</span>
              )}
            </span>
          ))}
        </div>

        <p className="line-clamp-3 max-w-[52ch] text-sm text-ash">{title.synopsis || 'No synopsis available.'}</p>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          {playHref ? (
            <Link href={playHref} className="contents">
              <Button>▶ {title.resume?.label ?? 'Play'}</Button>
            </Link>
          ) : (
            /* No stream anywhere in this title — say so rather than offering a
               button that leads nowhere. */
            <span className="label-mono border border-hairline px-3 py-2.5 text-ash-dim">Not available yet</span>
          )}
          <Button variant="quiet" onClick={() => void toggle()} disabled={pending} aria-pressed={inList}>
            {inList ? '✓ Saved' : '＋ Save'}
          </Button>
        </div>
      </div>
    </section>
  );
}

/* ── Side column ─────────────────────────────────────────────────────────── */

function Facts({ title }: { title: TitleDetail }) {
  const directors = title.crew.filter((c) => c.role === 'Director');
  const writers = title.crew.filter((c) => c.role === 'Writer' || c.role === 'Screenplay');

  const rows = [
    directors.length > 0 && { label: 'Director', value: directors.map((d) => d.name).join(', ') },
    writers.length > 0 && { label: 'Writer', value: writers.map((w) => w.name).join(', ') },
    title.genres.length > 0 && { label: 'Genres', value: title.genres.map((g) => g.name).join(', ') },
    title.rating && { label: 'Rating', value: formatRating(title.rating) },
    title.year && { label: 'Released', value: String(title.year) },
  ].filter(Boolean) as { label: string; value: string }[];

  if (rows.length === 0) return null;

  return (
    <aside className="flex flex-col gap-4 md:pt-4">
      {rows.map((row) => (
        <section key={row.label} className="flex flex-col gap-1">
          <h3 className="label-mono text-ash-dim">{row.label}</h3>
          <p className="text-sm text-ash">{row.value}</p>
        </section>
      ))}
    </aside>
  );
}

/* ── Related ─────────────────────────────────────────────────────────────── */

/** Drawn from the first genre — no dedicated endpoint needed for a simple shelf. */
function MoreLikeThis({ title }: { title: TitleDetail }) {
  const genre = title.genres[0];

  const { data } = useQuery({
    queryKey: ['related', genre?.slug, title.id],
    queryFn: () => api<Paginated<TitleCardModel>>(`/catalog/titles?genre=${genre!.slug}&perPage=12`),
    enabled: Boolean(genre),
  });

  const related = useMemo(() => (data?.items ?? []).filter((t) => t.id !== title.id).slice(0, 8), [data, title.id]);
  if (related.length === 0) return null;

  return (
    <section className="flex flex-col gap-4">
      <SectionHead title="More like this" meta={genre?.name} href={genre ? `/browse/${genre.slug}` : undefined} />
      <div className="no-scrollbar flex gap-3 overflow-x-auto pb-1">
        {related.map((item) => (
          <PosterCard key={item.id} title={item} />
        ))}
      </div>
    </section>
  );
}

/* ── Sticky resume ───────────────────────────────────────────────────────── */

/**
 * Appears on a phone once the hero has scrolled away, so a long episode list is
 * never more than a tap from continuing.
 */
function StickyResume({ title, playHref }: { title: TitleDetail; playHref: string }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 320);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div
      className={cn(
        'fixed inset-x-0 bottom-[4.5rem] z-40 flex items-center gap-3 border-y border-hairline bg-night/95 px-4 py-2.5 backdrop-blur transition-all md:hidden',
        show ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-2 opacity-0',
      )}
    >
      <b className="truncate text-xs font-semibold">{title.name}</b>
      <Link href={playHref} className="contents">
        <Button className="ml-auto shrink-0 px-3 py-1.5 text-[0.6875rem]">▶ {title.resume?.label ?? 'Play'}</Button>
      </Link>
    </div>
  );
}
