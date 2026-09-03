/**
 * Minimal ambient types for the slice of YouTube's IFrame API this app
 * actually uses (a muted, chrome-free, auto-restarting background trailer).
 * The full @types/youtube package covers far more surface than that.
 */
export interface YoutubePlayer {
  playVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getIframe(): HTMLIFrameElement;
  destroy(): void;
  mute(): void;
  unMute(): void;
}

interface YoutubePlayerEvent {
  target: YoutubePlayer;
}

interface YoutubeStateChangeEvent extends YoutubePlayerEvent {
  data: number;
}

interface YoutubePlayerOptions {
  videoId: string;
  host?: string;
  playerVars?: Record<string, number | string>;
  events?: {
    onReady?: (event: YoutubePlayerEvent) => void;
    onStateChange?: (event: YoutubeStateChangeEvent) => void;
  };
}

interface YoutubeNamespace {
  Player: new (container: HTMLElement, options: YoutubePlayerOptions) => YoutubePlayer;
  PlayerState: { PLAYING: number; ENDED: number };
}

declare global {
  interface Window {
    YT?: YoutubeNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YoutubeNamespace> | null = null;

/**
 * Loads YouTube's IFrame API once and caches the promise, so navigating
 * between title pages never injects the script twice.
 */
export function loadYoutubeIframeApi(): Promise<YoutubeNamespace> {
  if (apiPromise) return apiPromise;

  apiPromise = new Promise((resolve) => {
    if (window.YT?.Player) {
      resolve(window.YT);
      return;
    }
    // YouTube calls this global by name once the script below has loaded and
    // initialized — chaining any pre-existing callback rather than clobbering
    // it, in case something else on the page also loads this API.
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(window.YT!);
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(script);
  });

  return apiPromise;
}
