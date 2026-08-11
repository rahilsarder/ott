'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useSession } from '@/lib/session';

/**
 * Client-side gate for the browse experience.
 *
 * The API is the real access boundary — every personalised endpoint requires a
 * profile-scoped token. This only spares the viewer from rendering a page that
 * would immediately 401.
 */
export function AuthGate({ children, requireProfile = true }: { children: React.ReactNode; requireProfile?: boolean }) {
  const { user, profile, ready } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    if (requireProfile && !profile) router.replace('/profiles');
  }, [ready, user, profile, requireProfile, router, pathname]);

  if (!ready || !user || (requireProfile && !profile)) {
    return (
      <div className="grid h-dvh place-items-center bg-ink">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/15 border-t-accent" />
      </div>
    );
  }

  return <>{children}</>;
}
