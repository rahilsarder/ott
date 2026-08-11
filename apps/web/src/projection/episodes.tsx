'use client';

import Link from 'next/link';
import type { EpisodeSummary, SeasonSummary } from '@ott/shared';
import { cn, formatDuration } from '@/lib/format';
import { Plate } from './Plate';

/**
 * Season buttons rather than a dropdown.
 *
 * Three seasons fit as buttons with their episode counts on show; a dropdown
 * hides how much there is. Above about eight it would have to become one.
 */
export function SeasonPicker({
  seasons,
  activeIndex,
  onSelect,
}: {
  seasons: SeasonSummary[];
  activeIndex: number;
  onSelect: (index: number) => void;
}) {
  if (seasons.length <= 1) return null;

  return (
    <div className="no-scrollbar flex gap-1.5 overflow-x-auto" role="tablist" aria-label="Seasons">
      {seasons.map((season, index) => {
        const active = index === activeIndex;
        return (
          <button
            key={season.id}
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(index)}
            className={cn(
              'chamfer-sm focus-brass label-mono shrink-0 px-3 py-2 transition',
              active
                ? 'bg-brass text-[#17110a]'
                : 'border border-hairline text-ash hover:border-brass hover:text-brass-hot',
            )}
          >
            {season.name || `Season ${season.number}`}
            <span className={cn('ml-1.5', active ? 'text-[#17110a]/60' : 'text-ash-dim')}>
              {season.episodes.length}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * One episode, laid flat.
 *
 * The one card that changes arrangement: scanning twenty-one items vertically
 * beats scrolling a horizontal row, so the still moves left and the text sits
 * beside it. A rail would be actively wrong here.
 */
export function EpisodeRow({ episode, href }: { episode: EpisodeSummary; href: string }) {
  const awaiting = !episode.playable;
  const percent =
    episode.progressSec && episode.durationSec
      ? Math.min(100, (episode.progressSec / episode.durationSec) * 100)
      : 0;
  const inProgress = percent > 2 && percent < 95;

  const body = (
    <>
      <span className="relative w-32 shrink-0 md:w-40">
        <Plate
          src={episode.stillUrl}
          alt=""
          ratio="aspect-video"
          sizes="160px"
          scrim={false}
          className={cn('chamfer-sm', awaiting && 'grayscale brightness-[0.4]')}
        />
        {percent > 0 && (
          <span className="absolute inset-x-0 bottom-0 z-3 h-0.5 bg-bone/15">
            <span className="block h-full bg-brass" style={{ width: `${percent}%` }} />
          </span>
        )}
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-baseline gap-2">
          <span className="font-projection-mono text-[0.6875rem] tabular-nums text-brass">
            {String(episode.number).padStart(2, '0')}
          </span>
          <strong className={cn('truncate text-sm font-semibold', awaiting && 'text-ash-dim')}>{episode.name}</strong>
          <span className="label-mono ml-auto shrink-0 text-ash-dim">
            {awaiting
              ? 'Awaiting stream'
              : inProgress && episode.durationSec && episode.progressSec
                ? `${formatDuration(episode.durationSec - episode.progressSec)} left`
                : formatDuration(episode.durationSec)}
          </span>
        </span>
        {episode.synopsis && (
          <span className={cn('line-clamp-2 text-xs', awaiting ? 'text-ash-dim' : 'text-ash')}>
            {episode.synopsis}
          </span>
        )}
      </span>
    </>
  );

  const shell = cn(
    'flex items-start gap-4 border-t border-hairline px-4 py-3 transition md:px-0',
    // Your place is marked, not hunted for.
    inProgress && !awaiting && 'bg-brass/5',
    awaiting ? 'cursor-default' : 'hover:bg-brass/5',
  );

  // Shown but not linked — metadata is in from the import, the file is not.
  if (awaiting) {
    return <div className={shell}>{body}</div>;
  }

  return (
    <Link href={href} className={cn(shell, 'focus-brass no-underline')}>
      {body}
    </Link>
  );
}
