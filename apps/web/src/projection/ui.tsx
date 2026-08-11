'use client';

import { useEffect, useState } from 'react';
import { cn, formatTime } from '@/lib/format';

/* ── Client-only time ────────────────────────────────────────────────────── */

/** True once hydrated. */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

/**
 * Renders a clock time only after hydration.
 *
 * Two things make times a hydration hazard: `toLocaleTimeString` can resolve a
 * different locale on the server than in the browser, and anything derived from
 * "now" moves between the two renders. Both produce a mismatch that React
 * reports as a hard error, so the server simply renders nothing here.
 */
export function LocalTime({ iso, className }: { iso: string; className?: string }) {
  const mounted = useMounted();
  return (
    <time dateTime={iso} className={className} suppressHydrationWarning>
      {mounted ? formatTime(iso) : ''}
    </time>
  );
}

/* ── Button ──────────────────────────────────────────────────────────────── */

const BUTTON_VARIANTS = {
  /* Brass fill. One per view — the thing you actually came to do. */
  primary: 'bg-brass text-[#17110a] hover:bg-brass-hot',
  /* Everything secondary. Lifts off the ground without competing for the eye. */
  quiet: 'bg-bone/10 text-bone hover:bg-bone/20',
  /* Outlined, for tertiary and destructive-adjacent actions. */
  ghost: 'border border-hairline bg-transparent text-ash hover:border-brass hover:text-brass-hot',
} as const;

export function Button({
  variant = 'primary',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof BUTTON_VARIANTS }) {
  return (
    <button
      {...props}
      className={cn(
        'chamfer-sm focus-brass inline-flex items-center justify-center gap-2 px-5 py-2.5',
        'text-[0.8125rem] font-semibold tracking-[0.01em] transition',
        'disabled:cursor-not-allowed disabled:opacity-50',
        BUTTON_VARIANTS[variant],
        className,
      )}
    />
  );
}

/* ── Chip ────────────────────────────────────────────────────────────────── */

/** Filter pills and metadata tags. `on` is the selected state. */
export function Chip({
  on,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { on?: boolean }) {
  return (
    <button
      {...props}
      aria-pressed={on}
      className={cn(
        'chamfer-sm focus-brass label-mono px-3 py-1.5 transition',
        on
          ? 'bg-brass text-[#17110a]'
          : 'border border-hairline text-ash hover:border-brass hover:text-brass-hot',
        className,
      )}
    />
  );
}

/** Non-interactive marker — quality, language, certificate. */
export function Tag({
  tone = 'neutral',
  className,
  children,
}: {
  tone?: 'neutral' | 'brass';
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'label-mono border px-1.5 py-0.5 text-[0.5rem]',
        tone === 'brass' ? 'border-brass-hot/35 text-brass-hot' : 'border-bone/15 text-bone',
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ── Field ───────────────────────────────────────────────────────────────── */

export const inputClass =
  'chamfer-sm focus-brass w-full border border-hairline bg-night-2 px-3 py-2.5 text-sm text-bone outline-none placeholder:text-ash-dim';

/**
 * A labelled control. `demo` is the in-place worked example the admin design
 * calls for — a real value from the catalogue rather than invented help text.
 */
export function Field({
  label,
  hint,
  demo,
  children,
}: {
  label: string;
  hint?: string;
  demo?: { title: string; value?: string; note?: string };
  children: React.ReactNode;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-xs font-medium text-bone">{label}</span>
      {children}
      {hint && <span className="text-xs text-ash-dim">{hint}</span>}
      {demo && (
        <span className="flex flex-col gap-0.5 border-l border-brass pl-2.5">
          <span className="label-mono text-[0.5rem] text-brass">{demo.title}</span>
          {demo.value && (
            <code className="font-projection-mono text-[0.6875rem] break-all text-ash">{demo.value}</code>
          )}
          {demo.note && <span className="text-[0.6875rem] text-ash-dim">{demo.note}</span>}
        </span>
      )}
    </label>
  );
}

/* ── Section head ────────────────────────────────────────────────────────── */

/** Shelf and block headings: title, a quiet count, and an optional way out. */
export function SectionHead({
  title,
  meta,
  href,
  className,
}: {
  title: string;
  meta?: string;
  href?: string;
  className?: string;
}) {
  return (
    <div className={cn('flex items-baseline gap-3', className)}>
      <h2 className="text-lg font-semibold tracking-[-0.015em]">{title}</h2>
      {meta && <span className="label-mono text-ash-dim">{meta}</span>}
      {href && (
        <a href={href} className="focus-brass label-mono ml-auto text-brass hover:text-brass-hot">
          All →
        </a>
      )}
    </div>
  );
}

/* ── Surfaces ────────────────────────────────────────────────────────────── */

export function Panel({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('border border-hairline bg-night-2 p-5', className)}>{children}</div>;
}

export function Banner({ tone, children }: { tone: 'ok' | 'warn' | 'bad'; children: React.ReactNode }) {
  const tones = {
    ok: 'border-signal-ok/40 bg-signal-ok/10 text-signal-ok',
    warn: 'border-signal-warn/40 bg-signal-warn/10 text-signal-warn',
    bad: 'border-signal-bad/40 bg-signal-bad/10 text-signal-bad',
  } as const;
  return (
    <p role="alert" className={cn('border px-3 py-2 text-sm', tones[tone])}>
      {children}
    </p>
  );
}

/** The pulsing dot that marks anything live. Motion is the only signal it needs. */
export function LiveDot({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('motion-lamp size-1.5 animate-[pulse-lamp_2.4s_ease-out_infinite] rounded-full bg-brass-hot', className)}
    />
  );
}
