'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AwaitingStreams } from '@ott/shared';
import { api, ApiError } from '@/lib/api';
import { Button, Card, inputClass } from '@/components/admin/ui';
import { cn } from '@/lib/format';

export default function AwaitingAdmin() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'awaiting-streams'],
    queryFn: () => api<AwaitingStreams>('/admin/awaiting-streams'),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.015em]">Awaiting streams</h1>
        <p className="mt-1 text-sm text-ash">
          Everything in the catalog with no stream attached yet — movies and individual episodes, across every title.
        </p>
      </div>

      {isLoading && <p className="text-sm text-ash">Loading…</p>}

      {data && data.movies.length === 0 && data.episodes.length === 0 && (
        <Card>
          <p className="text-ash">Nothing awaiting a stream — the whole catalog has one attached.</p>
        </Card>
      )}

      {data && data.movies.length > 0 && <MoviesTable movies={data.movies} />}
      {data && data.episodes.length > 0 && <EpisodesTable episodes={data.episodes} />}
    </div>
  );
}

function MoviesTable({ movies }: { movies: AwaitingStreams['movies'] }) {
  const client = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const attach = useMutation({
    mutationFn: ({ id, streamPath }: { id: string; streamPath: string }) =>
      api(`/admin/titles/${id}/stream`, { method: 'PATCH', body: { streamPath } }),
    onSuccess: (_res, { id }) => {
      setErrors((prev) => ({ ...prev, [id]: '' }));
      void client.invalidateQueries({ queryKey: ['admin', 'awaiting-streams'] });
      void client.invalidateQueries({ queryKey: ['admin', 'titles'] });
    },
    onError: (err, { id }) =>
      setErrors((prev) => ({ ...prev, [id]: err instanceof ApiError ? err.message : 'Could not attach' })),
  });

  return (
    <section className="space-y-3">
      <h2 className="label-mono text-ash-dim">Movies · {movies.length}</h2>
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="label-mono border-b border-hairline text-left text-ash-dim">
            <tr>
              <th className="px-4 py-3 font-normal">Name</th>
              <th className="px-4 py-3 font-normal">Status</th>
              <th className="px-4 py-3 font-normal">Attach stream</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {movies.map((movie) => (
              <tr key={movie.id}>
                <td className="px-4 py-3 font-medium">
                  <Link href={`/admin/titles/${movie.id}`} className="focus-brass hover:text-brass-hot">
                    {movie.name}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      'label-mono px-2 py-0.5',
                      movie.isPublished ? 'bg-signal-ok/15 text-signal-ok' : 'bg-bone/10 text-ash-dim',
                    )}
                  >
                    {movie.isPublished ? 'Published' : 'Draft'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <input
                      className={cn(inputClass, 'w-72')}
                      placeholder="vod/movie.mp4"
                      value={drafts[movie.id] ?? ''}
                      onChange={(e) => setDrafts((prev) => ({ ...prev, [movie.id]: e.target.value }))}
                    />
                    <Button
                      variant="ghost"
                      disabled={!drafts[movie.id]?.trim() || attach.isPending}
                      onClick={() => attach.mutate({ id: movie.id, streamPath: drafts[movie.id].trim() })}
                    >
                      Attach
                    </Button>
                  </div>
                  {errors[movie.id] && <p className="mt-1 text-xs text-signal-bad">{errors[movie.id]}</p>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </section>
  );
}

function EpisodesTable({ episodes }: { episodes: AwaitingStreams['episodes'] }) {
  return (
    <section className="space-y-3">
      <h2 className="label-mono text-ash-dim">Episodes · {episodes.length}</h2>
      <p className="chamfer-sm border border-hairline bg-night-2 px-3 py-2 text-sm text-ash">
        No filename-matching here — episode paths are attached in bulk from each title's season, since a season's
        files usually land together. Jump to the exact episode below, or use &ldquo;Bulk attach streams&rdquo; on the
        season.
      </p>
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="label-mono border-b border-hairline text-left text-ash-dim">
            <tr>
              <th className="px-4 py-3 font-normal">Title</th>
              <th className="px-4 py-3 font-normal">Episode</th>
              <th className="px-4 py-3 font-normal">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {episodes.map((ep) => (
              <tr key={ep.id}>
                <td className="px-4 py-3 font-medium">{ep.titleName}</td>
                <td className="px-4 py-3 text-ash">
                  S{ep.seasonNumber} E{ep.number} · {ep.name}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      'label-mono px-2 py-0.5',
                      ep.titleIsPublished ? 'bg-signal-ok/15 text-signal-ok' : 'bg-bone/10 text-ash-dim',
                    )}
                  >
                    {ep.titleIsPublished ? 'Published' : 'Draft'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/admin/titles/${ep.titleId}?episode=${ep.id}`}
                    className="focus-brass label-mono text-brass hover:text-brass-hot"
                  >
                    Open →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </section>
  );
}
