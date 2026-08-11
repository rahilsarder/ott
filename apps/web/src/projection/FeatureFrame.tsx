'use client';

import Image from 'next/image';
import Link from 'next/link';
import type { TitleCard } from '@ott/shared';
import { formatDuration, formatRating } from '@/lib/format';
import { Button } from './ui';

/**
 * The feature presentation.
 *
 * Artwork is inset in darkness like a projected image rather than bleeding to
 * the edges, and the title overlaps its lower edge — the one deliberate break
 * in the grid, and the thing that stops this reading as every other streaming
 * hero.
 */
export function FeatureFrame({
  title,
  resumeHref,
  resumeLabel,
  onSave,
  saved,
}: {
  title: TitleCard;
  resumeHref: string;
  /** "Resume S1 E4 · 22 min left" when there is history, otherwise "Play". */
  resumeLabel: string;
  onSave?: () => void;
  saved?: boolean;
}) {
  const facts = [
    formatRating(title.rating),
    title.year ? String(title.year) : '',
    title.type === 'SERIES' ? 'Series' : formatDuration(title.durationSec),
    title.genres
      .slice(0, 2)
      .map((g) => g.name)
      .join(' · '),
  ].filter(Boolean);

  return (
    /*
     * A 21:9 crop is a letterbox sliver on a phone, so the frame turns portrait
     * and the copy moves inside it — the first screen is one composed image
     * rather than a strip with text under it. On desktop the copy returns to
     * overlapping the frame's lower edge, which is the signature.
     */
    <section className="relative px-4 pt-6 pb-8 md:px-12 md:pt-8 md:pb-12">
      <div className="chamfer-lg grain-over relative aspect-[3/4] overflow-hidden bg-night-3 shadow-[0_0_90px_rgb(200_150_62/0.10)] sm:aspect-[16/9] md:aspect-[21/9]">
        {/*
          Two sources rather than one: a portrait frame wants poster art, a
          landscape one wants the backdrop. Swapped in CSS so there is no
          viewport check during render and nothing to get wrong on the server.
        */}
        {(title.posterUrl ?? title.backdropUrl) && (
          <Image
            src={(title.posterUrl ?? title.backdropUrl)!}
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover sm:hidden"
          />
        )}
        {title.backdropUrl && (
          <Image
            src={title.backdropUrl}
            alt=""
            fill
            priority
            sizes="100vw"
            className="hidden object-cover sm:block"
          />
        )}
        {/* Light falls off at the edges, as it would from a lamp. */}
        <span
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(70% 90% at 58% 45%, transparent 28%, rgb(10 9 8 / 0.88) 100%)',
          }}
        />
        {/* On a phone the copy sits on the image, so it needs its own floor. */}
        <span className="absolute inset-x-0 bottom-0 h-2/3 bg-linear-to-t from-night via-night/80 to-transparent md:hidden" />
      </div>

      {/*
        A constant lift, not one that grows with the breakpoint. The row below
        the heading sits at (frameBottom − lift + headingHeight + gap), so
        keeping the lift under the heading's own height means it can never reach
        the frame at any width. Only the heading crosses that edge.
      */}
      <div className="absolute inset-x-4 bottom-8 z-2 flex max-w-2xl flex-col gap-3 md:static md:-mt-10 md:ml-6">
        <span className="label-mono text-brass">Feature presentation</span>

        <h1 className="text-[clamp(2.25rem,7vw,4.5rem)] leading-[0.9] font-semibold tracking-[-0.045em] text-balance drop-shadow-[0_6px_40px_rgb(10_9_8/0.9)]">
          {title.name}
        </h1>

        <div className="flex flex-wrap items-center gap-2.5 text-sm text-ash">
          {facts.map((fact, index) => (
            <span key={fact} className="flex items-center gap-2.5">
              {index > 0 && <span aria-hidden className="size-[3px] rounded-full bg-ash-dim" />}
              {index === 0 && title.rating ? (
                <span className="label-mono border border-ash-dim px-1.5 py-0.5 text-bone">{fact}</span>
              ) : (
                <span>{fact}</span>
              )}
            </span>
          ))}
        </div>

        {title.synopsis && (
          <p className="line-clamp-3 max-w-[46ch] text-sm text-ash md:text-base">{title.synopsis}</p>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Link href={resumeHref} className="contents">
            <Button>▶ {resumeLabel}</Button>
          </Link>
          <Link href={`/title/${title.slug}`} className="contents">
            <Button variant="quiet">Details</Button>
          </Link>
          {onSave && (
            <Button variant="quiet" onClick={onSave} aria-pressed={saved}>
              {saved ? '✓ Saved' : '＋ Save'}
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}

/** Matching skeleton, so the first paint reserves the same space. */
export function FeatureFrameSkeleton() {
  return (
    <section className="px-4 pt-6 pb-8 md:px-12 md:pt-8 md:pb-12">
      <div className="chamfer-lg aspect-[16/9] animate-pulse bg-night-2 md:aspect-[21/9]" />
      <div className="relative z-2 -mt-10 flex max-w-2xl flex-col gap-3 md:-mt-16 md:ml-6">
        <div className="h-12 w-2/3 animate-pulse bg-night-2 md:h-16" />
        <div className="h-4 w-1/3 animate-pulse bg-night-2" />
      </div>
    </section>
  );
}
