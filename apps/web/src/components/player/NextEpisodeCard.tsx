'use client';

import { useEffect, useState } from 'react';
import { PlayIcon } from '@/components/icons';

const COUNTDOWN_SEC = 10;

interface Props {
  onPlay: () => void;
  onDismiss: () => void;
  /**
   * Starts a countdown that auto-advances to the next episode. Only
   * appropriate once the video has genuinely finished — the early offer
   * (still inside the credits-lead window, before the real `ended` event)
   * is a guess at timing, not a fact, so it must never force playback
   * forward on its own; it just sits there until the viewer acts or the
   * episode actually ends.
   */
  autoAdvance: boolean;
}

export function NextEpisodeCard({ onPlay, onDismiss, autoAdvance }: Props) {
  const [remaining, setRemaining] = useState(COUNTDOWN_SEC);

  useEffect(() => {
    if (!autoAdvance) return;
    const timer = setInterval(() => setRemaining((v) => v - 1), 1000);
    return () => clearInterval(timer);
  }, [autoAdvance]);

  useEffect(() => {
    if (autoAdvance && remaining <= 0) onPlay();
  }, [autoAdvance, remaining, onPlay]);

  const progress = autoAdvance ? ((COUNTDOWN_SEC - remaining) / COUNTDOWN_SEC) * 100 : 0;

  return (
    <div className="chamfer-md animate-rise absolute right-6 bottom-28 z-30 w-80 overflow-hidden border border-hairline bg-night-2/95 backdrop-blur">
      {autoAdvance && (
        <div className="h-1 bg-bone/15">
          <div className="h-full bg-brass transition-[width] duration-1000 ease-linear" style={{ width: `${progress}%` }} />
        </div>
      )}
      <div className="space-y-3 p-5">
        <p className="label-mono text-ash">
          {autoAdvance ? `Next episode in ${Math.max(0, remaining)}s` : 'Up next'}
        </p>
        <div className="flex gap-2">
          <button
            onClick={onPlay}
            className="chamfer-sm focus-brass flex flex-1 items-center justify-center gap-2 bg-brass py-2 font-semibold text-[#17110a] transition hover:bg-brass-hot"
          >
            <PlayIcon className="h-5 w-5" />
            Play now
          </button>
          <button
            onClick={onDismiss}
            className="chamfer-sm focus-brass bg-bone/10 px-4 py-2 font-semibold text-bone transition hover:bg-bone/20"
          >
            {autoAdvance ? 'Cancel' : 'Dismiss'}
          </button>
        </div>
      </div>
    </div>
  );
}
