import type { TitleCard } from './catalog';

export interface PersonSummary {
  id: string;
  tmdbId: number;
  name: string;
  profileUrl: string | null;
}

/** A person page: who they are, plus what of theirs you can actually watch here. */
export interface PersonDetail extends PersonSummary {
  /** Distinct roles they are credited with across the catalog, e.g. ["Actor", "Director"]. */
  roles: string[];
  titles: (TitleCard & { role: string })[];
}
