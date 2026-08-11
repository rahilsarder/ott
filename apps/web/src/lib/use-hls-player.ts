'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type Hls from 'hls.js';
import type { ErrorData, Level } from 'hls.js';

export interface HlsQuality {
  index: number;
  height: number;
  bitrate: number;
}

export interface HlsPlayerState {
  ready: boolean;
  buffering: boolean;
  error: string | null;
  qualities: HlsQuality[];
  currentQuality: number;
  setQuality: (index: number) => void;
  /** Tears down and re-attaches the stream, even if the manifest URL is unchanged. */
  reload: () => void;
}

interface Options {
  manifestUrl: string;
  isLive: boolean;
  /**
   * Called when the manifest is rejected as expired/forbidden. Should return a
   * freshly minted URL, or null to give up.
   */
  onTokenExpired: () => Promise<string | null>;
}

/**
 * Wraps hls.js and Safari's native HLS behind one interface.
 *
 * Two failure modes matter for an OTT service and are handled here rather than
 * in the UI: transient network/media errors (recover in place instead of
 * dropping the viewer back to the browse page) and playback tokens expiring
 * mid-session (re-mint and resume at the same position).
 */
export function useHlsPlayer(videoRef: React.RefObject<HTMLVideoElement | null>, options: Options): HlsPlayerState {
  const { manifestUrl, isLive, onTokenExpired } = options;

  const hlsRef = useRef<Hls | null>(null);
  const recoveryAttempts = useRef(0);
  const reauthAttempts = useRef(0);
  // Kept in a ref so the effect never re-runs when the callback identity changes.
  const onTokenExpiredRef = useRef(onTokenExpired);
  onTokenExpiredRef.current = onTokenExpired;

  const [ready, setReady] = useState(false);
  const [buffering, setBuffering] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [qualities, setQualities] = useState<HlsQuality[]>([]);
  const [currentQuality, setCurrentQuality] = useState(-1);
  /*
   * Retrying cannot rely on the manifest URL changing. When FLUSSONIC_SECRET is
   * unset the URL carries no token and is byte-identical every time, so a
   * re-mint alone would leave the effect deps untouched and nothing would
   * happen. Bumping this counter is what actually forces a fresh attempt.
   */
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !manifestUrl) return;

    let disposed = false;
    recoveryAttempts.current = 0;
    reauthAttempts.current = 0;
    setReady(false);
    setError(null);
    setBuffering(true);

    /** Re-mints the URL and resumes where the viewer was. */
    const reauthenticate = async (): Promise<boolean> => {
      if (reauthAttempts.current >= 2) return false;
      reauthAttempts.current += 1;

      const resumeAt = video.currentTime;
      const fresh = await onTokenExpiredRef.current();
      if (!fresh || disposed) return false;

      if (hlsRef.current) {
        hlsRef.current.loadSource(fresh);
        hlsRef.current.startLoad(isLive ? -1 : resumeAt);
      } else {
        video.src = fresh;
        video.currentTime = resumeAt;
        void video.play().catch(() => undefined);
      }
      return true;
    };

    // Safari (and iOS in general) plays HLS natively and does it better than MSE.
    const canPlayNatively = video.canPlayType('application/vnd.apple.mpegurl') !== '';

    if (canPlayNatively) {
      video.src = manifestUrl;

      const onLoaded = () => {
        if (disposed) return;
        setReady(true);
        setBuffering(false);
      };
      const onWaiting = () => setBuffering(true);
      const onPlaying = () => setBuffering(false);
      const onNativeError = () => {
        void (async () => {
          if (await reauthenticate()) return;
          if (!disposed) setError('Playback failed. Please try again.');
        })();
      };

      video.addEventListener('loadedmetadata', onLoaded);
      video.addEventListener('waiting', onWaiting);
      video.addEventListener('playing', onPlaying);
      video.addEventListener('error', onNativeError);

      return () => {
        disposed = true;
        video.removeEventListener('loadedmetadata', onLoaded);
        video.removeEventListener('waiting', onWaiting);
        video.removeEventListener('playing', onPlaying);
        video.removeEventListener('error', onNativeError);
        video.removeAttribute('src');
        video.load();
      };
    }

    void (async () => {
      const { default: HlsCtor } = await import('hls.js');
      if (disposed || !HlsCtor.isSupported()) {
        if (!disposed) setError('This browser cannot play HLS video.');
        return;
      }

      const hls = new HlsCtor({
        enableWorker: true,
        lowLatencyMode: isLive,
        // Live viewers want the edge; VOD viewers want a deep buffer.
        backBufferLength: isLive ? 30 : 90,
        maxBufferLength: isLive ? 20 : 60,
      });
      hlsRef.current = hls;

      hls.on(HlsCtor.Events.MANIFEST_PARSED, (_evt, data) => {
        if (disposed) return;
        setQualities(
          (data.levels as Level[])
            .map((level, index) => ({ index, height: level.height ?? 0, bitrate: level.bitrate }))
            .filter((q) => q.height > 0)
            .sort((a, b) => b.height - a.height),
        );
        setReady(true);
        setBuffering(false);
      });

      hls.on(HlsCtor.Events.LEVEL_SWITCHED, (_evt, data) => setCurrentQuality(data.level));

      hls.on(HlsCtor.Events.ERROR, (_evt, data: ErrorData) => {
        if (disposed || !data.fatal) return;

        const status = data.response?.code;
        // 401/403 on a manifest means the signed token aged out mid-session.
        if (status === 401 || status === 403) {
          void (async () => {
            if (!(await reauthenticate())) {
              setError('This stream is no longer available.');
            }
          })();
          return;
        }

        switch (data.type) {
          case HlsCtor.ErrorTypes.NETWORK_ERROR:
            if (recoveryAttempts.current < 3) {
              recoveryAttempts.current += 1;
              setBuffering(true);
              hls.startLoad();
            } else {
              setError('Connection lost. Check your network and try again.');
            }
            break;
          case HlsCtor.ErrorTypes.MEDIA_ERROR:
            if (recoveryAttempts.current < 3) {
              recoveryAttempts.current += 1;
              hls.recoverMediaError();
            } else {
              setError('Playback error. Please try again.');
            }
            break;
          default:
            setError('Playback error. Please try again.');
        }
      });

      hls.attachMedia(video);
      hls.loadSource(manifestUrl);
    })();

    const onWaiting = () => setBuffering(true);
    const onPlaying = () => {
      setBuffering(false);
      // A clean resume means earlier trouble is behind us.
      recoveryAttempts.current = 0;
    };
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('playing', onPlaying);

    return () => {
      disposed = true;
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('playing', onPlaying);
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [manifestUrl, isLive, videoRef, attempt]);

  const setQuality = useCallback((index: number) => {
    if (!hlsRef.current) return;
    hlsRef.current.currentLevel = index;
    setCurrentQuality(index);
  }, []);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  return { ready, buffering, error, qualities, currentQuality, setQuality, reload };
}
