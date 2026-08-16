'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card } from '@/components/admin/ui';

interface AdminChannel {
  id: string;
  name: string;
  isPublished: boolean;
}
interface AdminTitleStats {
  total: number;
  published: number;
  movies: number;
  series: number;
}

export default function AdminOverview() {
  // Catalog-wide counts, not derived from a page of /admin/titles — that
  // endpoint is paginated and would only ever reflect one page's worth.
  const { data: stats } = useQuery({
    queryKey: ['admin', 'titles', 'stats'],
    queryFn: () => api<AdminTitleStats>('/admin/titles/stats'),
  });
  const { data: channels } = useQuery({
    queryKey: ['admin', 'channels'],
    queryFn: () => api<AdminChannel[]>('/admin/channels'),
  });

  const liveChannels = channels?.filter((c) => c.isPublished).length ?? 0;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-[-0.015em]">Overview</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Titles" value={stats?.total ?? 0} sub={`${stats?.published ?? 0} published`} />
        <Stat label="Channels" value={channels?.length ?? 0} sub={`${liveChannels} live`} />
        <Stat label="Series" value={stats?.series ?? 0} sub="in catalog" />
        <Stat label="Movies" value={stats?.movies ?? 0} sub="in catalog" />
      </div>

      <Card className="space-y-3">
        <h2 className="font-semibold">Getting started</h2>
        <ol className="list-inside list-decimal space-y-2 text-sm text-ash">
          <li>
            Add a channel under{' '}
            <Link href="/admin/channels" className="text-bone underline decoration-hairline underline-offset-2">
              Channels
            </Link>{' '}
            with the Flussonic stream name (for example{' '}
            <code className="bg-bone/10 px-1 text-xs">news24</code>, not a full URL).
          </li>
          <li>Use the built-in test player to confirm the stream plays before publishing it.</li>
          <li>
            Add VOD under{' '}
            <Link href="/admin/titles" className="text-bone underline decoration-hairline underline-offset-2">
              Titles
            </Link>
            ; series carry a stream path per episode.
          </li>
          <li>
            Optionally import an XMLTV schedule under{' '}
            <Link href="/admin/epg" className="text-bone underline decoration-hairline underline-offset-2">
              EPG
            </Link>{' '}
            so the guide and Live rail show what is on now.
          </li>
          <li>
            Check{' '}
            <Link href="/admin/awaiting" className="text-bone underline decoration-hairline underline-offset-2">
              Awaiting
            </Link>{' '}
            for everything published with no stream attached yet, across the whole catalog.
          </li>
        </ol>
      </Card>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: number; sub: string }) {
  return (
    <Card>
      <p className="label-mono text-ash-dim">{label}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-ash-dim">{sub}</p>
    </Card>
  );
}
