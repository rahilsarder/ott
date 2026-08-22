'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Channel, HomeResponse } from '@ott/shared';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useWatchlist } from '@/lib/use-watchlist';
import { FeatureFrame, FeatureFrameSkeleton } from '@/projection/FeatureFrame';
import { RailRow, RailRowSkeleton } from '@/projection/RailRow';
import { OnAirStrip, TabBar, TopNav } from '@/projection/shell';

export default function HomePage() {
  return <Home />;
}

function Home() {
  const { profile } = useSession();
  const client = useQueryClient();

  // Both /home and /channels are public — no login needed to browse or
  // watch. profile is only in the key so switching profiles (still possible
  // for a logged-in admin) never shows the previous one's rows.
  const { data, isLoading, error } = useQuery({
    queryKey: ['home', profile?.id],
    queryFn: () => api<HomeResponse>('/home'),
  });

  // The on-air strip is its own query: it changes on the hour, while the rest
  // of home is cached for five minutes.
  const { data: channels } = useQuery({
    queryKey: ['channels-onair'],
    queryFn: async () => {
      const groups = await api<{ category: string; channels: Channel[] }[]>('/channels');
      return groups.flatMap((g) => g.channels);
    },
    staleTime: 60_000,
  });

  return (
    <div className="min-h-dvh bg-night pb-24 font-projection text-bone md:pb-16">
      <TopNav />

      {isLoading || !data ? (
        <>
          <FeatureFrameSkeleton />
          <RailRowSkeleton />
          <RailRowSkeleton />
        </>
      ) : error ? (
        <main className="grid min-h-dvh place-items-center px-6 text-center">
          <div className="flex flex-col gap-2">
            <h1 className="text-xl font-semibold">We couldn&apos;t load your home page</h1>
            <p className="text-sm text-ash">Check that the API is running, then refresh.</p>
          </div>
        </main>
      ) : (
        <main>
          {channels && channels.length > 0 && <OnAirStrip channels={channels} />}

          {data.billboard ? (
            <Billboard title={data.billboard} onSaved={() => client.invalidateQueries({ queryKey: ['home'] })} />
          ) : (
            <section className="grid min-h-[40vh] place-items-center px-6 pt-28 text-center">
              <div className="flex flex-col gap-2">
                <h1 className="text-2xl font-semibold">Nothing published yet</h1>
                <p className="text-sm text-ash">
                  Add titles and channels from the admin area and they will appear here.
                </p>
              </div>
            </section>
          )}

          {/* Alternating anchors: every other shelf leads from the right. */}
          {data.rails.map((rail, index) => (
            <RailRow key={rail.id} rail={rail} flip={index % 2 === 1} />
          ))}
        </main>
      )}

      <TabBar />
    </div>
  );
}

/** Wraps the feature so the save button can own the watchlist mutation. */
function Billboard({ title, onSaved }: { title: HomeResponse['billboard']; onSaved: () => void }) {
  const { inList, toggle, pending } = useWatchlist(title!.id);

  const resume = title!.type === 'SERIES' ? `/title/${title!.slug}` : `/watch/movie/${title!.id}`;

  return (
    <FeatureFrame
      title={title!}
      resumeHref={resume}
      resumeLabel={title!.type === 'SERIES' ? 'Play' : 'Play'}
      saved={inList}
      onSave={
        pending
          ? undefined
          : () => {
              void toggle().then(onSaved);
            }
      }
    />
  );
}
