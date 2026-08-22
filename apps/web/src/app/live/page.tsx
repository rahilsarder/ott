'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ChannelGroup, Guide } from '@ott/shared';
import { api } from '@/lib/api';
import { formatTime } from '@/lib/format';
import { useSession } from '@/lib/session';
import { TvIcon } from '@/components/icons';
import { LiveCard } from '@/projection/cards';
import { TabBar, TopNav } from '@/projection/shell';
import { Chip, SectionHead, useMounted } from '@/projection/ui';

const GUIDE_HOURS = 4;
const PIXELS_PER_MINUTE = 6;
/** Matches the guide's channel column — `w-40`. */
const CHANNEL_COL_WIDTH = 160;

export default function LivePage() {
  return <LiveView />;
}

function LiveView() {
  const { profile, user } = useSession();
  const [tab, setTab] = useState<'channels' | 'guide'>('channels');

  return (
    <div className="min-h-dvh bg-night pb-24 font-projection text-bone md:pb-16">
      <TopNav />

      <main className="px-4 pt-8 pb-16 md:px-12">
        <div className="mb-6 flex flex-wrap items-center gap-4">
          <h1 className="text-xl font-semibold tracking-[-0.015em] md:text-2xl">Live TV</h1>
          <div className="ml-auto flex gap-1.5">
            <Chip on={tab === 'channels'} onClick={() => setTab('channels')}>
              Channels
            </Chip>
            <Chip on={tab === 'guide'} onClick={() => setTab('guide')}>
              Guide
            </Chip>
          </div>
        </div>

        {tab === 'channels' ? <ChannelGrid /> : <GuideGrid />}
      </main>

      <TabBar />
    </div>
  );
}

function ChannelGrid() {
  const { data, isLoading } = useQuery({
    queryKey: ['channels'],
    queryFn: () => api<ChannelGroup[]>('/channels'),
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="chamfer-md aspect-video animate-pulse bg-night-2" />
        ))}
      </div>
    );
  }

  if (!data?.length) {
    return <EmptyState message="No channels published yet. Add one from the admin area." />;
  }

  return (
    <div className="flex flex-col gap-10">
      {data.map((group) => (
        <section key={group.category}>
          <SectionHead title={group.category} className="mb-4" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {group.channels.map((channel) => (
              <LiveCard
                key={channel.id}
                name={channel.name}
                logoUrl={channel.logoUrl}
                now={channel.now}
                href={`/watch/channel/${channel.id}`}
                className="w-full"
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function GuideGrid() {
  const { data, isLoading } = useQuery({
    queryKey: ['guide'],
    queryFn: () => api<Guide>(`/channels/guide?hours=${GUIDE_HOURS}`),
  });

  const mounted = useMounted();
  // Ticks so the now-line stays honest while someone sits on the guide.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const timeMarkers = useMemo(() => {
    if (!data) return [];
    const start = new Date(data.from);
    start.setMinutes(start.getMinutes() < 30 ? 0 : 30, 0, 0);
    return Array.from({ length: GUIDE_HOURS * 2 }, (_, i) => new Date(start.getTime() + i * 1800_000));
  }, [data]);

  if (isLoading) return <div className="chamfer-md h-96 animate-pulse bg-night-2" />;
  if (!data?.rows.length) return <EmptyState message="No channels published yet." />;

  const windowStart = new Date(data.from).getTime();
  const windowEnd = new Date(data.to).getTime();
  const offsetFor = (iso: string) => ((new Date(iso).getTime() - windowStart) / 60_000) * PIXELS_PER_MINUTE;
  const widthFor = (from: string, to: string) =>
    ((new Date(to).getTime() - new Date(from).getTime()) / 60_000) * PIXELS_PER_MINUTE;
  const showNowLine = mounted && now >= windowStart && now <= windowEnd;
  const nowOffset = ((now - windowStart) / 60_000) * PIXELS_PER_MINUTE;

  return (
    <div className="no-scrollbar overflow-x-auto border border-hairline">
      <div className="relative min-w-max">
        <div className="sticky top-0 z-10 flex bg-night">
          <div className="label-mono w-40 shrink-0 border-r border-hairline px-3 py-2 text-ash-dim">Channel</div>
          <div className="relative h-9" style={{ width: GUIDE_HOURS * 60 * PIXELS_PER_MINUTE }}>
            {timeMarkers.map((marker) => (
              <span
                key={marker.toISOString()}
                className="label-mono absolute top-2.5 text-ash-dim"
                style={{ left: offsetFor(marker.toISOString()) + 4 }}
              >
                {formatTime(marker.toISOString())}
              </span>
            ))}
          </div>
        </div>

        {data.rows.map((row) => (
          <div key={row.channel.id} className="flex border-t border-hairline">
            <Link
              href={`/watch/channel/${row.channel.id}`}
              className="focus-brass flex w-40 shrink-0 items-center gap-2 border-r border-hairline px-3 py-3 transition hover:bg-brass/5"
            >
              <span className="truncate text-sm font-medium">{row.channel.name}</span>
            </Link>

            <div className="relative h-16" style={{ width: GUIDE_HOURS * 60 * PIXELS_PER_MINUTE }}>
              {row.programmes.length === 0 && (
                <span className="absolute top-1/2 left-3 -translate-y-1/2 text-xs text-ash-dim">No guide data</span>
              )}
              {row.programmes.map((programme) => (
                <div
                  key={programme.id}
                  title={programme.description}
                  className="chamfer-sm absolute top-1.5 h-13 overflow-hidden bg-night-2 px-2 py-1.5 ring-1 ring-hairline"
                  style={{
                    left: Math.max(0, offsetFor(programme.startsAt)),
                    width: Math.max(40, widthFor(programme.startsAt, programme.endsAt) - 4),
                  }}
                >
                  <p className="truncate text-xs font-medium">{programme.title}</p>
                  <p className="label-mono truncate text-ash-dim">{formatTime(programme.startsAt)}</p>
                </div>
              ))}
            </div>
          </div>
        ))}

        {showNowLine && (
          <div
            aria-hidden
            className="motion-lamp pointer-events-none absolute top-9 bottom-0 z-20 w-px bg-brass-hot"
            style={{ left: CHANNEL_COL_WIDTH + nowOffset }}
          >
            <span className="absolute -top-1.5 -left-[3px] size-[7px] rounded-full bg-brass-hot" />
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="grid place-items-center border border-dashed border-hairline py-24 text-center">
      <div>
        <TvIcon className="mx-auto mb-3 h-10 w-10 text-ash-dim" />
        <p className="text-sm text-ash">{message}</p>
      </div>
    </div>
  );
}
