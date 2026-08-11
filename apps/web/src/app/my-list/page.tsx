'use client';

import Link from 'next/link';
import { AuthGate } from '@/components/AuthGate';
import { PosterCard } from '@/projection/cards';
import { TabBar, TopNav } from '@/projection/shell';
import { Button } from '@/projection/ui';
import { useSession } from '@/lib/session';
import { useWatchlistQuery } from '@/lib/use-watchlist';

export default function MyListPage() {
  return (
    <AuthGate>
      <MyList />
    </AuthGate>
  );
}

function MyList() {
  const { profile, user } = useSession();
  const { data, isLoading } = useWatchlistQuery();

  return (
    <div className="min-h-dvh bg-night pb-24 font-projection text-bone md:pb-16">
      <TopNav />

      <main className="px-4 pt-8 pb-16 md:px-12">
        <h1 className="mb-6 text-xl font-semibold tracking-[-0.015em] md:text-2xl">Saved</h1>

        {isLoading && (
          <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="chamfer-md aspect-[2/3] animate-pulse bg-night-2" />
            ))}
          </div>
        )}

        {!isLoading && !data?.length && (
          <div className="grid place-items-center border border-dashed border-hairline py-24 text-center">
            <div className="flex flex-col items-center gap-3">
              <p className="text-sm text-ash">Nothing saved yet.</p>
              <Link href="/">
                <Button>Browse titles</Button>
              </Link>
            </div>
          </div>
        )}

        {!isLoading && data && data.length > 0 && (
          <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
            {data.map((title) => (
              <PosterCard key={title.id} title={title} className="w-full" />
            ))}
          </div>
        )}
      </main>

      <TabBar />
    </div>
  );
}
