import { z } from 'zod';

/**
 * Curated rather than exhaustive — these are the languages the catalogue
 * actually needs. `languageLabel` still works for any ISO 639-1 code typed by
 * hand, so this list is a shortcut, not a limit.
 */
export const SUBTITLE_LANGUAGES = [
  'bn',
  'hi',
  'ml',
  'ta',
  'te',
  'ur',
  'pa',
  'gu',
  'mr',
  'kn',
  'or',
  'as',
  'en',
] as const;

export function languageLabel(code: string): string {
  try {
    return new Intl.DisplayNames([code], { type: 'language' }).of(code) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

export const languageCodeSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z]{2,3}$/, 'Use an ISO 639-1 language code, e.g. "bn"');

export const upsertSubtitleMetaSchema = z.object({
  titleId: z.string().min(1),
  episodeId: z.string().min(1).optional(),
  language: languageCodeSchema,
  label: z.string().trim().max(60).optional(),
});
export type UpsertSubtitleMeta = z.infer<typeof upsertSubtitleMetaSchema>;

/** `episodeIds` arrives as a JSON-encoded array because multipart fields are strings. */
export const bulkSubtitleMetaSchema = z.object({
  language: languageCodeSchema,
  episodeIds: z
    .string()
    .transform((raw, ctx) => {
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) throw new Error('not an array');
        return parsed;
      } catch {
        ctx.addIssue({ code: 'custom', message: 'episodeIds must be a JSON array of episode ids' });
        return z.NEVER;
      }
    })
    .pipe(z.array(z.string().min(1)).min(1)),
});
export type BulkSubtitleMeta = z.infer<typeof bulkSubtitleMetaSchema>;

export interface SubtitleTrack {
  id: string;
  titleId: string;
  episodeId: string | null;
  language: string;
  label: string;
  vttUrl: string;
  createdAt: string;
}

export interface BulkSubtitleResult {
  episodeId: string;
  ok: boolean;
  error?: string;
  subtitle?: SubtitleTrack;
}
