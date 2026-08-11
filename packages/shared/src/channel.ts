import { z } from 'zod';
import { slugSchema, streamPathSchema } from './catalog';

export const upsertChannelSchema = z.object({
  slug: slugSchema,
  name: z.string().min(1).max(120).trim(),
  description: z.string().max(2000).trim().default(''),
  category: z.string().min(1).max(60).trim().default('General'),
  logoUrl: z.string().max(1000).nullable().default(null),
  streamPath: streamPathSchema,
  hasDvr: z.boolean().default(false),
  sortOrder: z.number().int().min(0).max(10000).default(0),
  isPublished: z.boolean().default(false),
});
export type UpsertChannelInput = z.infer<typeof upsertChannelSchema>;

export interface Programme {
  id: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
}

export interface Channel {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  logoUrl: string | null;
  hasDvr: boolean;
  sortOrder: number;
  now: Programme | null;
  next: Programme | null;
}

export interface ChannelGroup {
  category: string;
  channels: Channel[];
}

export const guideQuerySchema = z.object({
  from: z.coerce.date().optional(),
  hours: z.coerce.number().int().min(1).max(24).default(4),
});
export type GuideQuery = z.infer<typeof guideQuerySchema>;

export interface GuideRow {
  channel: Omit<Channel, 'now' | 'next'>;
  programmes: Programme[];
}

export interface Guide {
  from: string;
  to: string;
  rows: GuideRow[];
}
