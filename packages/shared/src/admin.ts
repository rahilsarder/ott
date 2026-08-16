import { z } from 'zod';
import { streamPathSchema } from './catalog';
import { paginationQuerySchema } from './enums';

export const adminTitleListQuerySchema = paginationQuerySchema.extend({
  q: z.string().max(120).optional(),
});
export type AdminTitleListQuery = z.infer<typeof adminTitleListQuerySchema>;

export const bulkPublishSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(500),
  isPublished: z.boolean(),
});
export type BulkPublishInput = z.infer<typeof bulkPublishSchema>;

export interface BulkPublishResult {
  updated: number;
  /** Movies that can't publish without a stream path — only ever set on titles. */
  skipped?: { id: string; name: string; reason: string }[];
}

export const bulkAttachStreamsSchema = z.object({
  items: z
    .array(z.object({ episodeId: z.string().min(1), streamPath: streamPathSchema }))
    .min(1)
    .max(500),
});
export type BulkAttachStreamsInput = z.infer<typeof bulkAttachStreamsSchema>;

export interface BulkAttachResult {
  episodeId: string;
  ok: boolean;
  error?: string;
}

export interface AwaitingMovie {
  id: string;
  slug: string;
  name: string;
  isPublished: boolean;
}

export interface AwaitingEpisode {
  id: string;
  titleId: string;
  titleName: string;
  titleIsPublished: boolean;
  seasonNumber: number;
  number: number;
  name: string;
}

export interface AwaitingStreams {
  movies: AwaitingMovie[];
  episodes: AwaitingEpisode[];
}
