'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type { Channel, TitleCard as TitleCardModel } from '@ott/shared';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { formatRating } from '@/lib/format';
import { PosterCard } from '@/projection/cards';
import { TabBar, TopNav } from '@/projection/shell';
import { LiveDot, LocalTime } from '@/projection/ui';

interface SearchResults {
  query: string;
  titles: TitleCardModel[];
  channels: Channel[];
}

export default function SearchPage() {
  return (
    <Suspense fallback={null}>
      <Search />
    </Suspense>
  );
}

function Search() {
  const params = useSearchParams();
  const router = useRouter();
  const { profile, user } = useSession();
  const initial = params.get('q') ?? '';

  const [input, setInput] = useState(initial);
  const [debounced, setDebounced] = useState(initial);

  // Debounced so typing does not fire a request per keystroke, and mirrored
  // into the URL so a result set can be shared or reloaded.
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(input);
      router.replace(input.trim() ? `/search?q=${encodeURIComponent(input.trim())}` : '/search', { scroll: false });
    }, 280);
    return () => clearTimeout(timer);
  }, [input, router]);

  const { data, isFetching } = useQuery({
    queryKey: ['search', debounced],
    queryFn: () => api<SearchResults>(`/search?q=${encodeURIComponent(debounced)}`),
    enabled: debounced.trim().length >= 2,
  });

  const empty = data && data.titles.length === 0 && data.channels.length === 0;

  return (
    <div className="min-h-dvh bg-night pb-24 font-projection text-bone md:pb-16">
      <TopNav />

      <main className="flex flex-col gap-8 px-4 py-6 md:px-12 md:py-8">
        <label className="flex items-center gap-3 border-b border-brass pb-3">
          <span className="sr-only">Search</span>
          <input
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Films, series, channels, people"
            className="flex-1 bg-transparent text-2xl font-medium tracking-[-0.02em] text-bone outline-none placeholder:text-ash-dim"
          />
          {isFetching && <span className="label-mono shrink-0 text-ash-dim">Searching…</span>}
        </label>

        {debounced.trim().length < 2 && (
          <p className="text-sm text-ash">Type at least two characters.</p>
        )}

        {empty && !isFetching && (
          <p className="text-sm text-ash">
            No results for <span className="text-bone">{debounced}</span>.
          </p>
        )}

        {/* Live first: a channel is watchable now, a film is watchable whenever. */}
        {data && data.channels.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="label-mono flex items-center gap-2 text-ash-dim">
              On air <span className="text-brass">{data.channels.length}</span>
            </h2>
            <div className="flex flex-col">
              {data.channels.map((channel) => (
                <Link
                  key={channel.id}
                  href={`/watch/channel/${channel.id}`}
                  className="focus-brass flex items-center gap-3 border-t border-hairline py-2.5 no-underline transition hover:bg-brass/5"
                >
                  <span className="chamfer-sm relative size-10 shrink-0 overflow-hidden bg-night-3">
                    {channel.logoUrl && (
                      <Image src={channel.logoUrl} alt="" fill sizes="40px" className="object-cover" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <strong className="block truncate text-[0.8125rem] font-semibold">{channel.name}</strong>
                    <span className="label-mono block truncate text-ash-dim">
                      {channel.now?.title ?? channel.category}
                    </span>
                  </span>
                  <span className="label-mono ml-auto flex shrink-0 items-center gap-1.5 text-brass-hot">
                    <LiveDot />
                    {channel.now ? <LocalTime iso={channel.now.endsAt} /> : 'Live'}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {data && data.titles.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="label-mono flex items-center gap-2 text-ash-dim">
              Titles <span className="text-brass">{data.titles.length}</span>
            </h2>
            <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
              {data.titles.map((title) => (
                <PosterCard
                  key={title.id}
                  title={title}
                  className="w-full"
                  tags={title.rating ? [formatRating(title.rating)] : undefined}
                />
              ))}
            </div>
          </section>
        )}
      </main>

      <TabBar />
    </div>
  );
}
