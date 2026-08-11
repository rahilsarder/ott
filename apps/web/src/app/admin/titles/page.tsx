'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BulkPublishResult } from '@ott/shared';
import { api } from '@/lib/api';
import { Banner, Button, Card, inputClass } from '@/components/admin/ui';
import { cn } from '@/lib/format';
import { PencilIcon, TrashIcon } from '@/components/icons';

interface AdminTitleRow {
  id: string;
  slug: string;
  name: string;
  type: 'MOVIE' | 'SERIES';
  year: number | null;
  isPublished: boolean;
  streamPath: string | null;
  _count: { episodes: number; seasons: number };
}

export default function TitlesAdmin() {
  const client = useQueryClient();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [skipped, setSkipped] = useState<BulkPublishResult['skipped']>(undefined);

  const { data: titles, isLoading } = useQuery({
    queryKey: ['admin', 'titles', search],
    queryFn: () => api<AdminTitleRow[]>(`/admin/titles${search ? `?q=${encodeURIComponent(search)}` : ''}`),
  });

  const invalidate = () => void client.invalidateQueries({ queryKey: ['admin', 'titles'] });

  const remove = useMutation({
    mutationFn: (id: string) => api<void>(`/admin/titles/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });

  const bulkPublish = useMutation({
    mutationFn: (isPublished: boolean) =>
      api<BulkPublishResult>('/admin/titles/bulk-publish', {
        method: 'PATCH',
        body: { ids: [...selected], isPublished },
      }),
    onSuccess: (res) => {
      setSelected(new Set());
      setSkipped(res.skipped?.length ? res.skipped : undefined);
      invalidate();
    },
  });

  const toggleSelected = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allSelected = Boolean(titles?.length) && selected.size === titles?.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-[-0.015em]">Titles</h1>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search titles"
          className={cn(inputClass, 'ml-auto w-full sm:w-64')}
        />
        <Link href="/admin/titles/new">
          <Button>New title</Button>
        </Link>
      </div>

      {isLoading && <p className="text-sm text-ash">Loading…</p>}

      {!isLoading && !titles?.length && (
        <Card>
          <p className="text-ash">No titles yet. Create one to build your VOD catalog.</p>
        </Card>
      )}

      {skipped && skipped.length > 0 && (
        <Banner tone="error">
          {skipped.length} title{skipped.length === 1 ? '' : 's'} could not publish — no stream path set:{' '}
          {skipped.map((s) => s.name).join(', ')}.
        </Banner>
      )}

      {selected.size > 0 && (
        <div className="chamfer-sm flex items-center gap-3 border border-brass/40 bg-brass/10 px-4 py-2.5 text-sm">
          <span className="label-mono text-brass-hot">{selected.size} selected</span>
          <Button variant="ghost" onClick={() => bulkPublish.mutate(true)} disabled={bulkPublish.isPending}>
            Publish
          </Button>
          <Button variant="ghost" onClick={() => bulkPublish.mutate(false)} disabled={bulkPublish.isPending}>
            Unpublish
          </Button>
          <button
            onClick={() => setSelected(new Set())}
            className="focus-brass ml-auto text-ash-dim transition hover:text-bone"
          >
            Clear
          </button>
        </div>
      )}

      {titles && titles.length > 0 && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="label-mono border-b border-hairline text-left text-ash-dim">
              <tr>
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={() => setSelected(allSelected ? new Set() : new Set(titles.map((t) => t.id)))}
                    aria-label="Select all titles"
                  />
                </th>
                <th className="px-4 py-3 font-normal">Name</th>
                <th className="px-4 py-3 font-normal">Type</th>
                <th className="px-4 py-3 font-normal">Year</th>
                <th className="px-4 py-3 font-normal">Stream</th>
                <th className="px-4 py-3 font-normal">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {titles.map((title) => (
                <tr key={title.id} className="transition hover:bg-bone/5">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(title.id)}
                      onChange={() => toggleSelected(title.id)}
                      aria-label={`Select ${title.name}`}
                    />
                  </td>
                  <td className="px-4 py-3 font-medium">{title.name}</td>
                  <td className="px-4 py-3 text-ash">
                    {title.type === 'SERIES' ? `Series · ${title._count.episodes} ep` : 'Movie'}
                  </td>
                  <td className="px-4 py-3 text-ash">{title.year ?? '—'}</td>
                  <td className="px-4 py-3">
                    {title.type === 'SERIES' ? (
                      <span className="label-mono text-ash-dim">per episode</span>
                    ) : title.streamPath ? (
                      <code className="bg-bone/10 px-1.5 py-0.5 text-xs">{title.streamPath}</code>
                    ) : (
                      <span className="label-mono text-signal-warn">missing</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        'label-mono px-2 py-0.5',
                        title.isPublished ? 'bg-signal-ok/15 text-signal-ok' : 'bg-bone/10 text-ash-dim',
                      )}
                    >
                      {title.isPublished ? 'Published' : 'Draft'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Link
                        href={`/admin/titles/${title.id}`}
                        aria-label={`Edit ${title.name}`}
                        className="focus-brass rounded p-1.5 text-ash transition hover:bg-bone/10 hover:text-bone"
                      >
                        <PencilIcon className="h-4 w-4" />
                      </Link>
                      <button
                        onClick={() => {
                          if (confirm(`Delete ${title.name}? This also deletes its episodes.`)) remove.mutate(title.id);
                        }}
                        aria-label={`Delete ${title.name}`}
                        className="focus-brass rounded p-1.5 text-ash transition hover:bg-signal-bad/15 hover:text-signal-bad"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
