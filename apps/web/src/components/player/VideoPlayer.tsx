'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PlaybackSession } from '@ott/shared';
import { api } from '@/lib/api';
import { cn, formatClock } from '@/lib/format';
import { getLocalProgress, saveLocalProgress } from '@/lib/local-progress';
import { useSession } from '@/lib/session';
import { useHlsPlayer } from '@/lib/use-hls-player';
import { useSubtitleTracks } from '@/lib/use-subtitle-tracks';
import { PlayerControls } from './PlayerControls';
import { NextEpisodeCard } from './NextEpisodeCard';

const HEARTBEAT_INTERVAL_MS = 15_000;
const CONTROLS_IDLE_MS = 3000;
const SEEK_STEP_SEC = 10;
/** Used when a series has no admin-set creditsLeadSec — see PlaybackSession.creditsLeadSec. */
const DEFAULT_CREDITS_LEAD_SEC = 60;

export function VideoPlayer({ session: initial }: { session: PlaybackSession }) {
  const router = useRouter();
  const { profile } = useSession();
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [session, setSession] = useState(initial);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(initial.startPositionSec);
  const [duration, setDuration] = useState(initial.durationSec ?? 0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [controlsVisible, setControlsVisible] = useState(true);
  // 'early' = still inside the credits-lead heuristic window (offer only, no forced
  // auto-advance); 'ended' = the video has genuinely finished (safe to auto-advance).
  const [nextCardTrigger, setNextCardTrigger] = useState<'early' | 'ended' | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  // Persists across a "Dismiss" click on the *early* offer for the rest of this episode —
  // otherwise the very next timeupdate tick (still inside the credits window) would immediately
  // re-show it. Does not suppress the true `ended` trigger — dismissing "skip now" just means
  // "let me watch the rest of this episode", not "never offer the next one at all". A full
  // remount (moving to a genuinely different episode) resets this along with everything else.
  const nextCardDismissedRef = useRef(false);

  /**
   * `router.back()` silently does nothing when the player was opened directly —
   * a shared link, a refresh, a redirect — leaving the viewer stranded on a
   * dead page. Rather than trust `history.length` (which counts entries that
   * are not ours), go back and confirm the URL actually changed, falling back
   * to home if it did not.
   */
  const goBack = useCallback(() => {
    if (window.history.length <= 1) {
      router.push('/');
      return;
    }
    const from = window.location.pathname;
    router.back();
    window.setTimeout(() => {
      if (window.location.pathname === from) router.push('/');
    }, 400);
  }, [router]);

  const remintToken = useCallback(async (): Promise<string | null> => {
    try {
      const fresh = await api<PlaybackSession>(`/playback/${session.kind}/${session.id}`, { method: 'POST' });
      setSession(fresh);
      return fresh.manifestUrl;
    } catch {
      return null;
    }
  }, [session.kind, session.id]);

  const player = useHlsPlayer(videoRef, {
    manifestUrl: session.manifestUrl,
    isLive: session.isLive,
    onTokenExpired: remintToken,
  });
  const subtitleTracks = useSubtitleTracks(videoRef);

  /** Re-mint first, then force the player to re-attach even if the URL is unchanged. */
  const retry = useCallback(async () => {
    await remintToken();
    player.reload();
  }, [remintToken, player]);

  // Seek to the saved resume position once the media knows its own duration.
  // The server position wins when it has one; local storage is only consulted
  // when it doesn't (an anonymous viewer, who the server never tracks at all).
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !player.ready || session.isLive) return;
    const resumeAt =
      session.startPositionSec > 0
        ? session.startPositionSec
        : (getLocalProgress(session.kind, session.id)?.positionSec ?? 0);
    if (resumeAt > 0 && Math.abs(video.currentTime - resumeAt) > 2) {
      video.currentTime = resumeAt;
    }
    void video.play().catch(() => undefined);
  }, [player.ready, session.startPositionSec, session.isLive, session.kind, session.id]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTime = () => {
      setCurrentTime(video.currentTime);

      // Offers "Play next episode" once the remaining time drops inside the credits window,
      // rather than waiting for the browser's `ended` event — there's no way to know where an
      // episode's credits actually start without real content analysis (audio fingerprinting
      // across a season, the way Plex/Jellyfin's intro-skip features work — a real background
      // pipeline, not something the player can do live), so this is a duration-based heuristic
      // instead: an admin-set per-series lead time when one exists, a fixed default otherwise.
      if (
        !nextCardDismissedRef.current &&
        session.nextEpisodeId &&
        !session.isLive &&
        Number.isFinite(video.duration) &&
        video.duration > 0
      ) {
        const leadSec = session.creditsLeadSec ?? DEFAULT_CREDITS_LEAD_SEC;
        if (video.duration - video.currentTime <= leadSec) setNextCardTrigger('early');
      }
    };
    const onDuration = () => setDuration(Number.isFinite(video.duration) ? video.duration : 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onVolume = () => {
      setVolume(video.volume);
      setMuted(video.muted);
    };
    const onRateChange = () => setPlaybackRate(video.playbackRate);
    const onEnded = () => {
      // Always upgrades to 'ended' (unlike the early trigger, this ignores
      // nextCardDismissedRef) — dismissing the early offer, or a lead time short/zero enough that
      // it never fired at all, still gets the real prompt once the episode has truly finished.
      if (session.nextEpisodeId) setNextCardTrigger('ended');
    };

    video.addEventListener('timeupdate', onTime);
    video.addEventListener('durationchange', onDuration);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('volumechange', onVolume);
    video.addEventListener('ratechange', onRateChange);
    video.addEventListener('ended', onEnded);

    return () => {
      video.removeEventListener('timeupdate', onTime);
      video.removeEventListener('durationchange', onDuration);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('volumechange', onVolume);
      video.removeEventListener('ratechange', onRateChange);
      video.removeEventListener('ended', onEnded);
    };
  }, [session.nextEpisodeId, session.creditsLeadSec, session.isLive]);

  // Progress heartbeat. Live has no meaningful resume position, so it is skipped.
  // The server call is still profile-scoped (anonymous viewers have no profile
  // to POST against — that'd just 401 every interval), but the local-storage
  // mirror always runs regardless of profile: it's the only persistence an
  // anonymous viewer gets, and every viewer gets an instant local fallback.
  useEffect(() => {
    if (session.isLive || session.kind === 'channel') return;

    /**
     * `keepalive` lets the request outlive the page, which sendBeacon would also
     * do — but sendBeacon cannot carry the Authorization header the API needs.
     */
    const report = (surviveUnload: boolean) => {
      const video = videoRef.current;
      if (!video || !video.duration || !Number.isFinite(video.duration)) return;

      const positionSec = Math.floor(video.currentTime);
      const durationSec = Math.floor(video.duration);
      saveLocalProgress(session.kind, session.id, positionSec, durationSec);

      if (!profile) return;
      void api<void>('/progress', {
        method: 'POST',
        keepalive: surviveUnload,
        body: { kind: session.kind as 'movie' | 'episode', id: session.id, positionSec, durationSec },
      }).catch(() => undefined);
    };

    const interval = setInterval(() => {
      if (!videoRef.current?.paused) report(false);
    }, HEARTBEAT_INTERVAL_MS);

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') report(true);
    };
    const onPageHide = () => report(true);

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      report(true);
    };
  }, [session.kind, session.id, session.isLive, profile]);

  const nudgeControls = useCallback(() => {
    setControlsVisible(true);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      if (!videoRef.current?.paused) setControlsVisible(false);
    }, CONTROLS_IDLE_MS);
  }, []);

  useEffect(() => {
    nudgeControls();
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [nudgeControls]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play().catch(() => undefined);
    else video.pause();
    nudgeControls();
  }, [nudgeControls]);

  const seekBy = useCallback(
    (delta: number) => {
      const video = videoRef.current;
      if (!video || session.isLive) return;
      video.currentTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + delta));
      nudgeControls();
    },
    [session.isLive, nudgeControls],
  );

  const seekTo = useCallback(
    (value: number) => {
      const video = videoRef.current;
      if (!video || session.isLive) return;
      video.currentTime = value;
      setCurrentTime(value);
      nudgeControls();
    },
    [session.isLive, nudgeControls],
  );

  const changePlaybackRate = useCallback((rate: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = rate;
    setPlaybackRate(rate);
  }, []);

  const changeVolume = useCallback((value: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = value;
    video.muted = value === 0;
  }, []);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => undefined);
      return;
    }
    if (el.requestFullscreen) {
      await el.requestFullscreen().catch(() => undefined);
      return;
    }
    // iOS Safari never implemented the Fullscreen API for arbitrary elements —
    // only <video> supports it, via this iOS-only method.
    const video = videoRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    video?.webkitEnterFullscreen?.();
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    // The iOS fallback above enters native video fullscreen, which never fires
    // `fullscreenchange` — it fires these events on the video element instead.
    const onIosBegin = () => setFullscreen(true);
    const onIosEnd = () => setFullscreen(false);
    document.addEventListener('fullscreenchange', onChange);
    video?.addEventListener('webkitbeginfullscreen', onIosBegin);
    video?.addEventListener('webkitendfullscreen', onIosEnd);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      video?.removeEventListener('webkitbeginfullscreen', onIosBegin);
      video?.removeEventListener('webkitendfullscreen', onIosEnd);
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      // The scrubber and volume control are <input type="range"> — real text
      // fields (INPUT of any other type, TEXTAREA, SELECT) still opt out, but
      // our own sliders shouldn't silently swallow every shortcut just
      // because the viewer last clicked one to seek or adjust volume.
      const isOwnSlider = target?.tagName === 'INPUT' && (target as HTMLInputElement).type === 'range';
      if (target && !isOwnSlider && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;

      switch (event.key) {
        case ' ':
        case 'k':
          event.preventDefault();
          togglePlay();
          break;
        case 'ArrowRight':
          event.preventDefault();
          seekBy(SEEK_STEP_SEC);
          break;
        case 'ArrowLeft':
          event.preventDefault();
          seekBy(-SEEK_STEP_SEC);
          break;
        case 'ArrowUp':
          event.preventDefault();
          changeVolume(Math.min(1, (videoRef.current?.volume ?? 1) + 0.1));
          break;
        case 'ArrowDown':
          event.preventDefault();
          changeVolume(Math.max(0, (videoRef.current?.volume ?? 1) - 0.1));
          break;
        case 'm':
          toggleMute();
          break;
        case 'f':
          void toggleFullscreen();
          break;
        case 'Escape':
          if (!document.fullscreenElement) goBack();
          break;
      }
      nudgeControls();
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePlay, seekBy, changeVolume, toggleMute, toggleFullscreen, nudgeControls, goBack]);

  return (
    <div
      ref={containerRef}
      className="font-projection relative h-dvh w-full bg-black text-bone"
      onMouseMove={nudgeControls}
      onTouchStart={nudgeControls}
    >
      <video
        ref={videoRef}
        className="h-full w-full object-contain"
        playsInline
        autoPlay
        crossOrigin="anonymous"
        onClick={togglePlay}
        poster={session.backdropUrl ?? undefined}
      >
        {session.subtitles.map((track) => (
          <track key={track.language} kind="subtitles" srcLang={track.language} label={track.label} src={track.url} />
        ))}
      </video>

      {player.buffering && !player.error && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="h-14 w-14 animate-spin rounded-full border-4 border-bone/20 border-t-brass-hot" />
        </div>
      )}

      {player.error && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-night/90 px-6 text-center">
          <div className="max-w-md space-y-4">
            <h2 className="text-xl font-semibold text-bone">{player.error}</h2>
            <div className="flex justify-center gap-3">
              <button
                onClick={() => void retry()}
                className="chamfer-sm focus-brass bg-brass px-5 py-2 font-semibold text-[#17110a] transition hover:bg-brass-hot"
              >
                Try again
              </button>
              <button
                onClick={goBack}
                className="chamfer-sm focus-brass bg-bone/10 px-5 py-2 font-semibold text-bone transition hover:bg-bone/20"
              >
                Go back
              </button>
            </div>
          </div>
        </div>
      )}

      {nextCardTrigger && session.nextEpisodeId && (
        <NextEpisodeCard
          autoAdvance={nextCardTrigger === 'ended'}
          onPlay={() => router.replace(`/watch/episode/${session.nextEpisodeId}`)}
          onDismiss={() => {
            nextCardDismissedRef.current = true;
            setNextCardTrigger(null);
          }}
        />
      )}

      <PlayerControls
        session={session}
        visible={controlsVisible || !playing}
        playing={playing}
        currentTime={currentTime}
        duration={duration}
        volume={volume}
        muted={muted}
        playbackRate={playbackRate}
        fullscreen={fullscreen}
        qualities={player.qualities}
        currentQuality={player.currentQuality}
        subtitleOptions={subtitleTracks.options}
        activeSubtitle={subtitleTracks.active}
        onTogglePlay={togglePlay}
        onSeek={seekTo}
        onSeekBy={seekBy}
        onVolume={changeVolume}
        onToggleMute={toggleMute}
        onPlaybackRate={changePlaybackRate}
        onToggleFullscreen={() => void toggleFullscreen()}
        onQuality={player.setQuality}
        onSubtitleSelect={subtitleTracks.select}
        onBack={goBack}
      />

      <div
        className={cn(
          'pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-night/85 to-transparent transition-opacity',
          controlsVisible || !playing ? 'opacity-100' : 'opacity-0',
        )}
      />
    </div>
  );
}

export { formatClock };
