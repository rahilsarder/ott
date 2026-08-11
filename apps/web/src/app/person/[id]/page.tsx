'use client';

import Image from 'next/image';
import { use } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { PersonDetail } from '@ott/shared';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { AuthGate } from '@/components/AuthGate';
import { PosterCard } from '@/projection/cards';
import { TabBar, TopNav } from '@/projection/shell';

export default function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <AuthGate>
      <PersonView id={id} />
    </AuthGate>
  );
}

function PersonView({ id }: { id: string }) {
  const { profile, user } = useSession();

  const { data: person, isLoading, error } = useQuery({
    queryKey: ['person', id],
    queryFn: () => api<PersonDetail>(`/catalog/people/${id}`),
  });

  return (
    <div className="min-h-dvh bg-night pb-24 font-projection text-bone md:pb-16">
      <TopNav />

      {isLoading ? (
        <main className="px-4 pt-10 md:px-12">
          <div className="chamfer-md size-32 animate-pulse bg-night-2" />
        </main>
      ) : error || !person ? (
        <main className="grid min-h-[50vh] place-items-center px-6 text-center">
          <p className="text-sm text-ash">We couldn&apos;t find that person.</p>
        </main>
      ) : (
        <main className="px-4 pt-10 md:px-12">
          <header className="mb-10 flex flex-col items-start gap-5 sm:flex-row sm:items-center">
            <div className="chamfer-md grain-over relative size-32 shrink-0 overflow-hidden bg-night-3">
              {person.profileUrl ? (
                <Image src={person.profileUrl} alt={person.name} fill sizes="128px" className="object-cover" />
              ) : (
                <span className="grid h-full place-items-center text-4xl font-semibold text-ash-dim">
                  {person.name.charAt(0)}
                </span>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <h1 className="text-3xl font-semibold tracking-[-0.03em] md:text-4xl">{person.name}</h1>
              {person.roles.length > 0 && <p className="text-sm text-ash">{person.roles.join(' · ')}</p>}
              <p className="label-mono text-ash-dim">
                {person.titles.length} title{person.titles.length === 1 ? '' : 's'} available here
              </p>
            </div>
          </header>

          {person.titles.length === 0 ? (
            /* Only catalogue titles are listed, so this is the honest empty
               state rather than a filmography nobody can play. */
            <p className="text-sm text-ash">Nothing by {person.name} is in the catalogue yet.</p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {person.titles.map((title) => (
                <div key={title.id} className="flex flex-col gap-1.5">
                  <PosterCard title={title} />
                  {title.role && <span className="label-mono px-0.5 text-ash-dim">as {title.role}</span>}
                </div>
              ))}
            </div>
          )}
        </main>
      )}

      <TabBar />
    </div>
  );
}
