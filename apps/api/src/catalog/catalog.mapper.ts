import type { Prisma } from '@prisma/client';
import type { MaturityRating, TitleCard, TitleType } from '@ott/shared';

export const titleCardSelect = {
  id: true,
  type: true,
  slug: true,
  name: true,
  year: true,
  rating: true,
  durationSec: true,
  posterUrl: true,
  backdropUrl: true,
  logoUrl: true,
  synopsis: true,
  genres: { select: { genre: { select: { id: true, slug: true, name: true } } } },
} satisfies Prisma.TitleSelect;

type TitleCardRow = Prisma.TitleGetPayload<{ select: typeof titleCardSelect }>;

export function toTitleCard(row: TitleCardRow): TitleCard {
  return {
    id: row.id,
    type: row.type as TitleType,
    slug: row.slug,
    name: row.name,
    year: row.year,
    rating: row.rating as MaturityRating | null,
    durationSec: row.durationSec,
    posterUrl: row.posterUrl,
    backdropUrl: row.backdropUrl,
    logoUrl: row.logoUrl,
    synopsis: row.synopsis,
    genres: row.genres.map((g) => g.genre),
  };
}
