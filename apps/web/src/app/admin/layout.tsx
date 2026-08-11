'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/format';

const NAV = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/titles', label: 'Titles' },
  { href: '/admin/channels', label: 'Channels' },
  { href: '/admin/epg', label: 'EPG' },
  { href: '/admin/awaiting', label: 'Awaiting' },
  { href: '/admin/users', label: 'Users' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, ready } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  /*
   * Convenience only — the API rejects every /admin route for non-admins via
   * RolesGuard, so this cannot be bypassed by editing client state.
   */
  useEffect(() => {
    if (!ready) return;
    if (!user) router.replace('/login?next=/admin');
    else if (user.role !== 'ADMIN') router.replace('/');
  }, [ready, user, router]);

  if (!ready || user?.role !== 'ADMIN') {
    return (
      <div className="grid h-dvh place-items-center bg-night">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-bone/15 border-t-brass-hot" />
      </div>
    );
  }

  return (
    <div className="font-projection flex min-h-dvh bg-night text-bone">
      <aside className="hidden w-56 shrink-0 border-r border-hairline p-5 md:block">
        <Link href="/" className="focus-brass mb-8 block text-[1.0625rem] font-semibold tracking-[0.16em] uppercase">
          i<span className="text-brass">Hub</span>
        </Link>
        <p className="label-mono mb-3 text-ash-dim">Admin</p>
        <nav className="space-y-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'focus-brass chamfer-sm block px-3 py-2 text-sm transition',
                pathname === item.href ? 'bg-brass/10 font-medium text-bone' : 'text-ash hover:bg-bone/5 hover:text-bone',
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <Link href="/" className="focus-brass mt-8 block px-3 text-sm text-ash-dim transition hover:text-brass-hot">
          ← Back to app
        </Link>
      </aside>

      <div className="min-w-0 flex-1">
        <nav className="no-scrollbar flex gap-3 overflow-x-auto border-b border-hairline px-4 py-3 text-sm md:hidden">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn('whitespace-nowrap', pathname === item.href ? 'font-semibold text-bone' : 'text-ash')}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <main className="p-5 md:p-8">{children}</main>
      </div>
    </div>
  );
}
