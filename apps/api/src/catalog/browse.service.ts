import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { BrowseFacets, BrowseQuery, BrowseResponse, FacetBucket } from '@ott/shared';
import { PrismaService } from '../common/prisma.service';
import { titleCardSelect, toTitleCard } from './catalog.mapper';

@Injectable()
export class BrowseService {
  constructor(private readonly prisma: PrismaService) {}

  async browse(query: BrowseQuery): Promise<BrowseResponse> {
    const where = this.buildWhere(query);

    const [rows, total, facets] = await Promise.all([
      this.prisma.title.findMany({
        where,
        select: titleCardSelect,
        orderBy: this.buildOrder(query.sort),
        take: query.limit,
        // Keyset rather than offset: at a couple of thousand titles a deep
        // `skip` makes the database count past every earlier row, and results
        // shift under the reader when something is published mid-scroll.
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      }),
      this.prisma.title.count({ where }),
      this.buildFacets(query),
    ]);

    return {
      items: rows.map(toTitleCard),
      // A short page means the end; only a full one can have more behind it.
      nextCursor: rows.length === query.limit ? (rows.at(-1)?.id ?? null) : null,
      total,
      facets,
    };
  }

  /**
   * @param omit Dimension to leave unfiltered, so a facet can count what
   *   picking each of its own values would yield.
   */
  private buildWhere(query: BrowseQuery, omit?: 'type' | 'genre' | 'language'): Prisma.TitleWhereInput {
    const where: Prisma.TitleWhereInput = { isPublished: true };

    if (query.type.length && omit !== 'type') where.type = { in: query.type };
    if (query.genre.length && omit !== 'genre') {
      // Every selected genre must match — narrowing, not widening, which is
      // what someone ticking a second box expects.
      where.AND = query.genre.map((slug) => ({ genres: { some: { genre: { slug } } } }));
    }
    if (query.language.length && omit !== 'language') where.originalLanguage = { in: query.language };
    if (query.q?.trim()) where.name = { contains: query.q.trim(), mode: 'insensitive' };

    return where;
  }

  private buildOrder(sort: BrowseQuery['sort']): Prisma.TitleOrderByWithRelationInput[] {
    // `id` is always last so the order is total — a keyset cursor needs every
    // row to have exactly one position.
    if (sort === 'title') return [{ name: 'asc' }, { id: 'asc' }];
    if (sort === 'year') return [{ year: 'desc' }, { id: 'desc' }];
    return [{ publishedAt: 'desc' }, { id: 'desc' }];
  }

  private async buildFacets(query: BrowseQuery): Promise<BrowseFacets> {
    const [types, genres, languages] = await Promise.all([
      this.prisma.title.groupBy({
        by: ['type'],
        where: this.buildWhere(query, 'type'),
        _count: { type: true },
      }),
      this.prisma.titleGenre.groupBy({
        by: ['genreId'],
        where: { title: this.buildWhere(query, 'genre') },
        _count: { genreId: true },
        orderBy: { _count: { genreId: 'desc' } },
        take: 24,
      }),
      this.prisma.title.groupBy({
        by: ['originalLanguage'],
        where: { ...this.buildWhere(query, 'language'), originalLanguage: { not: null } },
        _count: { originalLanguage: true },
        orderBy: { _count: { originalLanguage: 'desc' } },
      }),
    ]);

    const genreRows = await this.prisma.genre.findMany({
      where: { id: { in: genres.map((g) => g.genreId) } },
      select: { id: true, slug: true, name: true },
    });
    const genreById = new Map(genreRows.map((g) => [g.id, g]));

    return {
      type: types
        .map((t) => ({
          value: t.type,
          label: t.type === 'SERIES' ? 'Series' : 'Film',
          count: t._count.type,
        }))
        .sort((a, b) => b.count - a.count),

      genre: genres
        .map((g) => {
          const genre = genreById.get(g.genreId);
          return genre ? { value: genre.slug, label: genre.name, count: g._count.genreId } : null;
        })
        .filter((g): g is FacetBucket => g !== null),

      language: languages
        .filter((l) => l.originalLanguage)
        .map((l) => ({
          value: l.originalLanguage!,
          label: languageLabel(l.originalLanguage!),
          count: l._count.originalLanguage,
        })),
    };
  }
}

/**
 * A language in its own script — বাংলা rather than "Bengali" — which is how
 * speakers recognise it. Falls back to the raw code if the runtime cannot name
 * it, since an unknown tag is better than a blank row.
 */
function languageLabel(code: string): string {
  try {
    return new Intl.DisplayNames([code], { type: 'language' }).of(code) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}
