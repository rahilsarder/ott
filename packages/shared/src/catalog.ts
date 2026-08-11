import { z } from 'zod';
import { MaturityRating, TitleType, paginationQuerySchema } from './enums';
import type { CreditSummary } from './tmdb';

export const slugSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase alphanumeric words separated by hyphens');

/**
 * Flussonic stream name or VOD path, not a URL. The host lives in
 * FLUSSONIC_BASE_URL so the server can be moved without rewriting catalog rows.
 *
 * Written unencoded — real VOD paths carry spaces, parentheses and brackets
 * (`ftp2/bollywood/Pongala (2025)/Pongala.1080p.Dual[Hindi-Malayalam].mp4`) and
 * the server percent-encodes each segment when building the URL. What is
 * rejected here is anything that would change the shape of that URL or escape
 * the media root.
 */
/** Percent-encodes one path segment the way Flussonic itself emits them. */
export function encodeStreamSegment(segment: string): string {
  return encodeURIComponent(segment).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/**
 * Strips percent-encoding that a path arrived with.
 *
 * Paths get copied out of browsers and third-party players constantly, so they
 * turn up already encoded (`Alice%20in%20Borderland`). Encoding that a second
 * time produces `%2520` and a 404 that looks nothing like its cause. Decoding
 * here makes the stored form canonical however it was pasted.
 *
 * A segment is only decoded when re-encoding reproduces it exactly — proof it
 * really was encoded, rather than a filename that merely contains a `%`. The
 * loop unwinds input encoded more than once; three passes is far beyond any
 * real paste and bounds the work.
 */
export function normalizeStreamPath(path: string): string {
  return path
    .split('/')
    .map((segment) => {
      let current = segment;
      for (let pass = 0; pass < 3; pass += 1) {
        if (!current.includes('%')) break;
        let decoded: string;
        try {
          decoded = decodeURIComponent(current);
        } catch {
          break; // malformed escape — treat the segment as a literal name
        }
        if (decoded === current || encodeStreamSegment(decoded) !== current) break;
        current = decoded;
      }
      return current;
    })
    .join('/');
}

const streamPathChecks = z
  .string()
  .min(1)
  .max(400)
  .refine((v) => !v.startsWith('/') && !v.endsWith('/'), 'Stream path must not start or end with /')
  .refine((v) => !v.includes('//'), 'Stream path must not contain empty segments')
  .refine((v) => !/[?#\\]/.test(v), 'Stream path must not contain ?, # or \\')
  // eslint-disable-next-line no-control-regex
  .refine((v) => !/[\u0000-\u001f\u007f]/.test(v), 'Stream path must not contain control characters')
  .refine(
    (v) => !v.split('/').some((segment) => segment === '.' || segment === '..'),
    'Stream path must not contain . or .. segments',
  )
  .refine((v) => !/^[a-z][a-z0-9+.-]*:\/\//i.test(v), 'Enter the stream name or path only, not a full URL');

/** Normalises before validating, so the checks run on what will actually be stored. */
export const streamPathSchema = z.preprocess(
  (value) => (typeof value === 'string' ? normalizeStreamPath(value.trim()) : value),
  streamPathChecks,
);

/**
 * Pulls a bare 11-character video id out of whatever an admin pastes — the id
 * itself, a youtube.com/watch, youtu.be, or /embed/ URL — so only the id is
 * ever stored. Returns the input unchanged when nothing recognisable is
 * found, so the schema below can reject it with a real error instead of this
 * function guessing.
 */
export function extractYoutubeId(value: string): string {
  const trimmed = value.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;

  try {
    const url = new URL(trimmed);
    if (/(^|\.)youtu\.be$/.test(url.hostname)) return url.pathname.slice(1) || trimmed;
    if (/(^|\.)youtube\.com$/.test(url.hostname)) {
      if (url.pathname === '/watch') return url.searchParams.get('v') ?? trimmed;
      const embed = url.pathname.match(/^\/(?:embed|shorts)\/([a-zA-Z0-9_-]{11})/);
      if (embed) return embed[1];
    }
  } catch {
    // Not a URL — fall through and let the id validation reject it.
  }
  return trimmed;
}

export const youtubeIdSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() ? extractYoutubeId(value) : value),
  z.string().regex(/^[a-zA-Z0-9_-]{11}$/, 'Enter a YouTube video id or a youtube.com / youtu.be URL'),
);

export const upsertTitleSchema = z.object({
  type: TitleType,
  slug: slugSchema,
  name: z.string().min(1).max(200).trim(),
  synopsis: z.string().max(4000).trim().default(''),
  year: z.number().int().min(1888).max(2100).nullable().default(null),
  rating: MaturityRating.nullable().default(null),
  durationSec: z.number().int().min(0).nullable().default(null),
  posterUrl: z.string().max(1000).nullable().default(null),
  backdropUrl: z.string().max(1000).nullable().default(null),
  logoUrl: z.string().max(1000).nullable().default(null),
  trailerYoutubeId: youtubeIdSchema.nullable().default(null),
  streamPath: streamPathSchema.nullable().default(null),
  genreIds: z.array(z.string()).default([]),
  isPublished: z.boolean().default(false),
});
export type UpsertTitleInput = z.infer<typeof upsertTitleSchema>;

export const upsertSeasonSchema = z.object({
  number: z.number().int().min(0).max(100),
  name: z.string().max(120).trim().default(''),
});
export type UpsertSeasonInput = z.infer<typeof upsertSeasonSchema>;

export const upsertEpisodeSchema = z.object({
  seasonId: z.string().min(1),
  number: z.number().int().min(0).max(1000),
  name: z.string().min(1).max(200).trim(),
  synopsis: z.string().max(4000).trim().default(''),
  stillUrl: z.string().max(1000).nullable().default(null),
  durationSec: z.number().int().min(0).nullable().default(null),
  /**
   * Empty is allowed: a TMDB import creates the full episode list up front and
   * admins attach stream paths as the files arrive. Playback refuses episodes
   * that still have none.
   */
  streamPath: z.union([z.literal(''), streamPathSchema]).default(''),
});
export type UpsertEpisodeInput = z.infer<typeof upsertEpisodeSchema>;

export const catalogQuerySchema = paginationQuerySchema.extend({
  genre: z.string().optional(),
  type: TitleType.optional(),
  q: z.string().max(120).optional(),
});
export type CatalogQuery = z.infer<typeof catalogQuerySchema>;

export interface Genre {
  id: string;
  slug: string;
  name: string;
}

export interface TitleCard {
  id: string;
  type: TitleType;
  slug: string;
  name: string;
  year: number | null;
  rating: MaturityRating | null;
  durationSec: number | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  logoUrl: string | null;
  synopsis: string;
  genres: Genre[];
}

export interface EpisodeSummary {
  id: string;
  number: number;
  name: string;
  synopsis: string;
  stillUrl: string | null;
  durationSec: number | null;
  progressSec?: number;
  /**
   * Whether a stream is attached yet. A boolean rather than the path itself —
   * viewers never need the Flussonic path, and not sending it keeps the
   * catalogue from advertising the shape of the media library.
   */
  playable: boolean;
}

export interface SeasonSummary {
  id: string;
  number: number;
  name: string;
  episodes: EpisodeSummary[];
}

export interface TitleDetail extends TitleCard {
  isPublished: boolean;
  trailerYoutubeId: string | null;
  streamPath: string | null;
  seasons: SeasonSummary[];
  inWatchlist: boolean;
  resume: { kind: 'movie' | 'episode'; id: string; positionSec: number; label: string } | null;
  cast: CreditSummary[];
  crew: CreditSummary[];
}
