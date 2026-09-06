'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RESUME_MAX_FRACTION, RESUME_MIN_FRACTION, type ContinueHydrationResult, type ContinueItem } from '@ott/shared';
import { api } from './api';
import { listLocalProgress, type LocalProgressItem } from './local-progress';

const MAX_ITEMS = 20;

/**
 * The anonymous equivalent of the server's "Carry on watching" rail. A
 * signed-in profile's progress lives in real WatchProgress rows and is
 * already spliced server-side (see RailsService.home); an anonymous viewer
 * has no profile to scope those to, so this rebuilds the same
 * ContinueItem[] shape from localStorage instead — same resume-fraction
 * bounds, same cap, so it reads as one consistent feature either way.
 */
export function useLocalContinueWatching(enabled: boolean): ContinueItem[] {
  const [localItems, setLocalItems] = useState<LocalProgressItem[]>([]);

  // localStorage doesn't exist during SSR, and reading it synchronously
  // during render would produce a server/client hydration mismatch anyway —
  // populate it once, after mount.
  useEffect(() => {
    if (enabled) setLocalItems(listLocalProgress());
  }, [enabled]);

  const eligible = useMemo(
    () =>
      localItems
        .filter((item) => {
          const fraction = item.durationSec > 0 ? item.positionSec / item.durationSec : 0;
          return fraction > RESUME_MIN_FRACTION && fraction < RESUME_MAX_FRACTION;
        })
        .slice(0, MAX_ITEMS),
    [localItems],
  );

  const { data: hydrated } = useQuery({
    queryKey: ['continue-hydrate', eligible.map((item) => `${item.kind}:${item.id}`).join(',')],
    queryFn: () =>
      api<ContinueHydrationResult[]>('/catalog/continue-hydrate', {
        method: 'POST',
        body: { items: eligible.map((item) => ({ kind: item.kind, id: item.id })) },
      }),
    enabled: enabled && eligible.length > 0,
  });

  return useMemo(() => {
    if (!hydrated) return [];
    const byKey = new Map(eligible.map((item) => [`${item.kind}:${item.id}`, item]));
    return hydrated
      .map((result): ContinueItem | null => {
        // Hydration silently drops ids that no longer resolve (deleted/unpublished) —
        // a stale local entry for one of those just never gets rendered.
        const local = byKey.get(`${result.kind}:${result.id}`);
        if (!local) return null;
        return {
          kind: result.kind,
          id: result.id,
          title: result.title,
          label: result.label,
          positionSec: local.positionSec,
          durationSec: local.durationSec,
          percent: local.durationSec > 0 ? Math.round((local.positionSec / local.durationSec) * 100) : 0,
        };
      })
      .filter((item): item is ContinueItem => item !== null);
  }, [hydrated, eligible]);
}
