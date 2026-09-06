import { z } from 'zod';
import type { TitleCard } from './catalog';
import type { Channel } from './channel';

export type RailKind = 'continue' | 'trending' | 'new' | 'because' | 'genre' | 'watchlist' | 'live';

export interface ContinueItem {
  kind: 'movie' | 'episode';
  id: string;
  title: TitleCard;
  label: string;
  positionSec: number;
  durationSec: number;
  percent: number;
}

export interface Rail {
  kind: RailKind;
  id: string;
  title: string;
  /** Quiet line beside the heading — "4 in progress", "Added since 2 Aug". */
  meta?: string;
  /**
   * Where "All →" leads. Set by the server so the client never has to guess a
   * route, and omitted when a shelf has nowhere fuller to go — a dead link is
   * worse than no link.
   */
  href?: string;
  titles?: TitleCard[];
  continueItems?: ContinueItem[];
  channels?: Channel[];
}

export interface HomeResponse {
  billboard: TitleCard | null;
  rails: Rail[];
}

/**
 * An anonymous viewer's "Carry on watching" is built client-side from
 * localStorage (the server has no profile to scope real progress rows to),
 * so the client already knows positionSec/durationSec/percent for each item —
 * it only needs the server to resolve id -> title card + label, the same way
 * ProgressService.continueWatching does for a signed-in profile.
 */
export const continueHydrationSchema = z.object({
  items: z
    .array(z.object({ kind: z.enum(['movie', 'episode']), id: z.string().min(1) }))
    .max(50),
});
export type ContinueHydrationRequest = z.infer<typeof continueHydrationSchema>;

export type ContinueHydrationResult = Pick<ContinueItem, 'kind' | 'id' | 'title' | 'label'>;
