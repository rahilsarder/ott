'use client';

import type { BrowseFacets, FacetBucket } from '@ott/shared';
import { cn } from '@/lib/format';

export type FacetKey = 'type' | 'genre' | 'language';

const GROUPS: { key: FacetKey; title: string }[] = [
  // Language first: for a multi-language catalogue it is the filter people
  // reach for before anything else.
  { key: 'language', title: 'Language' },
  { key: 'type', title: 'Type' },
  { key: 'genre', title: 'Genre' },
];

/**
 * Multi-select facets with live counts.
 *
 * At a hundred titles chips are enough; at a couple of thousand people combine
 * filters, and the count is what tells them whether a combination is worth
 * picking before they commit to it.
 */
export function FacetRail({
  facets,
  selected,
  onToggle,
  hideType,
  className,
}: {
  facets: BrowseFacets;
  selected: Record<FacetKey, string[]>;
  onToggle: (key: FacetKey, value: string) => void;
  /** Set on a page already locked to one type — the facet would just repeat what the page title already says. */
  hideType?: boolean;
  className?: string;
}) {
  const groups = hideType ? GROUPS.filter((g) => g.key !== 'type') : GROUPS;

  return (
    <div className={cn('flex flex-col gap-6', className)}>
      {groups.map(({ key, title }) => {
        const buckets = facets[key];
        if (!buckets.length) return null;

        return (
          <section key={key} className="flex flex-col gap-2">
            <h3 className="label-mono text-ash-dim">{title}</h3>
            {buckets.map((bucket) => (
              <FacetOption
                key={bucket.value}
                bucket={bucket}
                on={selected[key].includes(bucket.value)}
                onClick={() => onToggle(key, bucket.value)}
              />
            ))}
          </section>
        );
      })}
    </div>
  );
}

function FacetOption({ bucket, on, onClick }: { bucket: FacetBucket; on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        'focus-brass flex items-center gap-2.5 text-left text-[0.8125rem] transition',
        on ? 'text-bone' : 'text-ash hover:text-bone',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'chamfer-sm size-3 shrink-0 border transition',
          on ? 'border-brass bg-brass' : 'border-ash-dim',
        )}
      />
      <span className="truncate">{bucket.label}</span>
      <span className="label-mono ml-auto shrink-0 tabular-nums text-ash-dim">{bucket.count}</span>
    </button>
  );
}
