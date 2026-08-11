'use client';

import type { Rail } from '@ott/shared';
import { LiveCard, ShelfCard } from './cards';
import { SectionHead } from './ui';

/**
 * One shelf.
 *
 * A scroller of fixed-size cards rather than fractional columns — a 1fr column
 * on a wide screen makes a poster enormous, and a constant size means a card
 * looks the same on every display.
 *
 * The first card rests expanded, and hovering any card expands that one instead
 * while the rest shift along. All of that lives in theme.css so the width and
 * the artwork stay in step.
 */
export function RailRow({ rail, flip }: { rail: Rail; flip: boolean }) {
  const items = buildItems(rail, flip);
  if (items.length === 0) return null;

  return (
    <section className="flex flex-col gap-3 py-4">
      <SectionHead title={rail.title} meta={rail.meta} href={rail.href} className="px-4 md:px-12" />
      <div className="shelf-row no-scrollbar flex gap-2.5 overflow-x-auto px-4 pb-1 md:px-12">{items}</div>
    </section>
  );
}

function buildItems(rail: Rail, flip: boolean): React.ReactNode[] {
  // Channels are peers carrying the same facts, so none of them leads.
  if (rail.kind === 'live' && rail.channels?.length) {
    return rail.channels.map((channel) => (
      <LiveCard
        key={channel.id}
        name={channel.name}
        logoUrl={channel.logoUrl}
        now={channel.now}
        href={`/watch/channel/${channel.id}`}
        // Matches the shelf's card height so live rows line up with the rest.
        className="h-[var(--card-h)] w-[var(--card-wide)] md:w-[var(--card-wide)]"
      />
    ));
  }

  if (rail.kind === 'continue' && rail.continueItems?.length) {
    const anchorIndex = flip ? rail.continueItems.length - 1 : 0;
    return rail.continueItems.map((item, index) => (
      <ShelfCard
        key={`${item.kind}-${item.id}`}
        title={item.title}
        href={`/watch/${item.kind}/${item.id}`}
        tick={item.label}
        percent={item.percent}
        isAnchor={index === anchorIndex}
      />
    ));
  }

  if (rail.titles?.length) {
    // Alternating which card rests expanded keeps consecutive shelves from
    // falling into the same rhythm.
    const anchorIndex = flip ? rail.titles.length - 1 : 0;
    return rail.titles.map((title, index) => (
      <ShelfCard key={title.id} title={title} isAnchor={index === anchorIndex} />
    ));
  }

  return [];
}

export function RailRowSkeleton() {
  return (
    <section className="flex flex-col gap-3 py-4">
      <div className="mx-4 h-6 w-44 animate-pulse bg-night-2 md:mx-12" />
      <div className="shelf-row flex gap-2.5 overflow-hidden px-4 md:px-12">
        <div className="shelf-card is-anchor chamfer-md shrink-0 animate-pulse bg-night-2" />
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="shelf-card chamfer-md shrink-0 animate-pulse bg-night-2"
            style={{ animationDelay: `${i * 70}ms` }}
          />
        ))}
      </div>
    </section>
  );
}
