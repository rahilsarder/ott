import { z } from 'zod';
import { MaturityRating } from './enums';

export const tmdbKind = z.enum(['movie', 'tv']);
export type TmdbKind = z.infer<typeof tmdbKind>;

export const tmdbSearchQuerySchema = z.object({
  kind: tmdbKind,
  q: z.string().min(2).max(120),
});
export type TmdbSearchQuery = z.infer<typeof tmdbSearchQuerySchema>;

export const tmdbPreviewQuerySchema = z.object({
  kind: tmdbKind,
  tmdbId: z.coerce.number().int().positive(),
});
export type TmdbPreviewQuery = z.infer<typeof tmdbPreviewQuerySchema>;

/** Which parts of a preview to write. Unchecked parts keep their current value. */
export const tmdbApplyFieldsSchema = z.object({
  metadata: z.boolean().default(true),
  artwork: z.boolean().default(true),
  trailer: z.boolean().default(true),
  genres: z.boolean().default(true),
  cast: z.boolean().default(true),
  episodes: z.boolean().default(true),
});
export type TmdbApplyFields = z.infer<typeof tmdbApplyFieldsSchema>;

export const tmdbApplySchema = z.object({
  kind: tmdbKind,
  tmdbId: z.number().int().positive(),
  fields: tmdbApplyFieldsSchema,
});
export type TmdbApplyInput = z.infer<typeof tmdbApplySchema>;

export interface TmdbSearchItem {
  tmdbId: number;
  name: string;
  year: number | null;
  overview: string;
  posterUrl: string | null;
  voteAverage: number | null;
}

export interface TmdbPerson {
  tmdbId: number;
  name: string;
  role: string;
  profileUrl: string | null;
  order: number;
}

export interface TmdbPreviewEpisode {
  number: number;
  name: string;
  synopsis: string;
  stillUrl: string | null;
  durationSec: number | null;
  airDate: string | null;
}

export interface TmdbPreviewSeason {
  number: number;
  name: string;
  episodes: TmdbPreviewEpisode[];
}

export interface TmdbPreview {
  kind: TmdbKind;
  tmdbId: number;
  name: string;
  slug: string;
  synopsis: string;
  year: number | null;
  rating: MaturityRating | null;
  durationSec: number | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  logoUrl: string | null;
  /** Bare YouTube video id of the best trailer found, or null if TMDB has none. */
  trailerYoutubeId: string | null;
  /** ISO 639-1 original language, used as the headline browse filter. */
  originalLanguage: string | null;
  genres: string[];
  cast: TmdbPerson[];
  crew: TmdbPerson[];
  seasons: TmdbPreviewSeason[];
}

export interface TmdbApplyResult {
  applied: string[];
  episodesCreated: number;
  /** Placeholder episodes TMDB no longer lists; deleted since nothing was lost. */
  episodesRemoved: number;
  /**
   * Episodes TMDB no longer lists that still have a stream attached. Kept
   * rather than deleted — a metadata sync must not destroy playable content —
   * and surfaced so an admin can decide.
   */
  orphanedEpisodes: string[];
}

/** A cast or crew member as shown on a title page. */
export interface CreditSummary {
  personId: string;
  tmdbId: number;
  name: string;
  role: string;
  profileUrl: string | null;
  kind: 'CAST' | 'CREW';
}
