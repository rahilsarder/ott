import { Injectable } from '@nestjs/common';
import type { HomeResponse, Rail, TitleCard } from '@ott/shared';
import { PrismaService } from '../common/prisma.service';
import { RedisService } from '../common/redis.service';
import { titleCardSelect, toTitleCard } from '../catalog/catalog.mapper';
import { ChannelsService } from '../channels/channels.service';
import { ProgressService } from '../progress/progress.service';
import { HOME_CACHE_TTL_SEC, homeCacheKey } from './rails.cache';

const RAIL_SIZE = 20;
const TRENDING_WINDOW_DAYS = 7;
/**
 * More shelves rather than longer ones. Long rows go unscrolled, so at a
 * couple of thousand titles extra rows create more entry points into the
 * catalogue than extra items in a row ever would.
 */
const MAX_GENRE_RAILS = 10;
/** Below this a shelf looks sparse rather than curated, so it is not rendered. */
const MIN_RAIL_ITEMS = 3;

@Injectable()
export class RailsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly progress: ProgressService,
    private readonly channels: ChannelsService,
  ) {}

  /**
   * Everything the home page needs in one round trip. The expensive rails are
   * cached per profile in Redis; Continue Watching is spliced in fresh each time
   * so a viewer never sees a stale resume position.
   */
  async home(profileId: string | null): Promise<HomeResponse> {
    const cacheKey = profileId ? homeCacheKey(profileId) : `${homeCacheKey('anon')}`;
    const cached = await this.redis.getJson<HomeResponse>(cacheKey);

    const base = cached ?? (await this.buildBase(profileId));
    if (!cached) await this.redis.setJson(cacheKey, base, HOME_CACHE_TTL_SEC);

    if (!profileId) return base;

    const continueItems = await this.progress.continueWatching(profileId);
    const rails: Rail[] = [...base.rails];
    if (continueItems.length) {
      rails.unshift({
        kind: 'continue',
        id: 'continue',
        title: 'Carry on watching',
        meta: `${continueItems.length} in progress`,
        continueItems,
      });
    }
    return { ...base, rails };
  }

  private async buildBase(profileId: string | null): Promise<HomeResponse> {
    const [trending, fresh, liveChannels, genres, watchlist, affinity] = await Promise.all([
      this.trending(),
      this.newReleases(),
      this.channels.listWithNowNext(),
      // Ordered by catalogue share, so the biggest genres earn a shelf first.
      this.topGenres(MAX_GENRE_RAILS),
      profileId ? this.progress.watchlist(profileId) : Promise.resolve([]),
      profileId ? this.becauseYouWatched(profileId) : Promise.resolve(null),
    ]);

    const rails: Rail[] = [];

    if (watchlist.length) {
      rails.push({
        kind: 'watchlist',
        id: 'watchlist',
        title: 'Saved',
        meta: `${watchlist.length} title${watchlist.length === 1 ? '' : 's'}`,
        href: '/my-list',
        titles: watchlist,
      });
    }
    if (trending.length) {
      rails.push({
        kind: 'trending',
        id: 'trending',
        title: 'Trending now',
        meta: `Top ${trending.length} this week`,
        titles: trending,
      });
    }
    if (liveChannels.length) {
      rails.push({
        kind: 'live',
        id: 'live',
        title: 'On air',
        meta: `${liveChannels.length} channel${liveChannels.length === 1 ? '' : 's'}`,
        href: '/live',
        channels: liveChannels.slice(0, RAIL_SIZE),
      });
    }
    if (affinity) rails.push(affinity);
    if (fresh.length) {
      rails.push({ kind: 'new', id: 'new', title: 'New this week', meta: 'Recently added', titles: fresh });
    }

    for (const genre of genres) {
      const titles = await this.byGenre(genre.slug);
      // A genre needs enough titles to look composed rather than sparse.
      if (titles.length >= MIN_RAIL_ITEMS) {
        rails.push({
          kind: 'genre',
          id: `genre-${genre.slug}`,
          title: genre.name,
          meta: `${genre.titleCount} title${genre.titleCount === 1 ? '' : 's'}`,
          href: `/browse/${genre.slug}`,
          titles,
        });
      }
    }

    return { billboard: fresh[0] ?? trending[0] ?? null, rails };
  }

  /**
   * Genres ranked by how much published catalogue sits in each. At a couple of
   * thousand titles the alphabetical first six is arbitrary — this puts the
   * shelves people can actually browse at the top.
   */
  private async topGenres(limit: number): Promise<{ slug: string; name: string; titleCount: number }[]> {
    const grouped = await this.prisma.titleGenre.groupBy({
      by: ['genreId'],
      where: { title: { isPublished: true } },
      _count: { genreId: true },
      orderBy: { _count: { genreId: 'desc' } },
      take: limit,
    });

    const genres = await this.prisma.genre.findMany({
      where: { id: { in: grouped.map((g) => g.genreId) } },
      select: { id: true, slug: true, name: true },
    });

    const byId = new Map(genres.map((g) => [g.id, g]));
    return grouped
      .map((g) => {
        const genre = byId.get(g.genreId);
        return genre ? { slug: genre.slug, name: genre.name, titleCount: g._count.genreId } : null;
      })
      .filter((g): g is { slug: string; name: string; titleCount: number } => g !== null);
  }

  private async trending(): Promise<TitleCard[]> {
    const since = new Date(Date.now() - TRENDING_WINDOW_DAYS * 86_400_000);
    const grouped = await this.prisma.playEvent.groupBy({
      by: ['titleId'],
      where: { createdAt: { gte: since }, titleId: { not: null } },
      _count: { titleId: true },
      orderBy: { _count: { titleId: 'desc' } },
      take: RAIL_SIZE,
    });

    const ids = grouped.map((g) => g.titleId!).filter(Boolean);
    if (!ids.length) return this.newReleases();

    const rows = await this.prisma.title.findMany({
      where: { id: { in: ids }, isPublished: true },
      select: titleCardSelect,
    });

    // groupBy already ordered by play count; restore that order after the fetch.
    const order = new Map(ids.map((id, index) => [id, index]));
    return rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)).map(toTitleCard);
  }

  private async newReleases(): Promise<TitleCard[]> {
    const rows = await this.prisma.title.findMany({
      where: { isPublished: true },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      take: RAIL_SIZE,
      select: titleCardSelect,
    });
    return rows.map(toTitleCard);
  }

  private async byGenre(slug: string): Promise<TitleCard[]> {
    const rows = await this.prisma.title.findMany({
      where: { isPublished: true, genres: { some: { genre: { slug } } } },
      orderBy: [{ publishedAt: 'desc' }],
      take: RAIL_SIZE,
      select: titleCardSelect,
    });
    return rows.map(toTitleCard);
  }

  /**
   * Cheap affinity signal: take the genre of the most recently watched title and
   * surface other titles in it. No model, no training — good enough until there
   * is enough history to justify one.
   */
  private async becauseYouWatched(profileId: string): Promise<Rail | null> {
    const recent = await this.prisma.watchProgress.findFirst({
      where: { profileId },
      orderBy: { updatedAt: 'desc' },
      include: { title: { include: { genres: { include: { genre: true } } } } },
    });

    const seedGenre = recent?.title.genres[0]?.genre;
    if (!recent || !seedGenre) return null;

    const rows = await this.prisma.title.findMany({
      where: {
        isPublished: true,
        id: { not: recent.titleId },
        genres: { some: { genreId: seedGenre.id } },
      },
      take: RAIL_SIZE,
      select: titleCardSelect,
    });
    if (rows.length < 3) return null;

    return {
      kind: 'because',
      id: `because-${recent.titleId}`,
      title: `Because you watched ${recent.title.name}`,
      titles: rows.map(toTitleCard),
    };
  }
}
