import { z } from 'zod';
import { TitleType } from './enums';
import type { TitleCard } from './catalog';

/** Comma-separated in the URL, an array everywhere else. */
const csv = <T extends z.ZodTypeAny>(inner: T) =>
  z.preprocess(
    (v) => (typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : v),
    z.array(inner).default([]),
  );

export const browseSort = z.enum(['recent', 'title', 'year']);
export type BrowseSort = z.infer<typeof browseSort>;

export const browseQuerySchema = z.object({
  type: csv(TitleType),
  genre: csv(z.string().min(1).max(80)),
  language: csv(z.string().min(2).max(8)),
  q: z.string().max(120).optional(),
  sort: browseSort.default('recent'),
  /** Opaque; the id of the last item on the previous page. */
  cursor: z.string().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(60).default(36),
});
export type BrowseQuery = z.infer<typeof browseQuerySchema>;

export interface FacetBucket {
  /** What goes back in the query string. */
  value: string;
  /** What a person reads — a language in its own script, a genre by name. */
  label: string;
  count: number;
}

export interface BrowseFacets {
  type: FacetBucket[];
  genre: FacetBucket[];
  language: FacetBucket[];
}

export interface BrowseResponse {
  items: TitleCard[];
  /** Null once there is nothing further to load. */
  nextCursor: string | null;
  /** Matches for the current filters, before paging. */
  total: number;
  /**
   * Counts are computed with every *other* filter applied but not the facet's
   * own — so a language count answers "how many would I have if I picked this
   * instead", which is the question someone combining filters is asking.
   */
  facets: BrowseFacets;
}
