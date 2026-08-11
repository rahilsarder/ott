'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TitleCard } from '@ott/shared';
import { api } from './api';
import { useSession } from './session';

export const watchlistKey = ['watchlist'] as const;

export function useWatchlistQuery() {
  const { profile } = useSession();
  return useQuery({
    queryKey: watchlistKey,
    queryFn: () => api<TitleCard[]>('/watchlist'),
    enabled: Boolean(profile),
    staleTime: 30_000,
  });
}

/** Membership plus an optimistic toggle for a single title. */
export function useWatchlist(titleId: string) {
  const client = useQueryClient();
  const { profile } = useSession();
  const { data } = useWatchlistQuery();
  const inList = Boolean(data?.some((t) => t.id === titleId));

  const mutation = useMutation({
    mutationFn: async () => {
      if (inList) await api<void>(`/watchlist/${titleId}`, { method: 'DELETE' });
      else await api<void>('/watchlist', { method: 'POST', body: { titleId } });
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: watchlistKey });
      void client.invalidateQueries({ queryKey: ['home'] });
    },
  });

  return {
    inList,
    pending: mutation.isPending || !profile,
    toggle: () => (profile ? mutation.mutateAsync() : Promise.resolve()),
  };
}
