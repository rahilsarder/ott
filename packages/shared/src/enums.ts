import { z } from 'zod';

export const UserRole = z.enum(['USER', 'ADMIN']);
export type UserRole = z.infer<typeof UserRole>;

export const TitleType = z.enum(['MOVIE', 'SERIES']);
export type TitleType = z.infer<typeof TitleType>;

export const MaturityRating = z.enum(['G', 'PG', 'PG_13', 'R', 'NC_17', 'TV_Y', 'TV_G', 'TV_PG', 'TV_14', 'TV_MA']);
export type MaturityRating = z.infer<typeof MaturityRating>;

/** What is being played. Drives which table the id refers to and how the player behaves. */
export const PlayableKind = z.enum(['movie', 'episode', 'channel']);
export type PlayableKind = z.infer<typeof PlayableKind>;

export const cuid = z.string().min(1);

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(24),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export interface Paginated<T> {
  items: T[];
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}
