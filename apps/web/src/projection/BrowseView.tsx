'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { BrowseResponse, BrowseSort, TitleType } from '@ott/shared';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { AnchorCard, PosterCard } from './cards';
import { FacetRail, type FacetKey } from './FacetRail';
import { TabBar, TopNav } from './shell';
import { Button, Chip } from './ui';

/** Every twelfth tile goes wide — enough rhythm to break a wall of posters. */
const WIDE_EVERY = 12;

const SORTS: { value: BrowseSort; label: string }[] = [
  { value: 'recent', label: 'Recently added' },
  { value: 'title', label: 'A–Z' },
  { value: 'year', label: 'Newest first' },
];

/**
 * The faceted grid behind `/movies`, `/series`, and the type-agnostic
 * `/browse` (still reachable from a genre rail's "All →" and a title
 * page's "More like this", where mixing both types is correct — a genre spans
 * both). `lockedType` is what tells the three apart: set, it pins the query to
 * one type and hides the now-redundant Type facet; unset, `/browse` behaves as
 * it always has.
 */
export function BrowseView({
  lockedType,
  title,
  basePath,
}: {
  lockedType?: TitleType;
  /** "Movies" / "Series" and "N movies" / "N series", or "titles" for the unlocked fallback. */
  title: string;
  /** Where filters and sort get written via `router.replace`. */
  basePath: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const { profile, user } = useSession();
  const [sheetOpen, setSheetOpen] = useState(false);

  const selected = useMemo<Record<FacetKey, string[]>>(
    () => ({
      type: lockedType ? [lockedType] : (params.get('type')?.split(',').filter(Boolean) ?? []),
      genre: params.get('genre')?.split(',').filter(Boolean) ?? [],
      language: params.get('language')?.split(',').filter(Boolean) ?? [],
    }),
    [params, lockedType],
  );
  const sort = (params.get('sort') as BrowseSort) ?? 'recent';

  const queryString = useMemo(() => {
    const search = new URLSearchParams();
    for (const key of ['type', 'genre', 'language'] as FacetKey[]) {
      if (selected[key].length) search.set(key, selected[key].join(','));
    }
    if (sort !== 'recent') search.set('sort', sort);
    return search.toString();
  }, [selected, sort]);

  /** Filters live in the URL, so a filtered view is shareable and survives reload. */
  const setParams = useCallback(
    (next: Record<string, string | null>) => {
      const search = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(next)) {
        if (value) search.set(key, value);
        else search.delete(key);
      }
      router.replace(search.toString() ? `${basePath}?${search}` : basePath, { scroll: false });
    },
    [params, router, basePath],
  );

  const toggle = useCallback(
    (key: FacetKey, value: string) => {
      const current = selected[key];
      const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
      setParams({ [key]: next.length ? next.join(',') : null });
    },
    [selected, setParams],
  );

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    // basePath is folded in explicitly rather than relying on the query string
    // alone to keep pages apart — true today (an unfiltered /movies and a
    // manually-filtered /browse?type=MOVIE produce the same string) but not a
    // guarantee worth resting on if either page ever grows a default the URL
    // doesn't carry.
    queryKey: ['browse', basePath, queryString],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api<BrowseResponse>(`/catalog/browse?${queryString}${pageParam ? `&cursor=${pageParam}` : ''}`),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const items = data?.pages.flatMap((page) => page.items) ?? [];
  const facets = data?.pages[0]?.facets;
  const total = data?.pages[0]?.total ?? 0;
  const activeKeys = (lockedType ? (['genre', 'language'] as const) : (['type', 'genre', 'language'] as const));
  const activeCount = activeKeys.reduce((n, key) => n + selected[key].length, 0);

  const labelFor = (key: FacetKey, value: string) =>
    facets?.[key].find((b) => b.value === value)?.label ?? value;

  const clearAll = () => setParams({ ...(lockedType ? {} : { type: null }), genre: null, language: null });

  return (
    <div className="min-h-dvh bg-night pb-24 font-projection text-bone md:pb-16">
      <TopNav />

      <div className="grid md:grid-cols-[212px_minmax(0,1fr)]">
        {/* Desktop: a persistent rail. Phone: the same facets in a sheet. */}
        <aside className="hidden border-r border-hairline p-5 md:block">
          {facets && <FacetRail facets={facets} selected={selected} onToggle={toggle} hideType={Boolean(lockedType)} />}
        </aside>

        <main className="flex flex-col gap-4 p-4 md:p-6">
          <header className="flex flex-wrap items-center gap-3">
            <h1 className="text-sm">
              <b className="tabular-nums">{total}</b> <span className="text-ash">{title}</span>
            </h1>

            <Button
              variant="ghost"
              className="md:hidden"
              onClick={() => setSheetOpen(true)}
            >
              Filters{activeCount > 0 && ` · ${activeCount}`}
            </Button>

            <label className="ml-auto flex items-center gap-2">
              <span className="label-mono text-ash-dim">Sort</span>
              <select
                value={sort}
                onChange={(e) => setParams({ sort: e.target.value === 'recent' ? null : e.target.value })}
                className="chamfer-sm focus-brass border border-hairline bg-night-2 px-2.5 py-1.5 text-xs text-bone outline-none"
              >
                {SORTS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </header>

          {activeCount > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {activeKeys.flatMap((key) =>
                selected[key].map((value) => (
                  <Chip key={`${key}-${value}`} on onClick={() => toggle(key, value)}>
                    {labelFor(key, value)} ✕
                  </Chip>
                )),
              )}
              <Chip onClick={clearAll}>Clear all</Chip>
            </div>
          )}

          {isLoading ? (
            <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
              {Array.from({ length: 16 }).map((_, i) => (
                <div key={i} className="chamfer-md aspect-[2/3] animate-pulse bg-night-2" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="grid place-items-center border border-dashed border-hairline py-24 text-center">
              <div className="flex flex-col items-center gap-3">
                <p className="text-sm text-ash">Nothing matches those filters.</p>
                {activeCount > 0 && (
                  <Button variant="ghost" onClick={clearAll}>
                    Clear filters
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
                {items.map((item, index) =>
                  (index + 1) % WIDE_EVERY === 0 ? (
                    <AnchorCard key={item.id} title={item} className="col-span-2 w-full" />
                  ) : (
                    <PosterCard key={item.id} title={item} className="w-full" />
                  ),
                )}
              </div>

              {hasNextPage && (
                <div className="flex justify-center pt-2">
                  <Button variant="ghost" onClick={() => void fetchNextPage()} disabled={isFetchingNextPage}>
                    {isFetchingNextPage ? 'Loading…' : `Load more (${total - items.length} left)`}
                  </Button>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {sheetOpen && facets && (
        <>
          <button
            aria-label="Close filters"
            onClick={() => setSheetOpen(false)}
            className="fixed inset-0 z-50 bg-night/70 md:hidden"
          />
          <div className="chamfer-lg fixed inset-x-0 bottom-0 z-50 flex max-h-[75dvh] flex-col gap-4 border-t border-brass bg-night-2 p-4 md:hidden">
            <span aria-hidden className="mx-auto h-[3px] w-9 bg-ash-dim" />
            <div className="no-scrollbar flex-1 overflow-y-auto">
              <FacetRail facets={facets} selected={selected} onToggle={toggle} hideType={Boolean(lockedType)} />
            </div>
            <Button onClick={() => setSheetOpen(false)}>Show {total} {title}</Button>
          </div>
        </>
      )}

      <TabBar />
    </div>
  );
}
