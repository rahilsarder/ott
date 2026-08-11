import { z } from 'zod';

/** Below this fraction the viewer barely started; above it the item counts as finished. */
export const RESUME_MIN_FRACTION = 0.02;
export const RESUME_MAX_FRACTION = 0.95;

export const heartbeatSchema = z.object({
  kind: z.enum(['movie', 'episode']),
  id: z.string().min(1),
  positionSec: z.number().min(0),
  durationSec: z.number().min(0),
});
export type HeartbeatInput = z.infer<typeof heartbeatSchema>;

export const watchlistSchema = z.object({
  titleId: z.string().min(1),
});
export type WatchlistInput = z.infer<typeof watchlistSchema>;
