'use client';

import { useEffect } from 'react';
import { CloseIcon } from '@/components/icons';

/**
 * Almost every trailer in this catalogue only exists on YouTube, so this
 * embeds rather than streaming a Flussonic asset. `youtube-nocookie.com`
 * keeps YouTube from setting tracking cookies until the viewer actually
 * interacts with the embed.
 */
export function TrailerModal({ youtubeId, onClose }: { youtubeId: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Trailer"
      className="fixed inset-0 z-50 grid place-items-center bg-night/90 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="chamfer-lg relative w-full max-w-4xl overflow-hidden bg-black shadow-[0_0_120px_rgb(0_0_0/0.6)]"
        style={{ aspectRatio: '16 / 9' }}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close trailer"
          className="focus-brass chamfer-sm absolute top-3 right-3 z-10 bg-night/60 p-2 backdrop-blur transition hover:bg-night/85"
        >
          <CloseIcon className="h-5 w-5" />
        </button>
        <iframe
          className="h-full w-full"
          src={`https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&mute=1&rel=0&modestbranding=1`}
          title="Trailer"
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
        />
      </div>
    </div>
  );
}
