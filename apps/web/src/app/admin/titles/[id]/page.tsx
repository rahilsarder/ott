'use client';

import { Suspense, use } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { UpsertTitleInput } from '@ott/shared';
import { api } from '@/lib/api';
import { BLANK_TITLE, TitleEditor } from '@/components/admin/TitleEditor';

interface AdminTitleDetail extends Omit<UpsertTitleInput, 'genreIds'> {
  id: string;
  updatedAt: string;
  genres: { genre: { id: string } }[];
}

export default function EditTitlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'title', id],
    queryFn: () => api<AdminTitleDetail>(`/admin/titles/${id}`),
  });

  if (isLoading || !data) return <p className="text-sm text-ash">Loading…</p>;

  // The API returns genres as a join-table shape; the editor wants plain ids.
  const initial: UpsertTitleInput = {
    ...BLANK_TITLE,
    ...data,
    genreIds: data.genres.map((g) => g.genre.id),
  };

  /*
   * The editor keeps its draft in local state, so it will not pick up fields a
   * TMDB import just wrote. Keying on updatedAt remounts it with fresh data the
   * moment the refetched record changes, and only then.
   */
  return (
    <Suspense fallback={null}>
      <TitleEditor key={data.updatedAt} titleId={id} initial={initial} />
    </Suspense>
  );
}
