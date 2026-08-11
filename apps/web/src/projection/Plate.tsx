import Image from 'next/image';
import { cn } from '@/lib/format';

/**
 * The lit artwork surface every card is built on.
 *
 * Carries the grain and the bottom scrim so titles stay legible over any image,
 * and reserves its aspect ratio before the image loads — a card that resizes on
 * load makes a whole grid jump, which is very visible at two thousand titles.
 */
export function Plate({
  src,
  alt = '',
  ratio,
  sizes,
  priority,
  scrim = true,
  className,
  fallback,
}: {
  src?: string | null;
  alt?: string;
  /** Tailwind aspect class, e.g. `aspect-[2/3]`. */
  ratio: string;
  sizes?: string;
  priority?: boolean;
  /** Off for surfaces that carry their text outside the image. */
  scrim?: boolean;
  className?: string;
  /** Shown when there is no artwork — usually the title's initial. */
  fallback?: React.ReactNode;
}) {
  return (
    <span className={cn('grain-over relative block w-full overflow-hidden bg-night-3', ratio, className)}>
      {src ? (
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes ?? '(max-width: 768px) 40vw, 240px'}
          priority={priority}
          className="object-cover"
        />
      ) : (
        <span className="grid h-full w-full place-items-center text-ash-dim">{fallback}</span>
      )}

      {scrim && (
        <span className="absolute inset-0 bg-linear-to-t from-night/95 via-night/15 to-transparent" />
      )}
    </span>
  );
}
