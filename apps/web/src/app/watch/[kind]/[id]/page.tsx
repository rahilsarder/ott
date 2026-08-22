'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PlaybackSession } from '@ott/shared';
import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { VideoPlayer } from '@/components/player/VideoPlayer';

export default function WatchPage({ params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = use(params);
  return <WatchView kind={kind} id={id} />;
}

function WatchView({ kind, id }: { kind: string; id: string }) {
  const router = useRouter();
  // Playback works with no session at all — this only waits for `ready` so
  // a logged-in viewer's token is actually attached before minting, rather
  // than racing and getting treated as anonymous on the very first render.
  const { ready } = useSession();
  const [session, setSession] = useState<PlaybackSession | null>(null);
  const [error, setError] = useState<string | null>(null);

  /*
   * The session is minted once on mount rather than through React Query: it has
   * side effects on the server (it records a play event) and the player owns
   * re-minting from then on, so caching or refetching it would be wrong.
   */
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;

    void (async () => {
      try {
        const created = await api<PlaybackSession>(`/playback/${kind}/${id}`, { method: 'POST' });
        if (!cancelled) setSession(created);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : 'Could not start playback');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [kind, id, ready]);

  if (error) {
    return (
      <main className="font-projection grid h-dvh place-items-center bg-black px-6 text-center text-bone">
        <div className="space-y-4">
          <h1 className="text-xl font-semibold">{error}</h1>
          <button
            onClick={() => router.back()}
            className="chamfer-sm focus-brass bg-brass px-6 py-2 font-semibold text-[#17110a] transition hover:bg-brass-hot"
          >
            Go back
          </button>
        </div>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="grid h-dvh place-items-center bg-black">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-bone/15 border-t-brass-hot" />
      </main>
    );
  }

  return <VideoPlayer session={session} />;
}
