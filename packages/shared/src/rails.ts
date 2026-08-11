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
