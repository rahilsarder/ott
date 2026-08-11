'use client';

import { useEffect, useState } from 'react';
import { PlayIcon } from '@/components/icons';

const COUNTDOWN_SEC = 10;

export function NextEpisodeCard({ onPlay, onDismiss }: { onPlay: () => void; onDismiss: () => void }) {
  const [remaining, setRemaining] = useState(COUNTDOWN_SEC);

  useEffect(() => {
    const timer = setInterval(() => setRemaining((v) => v - 1), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (remaining <= 0) onPlay();
  }, [remaining, onPlay]);

  const progress = ((COUNTDOWN_SEC - remaining) / COUNTDOWN_SEC) * 100;

  return (
    <div className="chamfer-md animate-rise absolute right-6 bottom-28 z-30 w-80 overflow-hidden border border-hairline bg-night-2/95 backdrop-blur">
      <div className="h-1 bg-bone/15">
        <div className="h-full bg-brass transition-[width] duration-1000 ease-linear" style={{ width: `${progress}%` }} />
      </div>
      <div className="space-y-3 p-5">
        <p className="label-mono text-ash">Next episode in {Math.max(0, remaining)}s</p>
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
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
