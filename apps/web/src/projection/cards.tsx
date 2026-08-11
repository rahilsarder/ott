'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { CreditSummary, TitleCard as TitleCardModel } from '@ott/shared';
import { cn, formatClock, formatRating } from '@/lib/format';
import { Plate } from './Plate';
import { LiveDot, LocalTime, Tag } from './ui';

/*
 * Shared card behaviour.
 *
 * Hover warms the light from below rather than drawing a ring — a lamp
 * brightening, not a border appearing. Focus is the deliberate exception: a
 * keyboard or TV remote needs an unmistakable edge.
 */
const CARD_BASE =
  'chamfer-md focus-brass group relative block overflow-hidden text-inherit no-underline ' +
  'transition-transform duration-[260ms] ease-lamp hover:-translate-y-[3px] focus-visible:-translate-y-[3px]';

/** The warm pool of light. Sits above artwork, below text. */
function Lamp() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-0 z-2 opacity-0 transition-opacity duration-[260ms] group-hover:opacity-100 group-focus-visible:opacity-100"
      style={{
        background: 'radial-gradient(70% 60% at 50% 100%, rgb(200 150 62 / 0.22), transparent 70%)',
      }}
    />
  );
}

/** Bottom-left lockup used by every artwork-backed card. */
function Meta({ title, sub, large }: { title: string; sub?: string | null; large?: boolean }) {
  return (
    <span className="absolute inset-x-0 bottom-0 z-3 flex flex-col gap-0.5 px-3.5 py-3">
      <strong className={cn('font-semibold tracking-[-0.01em]', large ? 'text-xl' : 'text-[0.9375rem]')}>
        {title}
      </strong>
      {sub && <span className="label-mono text-ash">{sub}</span>}
    </span>
  );
}

/** Top-left marker: resume position, NEW, quality. */
function Tick({ children }: { children: React.ReactNode }) {
  return (
    <span className="label-mono absolute top-2.5 left-2.5 z-3 bg-night/75 px-1.5 py-0.5 text-[0.5rem] text-brass-hot">
      {children}
    </span>
  );
}

function Progress({ percent }: { percent: number }) {
  return (
    <span className="absolute inset-x-0 bottom-0 z-3 h-0.5 bg-bone/15">
      <span className="block h-full bg-brass" style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
    </span>
  );
}

/** Dimmed lockup for content that exists but cannot be played yet. */
function AwaitingStream() {
  return (
    <span className="label-mono absolute inset-0 z-4 grid place-items-center bg-night/55 text-[0.5625rem] text-ash">
      Awaiting stream
    </span>
  );
}

const subtitleFor = (t: TitleCardModel) =>
  [t.year, t.type === 'SERIES' ? 'Series' : 'Film', formatRating(t.rating)].filter(Boolean).join(' · ');

/* ── 1 · Anchor ──────────────────────────────────────────────────────────── */

/** Leads a shelf. Landscape, because the slot is selling one thing. */
export function AnchorCard({
  title,
  href,
  tick,
  awaiting,
  className,
}: {
  title: TitleCardModel;
  href?: string;
  tick?: string;
  awaiting?: boolean;
  className?: string;
}) {
  return (
    <Link href={href ?? `/title/${title.slug}`} className={cn(CARD_BASE, 'w-[300px] shrink-0 md:w-[360px]', className)}>
      <Plate
        src={title.backdropUrl ?? title.posterUrl}
        alt={title.name}
        ratio="aspect-[16/10]"
        sizes="360px"
        fallback={title.name.charAt(0)}
        className={cn(awaiting && 'grayscale brightness-[0.42]')}
      />
      <Lamp />
      {tick && <Tick>{tick}</Tick>}
      {awaiting ? <AwaitingStream /> : <Meta large title={title.name} sub={subtitleFor(title)} />}
    </Link>
  );
}

/* ── 1b · Shelf card ─────────────────────────────────────────────────────── */

/**
 * The card a home shelf is built from.
 *
 * One component rather than separate anchor and poster cards, because which one
 * a slot is changes on hover. It carries both artworks and crossfades between
 * them as the width animates — driven entirely by CSS in theme.css, so the
 * width and the artwork can never disagree.
 */
export function ShelfCard({
  title,
  href,
  tick,
  percent,
  isAnchor,
  className,
}: {
  title: TitleCardModel;
  href?: string;
  /** "S1 E4 · 22 min left", "NEW", a quality badge. */
  tick?: string;
  percent?: number;
  /** Rests expanded, and yields as soon as the pointer enters the shelf. */
  isAnchor?: boolean;
  className?: string;
}) {
  const poster = title.posterUrl ?? title.backdropUrl;
  const backdrop = title.backdropUrl ?? title.posterUrl;

  return (
    <Link
      href={href ?? `/title/${title.slug}`}
      className={cn(
        'shelf-card chamfer-md focus-brass group relative block shrink-0 overflow-hidden bg-night-3 no-underline',
        isAnchor && 'is-anchor',
        className,
      )}
    >
      {poster && (
        <Image
          src={poster}
          alt=""
          fill
          sizes="340px"
          className="art-tall absolute inset-0 object-cover"
        />
      )}
      {backdrop && (
        <Image
          src={backdrop}
          alt=""
          fill
          sizes="340px"
          className="art-wide absolute inset-0 object-cover"
        />
      )}

      <span aria-hidden className="grain-over absolute inset-0" />
      <span className="absolute inset-0 bg-linear-to-t from-night/95 via-night/20 to-transparent" />
      <Lamp />

      {tick && <Tick>{tick}</Tick>}

      <span className="absolute inset-x-0 bottom-0 z-3 flex flex-col gap-0.5 px-3 py-2.5">
        <strong className="truncate text-[0.8125rem] font-semibold tracking-[-0.01em]">{title.name}</strong>
        {/* Only worth the room once the card is wide. */}
        <span className="on-wide label-mono truncate text-ash">{subtitleFor(title)}</span>
      </span>

      {percent !== undefined && <Progress percent={percent} />}
    </Link>
  );
}

/* ── 2 · Poster ──────────────────────────────────────────────────────────── */

/** The workhorse. Portrait, because the slot is listing many. */
export function PosterCard({
  title,
  href,
  tags,
  className,
}: {
  title: TitleCardModel;
  href?: string;
  tags?: string[];
  className?: string;
}) {
  return (
    <Link href={href ?? `/title/${title.slug}`} className={cn(CARD_BASE, 'w-[150px] shrink-0', className)}>
      <Plate
        src={title.posterUrl ?? title.backdropUrl}
        alt={title.name}
        ratio="aspect-[2/3]"
        sizes="(max-width: 768px) 33vw, 150px"
        fallback={title.name.charAt(0)}
      />
      <Lamp />
      {tags && tags.length > 0 && (
        <span className="absolute top-2 right-2 z-3 flex flex-col items-end gap-1">
          {tags.map((t) => (
            <Tag key={t}>{t}</Tag>
          ))}
        </span>
      )}
      <Meta title={title.name} sub={title.year ? String(title.year) : null} />
    </Link>
  );
}

/* ── 3 · In progress ─────────────────────────────────────────────────────── */

/** The only card that states what happens on click. */
export function ProgressCard({
  title,
  label,
  percent,
  href,
  className,
}: {
  title: TitleCardModel;
  /** "S1 E4 · 22 min left" — a bare bar makes you guess. */
  label: string;
  percent: number;
  href: string;
  className?: string;
}) {
  return (
    <Link href={href} className={cn(CARD_BASE, 'w-[170px] shrink-0 md:w-[200px]', className)}>
      <Plate
        src={title.posterUrl ?? title.backdropUrl}
        alt={title.name}
        ratio="aspect-[4/5]"
        sizes="200px"
        fallback={title.name.charAt(0)}
      />
      <Lamp />
      <Tick>{label}</Tick>
      <Meta title={title.name} sub="Resume" />
      <Progress percent={percent} />
    </Link>
  );
}

/* ── 4 · Episode ─────────────────────────────────────────────────────────── */

/**
 * The one card that opens up: choosing an episode needs a synopsis, and you
 * cannot read one through a gradient. Text sits below the still.
 */
export function EpisodeCard({
  number,
  name,
  synopsis,
  stillUrl,
  durationSec,
  progressPercent,
  awaiting,
  href,
}: {
  number: number;
  name: string;
  synopsis?: string;
  stillUrl?: string | null;
  durationSec?: number | null;
  progressPercent?: number;
  awaiting?: boolean;
  href?: string;
}) {
  const body = (
    <>
      <span className="relative block">
        <Plate
          src={stillUrl}
          alt=""
          ratio="aspect-video"
          sizes="290px"
          scrim={false}
          className={cn(awaiting && 'grayscale brightness-[0.4]')}
        />
        {progressPercent !== undefined && <Progress percent={progressPercent} />}
      </span>
      <Lamp />
      <span className="flex flex-col gap-1 px-3.5 py-3">
        <span className="flex items-baseline gap-2">
          <span className="font-projection-mono text-[0.6875rem] tabular-nums text-brass">
            {String(number).padStart(2, '0')}
          </span>
          <strong className="truncate text-sm font-semibold">{name}</strong>
          <span className="label-mono ml-auto shrink-0 text-ash-dim">
            {awaiting ? 'No stream' : durationSec ? formatClock(durationSec) : ''}
          </span>
        </span>
        {synopsis && (
          <span className={cn('line-clamp-2 text-xs', awaiting ? 'text-ash-dim' : 'text-ash')}>{synopsis}</span>
        )}
      </span>
    </>
  );

  // An episode with no stream is shown, not hidden — but it must not be a link.
  if (awaiting || !href) {
    return <div className={cn(CARD_BASE, 'w-[290px] shrink-0 cursor-default bg-night-3')}>{body}</div>;
  }

  return (
    <Link href={href} className={cn(CARD_BASE, 'w-[290px] shrink-0 bg-night-3')}>
      {body}
    </Link>
  );
}

/* ── 5 · Live channel ────────────────────────────────────────────────────── */

/**
 * Carries time, not a plot. The bar shows how far into the programme you would
 * be joining — the thing that decides whether you bother.
 */
export function LiveCard({
  name,
  logoUrl,
  now,
  href,
  className,
}: {
  name: string;
  logoUrl?: string | null;
  now?: { title: string; startsAt: string; endsAt: string } | null;
  href: string;
  className?: string;
}) {
  // Derived from "now", so it can only be computed after hydration — and it
  // ticks, which also keeps the bar honest while someone sits on the page.
  const [percent, setPercent] = useState(0);
  useEffect(() => {
    if (!now) return;
    const update = () => setPercent(programmeProgress(now.startsAt, now.endsAt));
    update();
    const timer = setInterval(update, 30_000);
    return () => clearInterval(timer);
  }, [now]);

  return (
    <Link
      href={href}
      className={cn(CARD_BASE, 'flex w-[240px] shrink-0 flex-col bg-night-3 md:w-[280px]', className)}
    >
      {/* min-h-0 so the artwork gives way when the card is height-constrained
          inside a shelf, rather than pushing the text out of the bottom. */}
      <span className="relative block min-h-0 flex-1">
        <Plate
          src={logoUrl}
          alt={name}
          ratio="aspect-video"
          sizes="280px"
          scrim={false}
          fallback={name.charAt(0)}
          className="h-full"
        />
        <span className="label-mono absolute top-2.5 left-2.5 z-3 flex items-center gap-1.5 bg-night/75 px-1.5 py-0.5 text-[0.5rem] text-brass-hot">
          <LiveDot />
          On air
        </span>
      </span>
      <Lamp />
      <span className="flex shrink-0 flex-col gap-0.5 px-3.5 py-2.5">
        <strong className="truncate text-sm font-semibold">{name}</strong>
        <span className="truncate text-xs text-ash">{now?.title ?? 'No guide data'}</span>
        {now && (
          <span className="label-mono text-ash-dim">
            <LocalTime iso={now.startsAt} /> – <LocalTime iso={now.endsAt} />
          </span>
        )}
      </span>
      {now && (
        <span className="absolute inset-x-0 bottom-0 h-0.5 bg-bone/15">
          <span className="block h-full bg-brass" style={{ width: `${percent}%` }} />
        </span>
      )}
    </Link>
  );
}

function programmeProgress(startsAt: string, endsAt: string): number {
  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.min(100, Math.max(0, ((Date.now() - start) / (end - start)) * 100));
}

/* ── 6 · Person ──────────────────────────────────────────────────────────── */

/** Chamfered square, not a circle — circles are what every other service uses. */
export function PersonCard({ person }: { person: CreditSummary }) {
  return (
    <Link
      href={`/person/${person.personId}`}
      className="focus-brass group block w-20 shrink-0 text-center no-underline"
    >
      <Plate
        src={person.profileUrl}
        alt={person.name}
        ratio="aspect-square"
        sizes="80px"
        scrim={false}
        fallback={<span className="text-lg font-semibold">{person.name.charAt(0)}</span>}
        className="chamfer-sm transition-transform duration-[260ms] ease-lamp group-hover:-translate-y-[3px] group-focus-visible:-translate-y-[3px]"
      />
      <span className="mt-2 block line-clamp-2 text-xs leading-tight font-medium">{person.name}</span>
      {person.role && <span className="label-mono block truncate text-[0.5rem] text-ash-dim">{person.role}</span>}
    </Link>
  );
}
