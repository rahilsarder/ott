'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AVATAR_KEYS, MAX_PROFILES_PER_ACCOUNT, type Profile } from '@ott/shared';
import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { AVATAR_GRADIENTS, cn } from '@/lib/format';
import { AuthGate } from '@/components/AuthGate';
import { PencilIcon, PlusIcon, TrashIcon } from '@/components/icons';

export default function ProfilesPage() {
  return (
    <AuthGate requireProfile={false}>
      <Suspense fallback={null}>
        <ProfilePicker />
      </Suspense>
    </AuthGate>
  );
}

function ProfilePicker() {
  const router = useRouter();
  const params = useSearchParams();
  const client = useQueryClient();
  const { selectProfile, signOut } = useSession();

  const [managing, setManaging] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [avatarKey, setAvatarKey] = useState<string>('blue');
  const [isKids, setIsKids] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: profiles, isLoading } = useQuery({
    queryKey: ['profiles'],
    queryFn: () => api<Profile[]>('/profiles'),
  });

  const create = useMutation({
    mutationFn: () => api<Profile>('/profiles', { method: 'POST', body: { name, avatarKey, isKids } }),
    onSuccess: () => {
      setCreating(false);
      setName('');
      setIsKids(false);
      setError(null);
      void client.invalidateQueries({ queryKey: ['profiles'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not create profile'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api<void>(`/profiles/${id}`, { method: 'DELETE' }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['profiles'] }),
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not delete profile'),
  });

  const choose = async (profile: Profile) => {
    await selectProfile(profile);
    router.replace(params.get('next') || '/');
  };

  if (isLoading) {
    return (
      <main className="grid h-dvh place-items-center bg-ink">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/15 border-t-accent" />
      </main>
    );
  }

  const canAdd = (profiles?.length ?? 0) < MAX_PROFILES_PER_ACCOUNT;

  return (
    <main className="grid min-h-dvh place-items-center bg-ink px-4 py-16">
      <div className="w-full max-w-3xl animate-fade-in text-center">
        <h1 className="mb-10 text-3xl font-medium md:text-5xl">Who&apos;s watching?</h1>

        {error && (
          <p role="alert" className="mx-auto mb-6 max-w-md rounded bg-accent/15 px-3 py-2 text-sm text-accent">
            {error}
          </p>
        )}

        <ul className="flex flex-wrap items-start justify-center gap-6 md:gap-8">
          {profiles?.map((profile) => (
            <li key={profile.id} className="group relative">
              <button
                onClick={() => (managing ? undefined : void choose(profile))}
                className="flex w-24 flex-col items-center gap-3 md:w-32"
              >
                <span
                  className={cn(
                    'grid aspect-square w-full place-items-center rounded-md bg-gradient-to-br text-3xl font-bold ring-white/0 transition-all duration-200 group-hover:ring-4 md:text-4xl',
                    AVATAR_GRADIENTS[profile.avatarKey] ?? AVATAR_GRADIENTS.red,
                    managing && 'opacity-50',
                  )}
                >
                  {profile.name.charAt(0).toUpperCase()}
                </span>
                <span className="flex items-center gap-1.5 truncate text-sm text-white/70 group-hover:text-white">
                  {profile.name}
                  {profile.isKids && <span className="rounded bg-white/20 px-1 text-[10px] uppercase">Kids</span>}
                </span>
              </button>

              {managing && (
                <button
                  onClick={() => remove.mutate(profile.id)}
                  aria-label={`Delete ${profile.name}`}
                  className="absolute -right-2 -top-2 grid h-8 w-8 place-items-center rounded-full bg-accent transition hover:bg-accent-hover"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}

          {canAdd && !creating && (
            <li>
              <button onClick={() => setCreating(true)} className="flex w-24 flex-col items-center gap-3 md:w-32">
                <span className="grid aspect-square w-full place-items-center rounded-md border-2 border-dashed border-white/25 text-white/50 transition hover:border-white/60 hover:text-white">
                  <PlusIcon className="h-8 w-8" />
                </span>
                <span className="text-sm text-white/70">Add profile</span>
              </button>
            </li>
          )}
        </ul>

        {creating && (
          <div className="mx-auto mt-10 max-w-sm space-y-4 rounded-lg bg-surface p-6 text-left ring-1 ring-white/10">
            <h2 className="font-semibold">New profile</h2>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name"
              maxLength={24}
              className="w-full rounded bg-white/10 px-3 py-2.5 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-white/50"
            />

            <div className="flex flex-wrap gap-2">
              {AVATAR_KEYS.map((key) => (
                <button
                  key={key}
                  onClick={() => setAvatarKey(key)}
                  aria-label={key}
                  className={cn(
                    'h-9 w-9 rounded bg-gradient-to-br transition',
                    AVATAR_GRADIENTS[key],
                    avatarKey === key ? 'ring-2 ring-white' : 'opacity-60 hover:opacity-100',
                  )}
                />
              ))}
            </div>

            <label className="flex items-center gap-2 text-sm text-white/70">
              <input type="checkbox" checked={isKids} onChange={(e) => setIsKids(e.target.checked)} />
              Kids profile
            </label>

            <div className="flex gap-2">
              <button
                onClick={() => create.mutate()}
                disabled={!name.trim() || create.isPending}
                className="flex-1 rounded bg-white py-2 font-semibold text-black transition hover:bg-white/85 disabled:opacity-50"
              >
                Create
              </button>
              <button
                onClick={() => { setCreating(false); setError(null); }}
                className="rounded bg-white/15 px-4 py-2 font-semibold transition hover:bg-white/25"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="mt-12 flex items-center justify-center gap-3">
          <button
            onClick={() => setManaging((v) => !v)}
            className="flex items-center gap-2 rounded border border-white/40 px-5 py-2 text-sm tracking-wide text-white/70 transition hover:border-white hover:text-white"
          >
            <PencilIcon className="h-4 w-4" />
            {managing ? 'Done' : 'Manage Profiles'}
          </button>
          <button
            onClick={() => void signOut()}
            className="rounded px-5 py-2 text-sm text-white/50 transition hover:text-white"
          >
            Sign out
          </button>
        </div>
      </div>
    </main>
  );
}
