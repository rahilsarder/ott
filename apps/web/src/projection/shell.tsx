'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { Channel } from '@ott/shared';
import { cn } from '@/lib/format';
import { useSession } from '@/lib/session';
import { LiveDot, LocalTime } from './ui';

/* Saved lives under the avatar, not in the bar — it is a profile thing. */
const NAV = [
  { href: '/', label: 'Home' },
  { href: '/live', label: 'Live' },
  { href: '/movies', label: 'Movies' },
  { href: '/series', label: 'Series' },
  { href: '/search', label: 'Search' },
] as const;

/* ── Desktop nav ─────────────────────────────────────────────────────────── */

export function TopNav() {
  const pathname = usePathname();
  const { user, profile } = useSession();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);

  const profileInitial = (profile?.name ?? user?.name ?? '?').charAt(0).toUpperCase();
  const avatarUrl = !avatarFailed ? (user?.avatarUrl ?? null) : null;

  // A sign-out/sign-in with a different avatar should never keep showing a stale failure.
  useEffect(() => setAvatarFailed(false), [user?.avatarUrl]);

  // Route changes should never leave the menu hanging open behind a new page.
  useEffect(() => setMenuOpen(false), [pathname]);

  // Gains a ground once it lifts off the top of the page.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    /*
     * Sticky rather than fixed, so anything rendered after it — the on-air
     * strip especially — flows underneath instead of being covered. Fixed
     * would need every page to reserve the header's height by hand.
     */
    <header
      className={cn(
        'sticky top-0 z-50 transition-colors duration-300',
        scrolled ? 'bg-night/95 backdrop-blur' : 'bg-night',
      )}
    >
      <nav className="flex items-center gap-8 px-4 py-3.5 md:px-12">
        <Link href="/" className="focus-brass text-[1.0625rem] font-semibold tracking-[0.16em] uppercase">
          i<span className="text-brass">Hub</span>
        </Link>

        {/* On a phone these live in the tab bar, so the header stays minimal. */}
        <ul className="hidden gap-6 md:flex">
          {NAV.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={pathname === item.href ? 'page' : undefined}
                className={cn(
                  'focus-brass text-[0.8125rem] transition hover:text-brass-hot',
                  pathname === item.href ? 'text-bone' : 'text-ash',
                )}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="relative ml-auto">
          <button
            onClick={() => setMenuOpen((open) => !open)}
            aria-label="Account menu"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            className="focus-brass grid size-7 place-items-center overflow-hidden rounded-full bg-linear-to-br from-brass to-[#6e4e15] text-[0.6875rem] font-semibold text-night"
          >
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- a small fixed-size external avatar, not worth next/image's optimization pipeline
              <img
                src={avatarUrl}
                alt=""
                referrerPolicy="no-referrer"
                className="size-full object-cover"
                onError={() => setAvatarFailed(true)}
              />
            ) : (
              profileInitial
            )}
          </button>
          {menuOpen && <AccountMenu onClose={() => setMenuOpen(false)} />}
        </div>
      </nav>
    </header>
  );
}

/* ── Account menu ────────────────────────────────────────────────────────── */

function AccountMenu({ onClose }: { onClose: () => void }) {
  const { user, profile, signOut, clearProfile } = useSession();
  const router = useRouter();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const items = [
    { label: 'Saved', run: () => router.push('/my-list') },
    { label: 'Switch profile', run: clearProfile },
    ...(user?.role === 'ADMIN' ? [{ label: 'Admin', run: () => router.push('/admin') }] : []),
    { label: 'Sign out', run: () => void signOut() },
  ];

  return (
    <>
      {/* Click-away catcher. Sits below the menu, above everything else. */}
      <button
        aria-hidden
        tabIndex={-1}
        onClick={onClose}
        className="fixed inset-0 z-40 cursor-default"
      />
      <div
        role="menu"
        className="chamfer-md absolute right-0 top-10 z-50 w-52 border border-hairline bg-night/97 py-1 backdrop-blur"
      >
        <div className="border-b border-hairline px-4 py-2.5">
          <p className="truncate text-sm font-medium">{profile?.name ?? user?.name}</p>
          <p className="truncate text-[0.6875rem] text-ash-dim">{user?.email}</p>
        </div>
        {items.map((item) => (
          <button
            key={item.label}
            role="menuitem"
            onClick={() => {
              onClose();
              item.run();
            }}
            className="focus-brass block w-full px-4 py-2 text-left text-[0.8125rem] text-ash transition hover:bg-brass/10 hover:text-bone"
          >
            {item.label}
          </button>
        ))}
      </div>
    </>
  );
}

/* ── Phone tab bar ───────────────────────────────────────────────────────── */

/**
 * The one place the design follows platform convention rather than fighting it.
 * A top nav on a phone is a reach, and being distinctive there costs real
 * usability.
 */
export function TabBar() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 flex border-t border-hairline bg-night-2 px-2 pt-2 pb-3 md:hidden">
      {NAV.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className="focus-brass flex flex-1 flex-col items-center gap-1 no-underline"
          >
            <span
              className={cn(
                'chamfer-sm size-4 border transition',
                active ? 'border-brass bg-brass/25' : 'border-ash-dim',
              )}
            />
            <span className={cn('label-mono text-[0.4375rem]', active ? 'text-brass-hot' : 'text-ash-dim')}>
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

/* ── On-air strip ────────────────────────────────────────────────────────── */

/**
 * Live is ambient and always present rather than a destination tab. Renders
 * nothing when no channel is on air, so the strip never sits empty.
 */
export function OnAirStrip({ channels }: { channels: Channel[] }) {
  const live = channels.filter((c) => c.now);
  if (live.length === 0) return null;

  return (
    <div className="no-scrollbar flex items-center gap-4 overflow-x-auto border-y border-hairline bg-linear-to-r from-brass/8 to-transparent px-4 py-2.5 md:px-12">
      <span className="label-mono flex shrink-0 items-center gap-1.5 text-brass-hot">
        <LiveDot />
        On air
      </span>

      {live.slice(0, 6).map((channel, index) => (
        <span key={channel.id} className="flex shrink-0 items-center gap-4">
          {index > 0 && <span aria-hidden className="h-3.5 w-px bg-hairline" />}
          <Link
            href={`/watch/channel/${channel.id}`}
            className="focus-brass flex items-baseline gap-2 text-xs text-ash no-underline hover:text-bone"
          >
            <b className="font-medium text-bone">{channel.name}</b>
            <span className="truncate">{channel.now?.title}</span>
            {channel.now && (
              <span className="label-mono tabular-nums text-ash-dim">
                ends <LocalTime iso={channel.now.endsAt} />
              </span>
            )}
          </Link>
        </span>
      ))}
    </div>
  );
}

/* ── Shelf ───────────────────────────────────────────────────────────────── */

/**
 * Anchor plus satellites, alternating side each shelf. The alternation is what
 * stops consecutive rows reading as a uniform grid — the Netflix rhythm.
 */
export function Shelf({
  flip,
  anchor,
  children,
}: {
  flip?: boolean;
  anchor: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="no-scrollbar flex gap-3 overflow-x-auto px-4 md:px-12">
      {!flip && anchor}
      {children}
      {flip && anchor}
    </div>
  );
}
