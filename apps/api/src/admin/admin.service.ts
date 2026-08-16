import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { normalizeSearch } from '@ott/shared';
import type {
  AdminTitleListQuery,
  AwaitingStreams,
  BulkAttachResult,
  BulkPublishResult,
  Paginated,
  UpsertChannelInput,
  UpsertEpisodeInput,
  UpsertSeasonInput,
  UpsertTitleInput,
} from '@ott/shared';
import { PrismaService } from '../common/prisma.service';
import { RedisService } from '../common/redis.service';
import { HOME_CACHE_PREFIX } from '../rails/rails.cache';

type AdminTitleRow = Prisma.TitleGetPayload<{
  include: { genres: { include: { genre: true } }; _count: { select: { episodes: true; seasons: true } } };
}>;

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** Any catalog write invalidates every profile's cached home page. */
  private async bustHomeCache(): Promise<void> {
    await this.redis.invalidatePrefix(HOME_CACHE_PREFIX);
  }

  async listTitles(query: AdminTitleListQuery): Promise<Paginated<AdminTitleRow>> {
    const where = query.q ? { name: { contains: query.q, mode: 'insensitive' as const } } : undefined;

    const [items, total] = await Promise.all([
      this.prisma.title.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        include: {
          genres: { include: { genre: true } },
          _count: { select: { episodes: true, seasons: true } },
        },
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
      }),
      this.prisma.title.count({ where }),
    ]);

    return {
      items,
      page: query.page,
      perPage: query.perPage,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.perPage)),
    };
  }

  /** Catalog-wide counts for the dashboard — deliberately not derived from a page of listTitles(). */
  async titleStats(): Promise<{ total: number; published: number; movies: number; series: number }> {
    const [total, published, movies, series] = await Promise.all([
      this.prisma.title.count(),
      this.prisma.title.count({ where: { isPublished: true } }),
      this.prisma.title.count({ where: { type: 'MOVIE' } }),
      this.prisma.title.count({ where: { type: 'SERIES' } }),
    ]);
    return { total, published, movies, series };
  }

  async getTitle(id: string) {
    const title = await this.prisma.title.findUnique({
      where: { id },
      include: {
        genres: { include: { genre: true } },
        seasons: { orderBy: { number: 'asc' }, include: { episodes: { orderBy: { number: 'asc' } } } },
      },
    });
    if (!title) throw new NotFoundException('Title not found');
    return title;
  }

  async createTitle(input: UpsertTitleInput) {
    await this.assertSlugFree(input.slug);
    this.assertStreamConsistency(input);
    const created = await this.prisma.title.create({
      data: {
        ...stripGenres(input),
        searchText: normalizeSearch(input.name),
        publishedAt: input.isPublished ? new Date() : null,
        genres: { create: input.genreIds.map((genreId) => ({ genreId })) },
      },
    });
    await this.bustHomeCache();
    return created;
  }

  async updateTitle(id: string, input: UpsertTitleInput) {
    const existing = await this.prisma.title.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Title not found');
    if (existing.slug !== input.slug) await this.assertSlugFree(input.slug);
    this.assertStreamConsistency(input);

    const updated = await this.prisma.title.update({
      where: { id },
      data: {
        ...stripGenres(input),
        searchText: normalizeSearch(input.name),
        // Stamp publishedAt on the transition so New Releases orders by the
        // moment it went live, not by when the row was first created.
        publishedAt: input.isPublished ? (existing.publishedAt ?? new Date()) : null,
        genres: { deleteMany: {}, create: input.genreIds.map((genreId) => ({ genreId })) },
      },
    });
    await this.bustHomeCache();
    return updated;
  }

  async deleteTitle(id: string): Promise<void> {
    await this.prisma.title.delete({ where: { id } });
    await this.bustHomeCache();
  }

  /** A narrow patch for the Awaiting-streams dashboard — attach one path without the full title form. */
  async attachMovieStream(id: string, streamPath: string) {
    const title = await this.prisma.title.findUnique({ where: { id } });
    if (!title) throw new NotFoundException('Title not found');
    if (title.type !== 'MOVIE') throw new BadRequestException('Only movies carry a title-level stream path');

    const updated = await this.prisma.title.update({ where: { id }, data: { streamPath } });
    await this.bustHomeCache();
    return updated;
  }

  /**
   * Unpublishing is unconditional. Publishing skips any movie with no stream
   * path rather than failing the whole batch — the same "one bad row doesn't
   * sink the rest" shape as the subtitle bulk import.
   */
  async bulkPublishTitles(ids: string[], isPublished: boolean): Promise<BulkPublishResult> {
    if (!isPublished) {
      const result = await this.prisma.title.updateMany({
        where: { id: { in: ids } },
        data: { isPublished: false, publishedAt: null },
      });
      await this.bustHomeCache();
      return { updated: result.count };
    }

    const titles = await this.prisma.title.findMany({ where: { id: { in: ids } } });
    const skipped: NonNullable<BulkPublishResult['skipped']> = [];
    const okIds: string[] = [];

    for (const title of titles) {
      if (title.type === 'MOVIE' && !title.streamPath) {
        skipped.push({ id: title.id, name: title.name, reason: 'No stream path set' });
      } else {
        okIds.push(title.id);
      }
    }

    if (okIds.length) {
      await this.prisma.title.updateMany({ where: { id: { in: okIds } }, data: { isPublished: true } });
      // Stamped only for rows transitioning from unset, same as the single-title update.
      await this.prisma.title.updateMany({
        where: { id: { in: okIds }, publishedAt: null },
        data: { publishedAt: new Date() },
      });
    }

    await this.bustHomeCache();
    return { updated: okIds.length, skipped };
  }

  async createSeason(titleId: string, input: UpsertSeasonInput) {
    const title = await this.prisma.title.findUnique({ where: { id: titleId } });
    if (!title) throw new NotFoundException('Title not found');
    if (title.type !== 'SERIES') throw new BadRequestException('Only series can have seasons');
    return this.prisma.season.create({ data: { ...input, titleId } });
  }

  async deleteSeason(id: string): Promise<void> {
    await this.prisma.season.delete({ where: { id } });
    await this.bustHomeCache();
  }

  async upsertEpisode(titleId: string, episodeId: string | null, input: UpsertEpisodeInput) {
    const season = await this.prisma.season.findFirst({ where: { id: input.seasonId, titleId } });
    if (!season) throw new NotFoundException('Season not found on this title');

    const data = { ...input, titleId };
    const saved = episodeId
      ? await this.prisma.episode.update({ where: { id: episodeId }, data })
      : await this.prisma.episode.create({ data });
    await this.bustHomeCache();
    return saved;
  }

  async deleteEpisode(id: string): Promise<void> {
    await this.prisma.episode.delete({ where: { id } });
    await this.bustHomeCache();
  }

  /**
   * Every episode gets its own attempt, matching the subtitle bulk import —
   * one mismatched or already-deleted episode never blocks the rest.
   */
  async bulkAttachStreams(
    titleId: string,
    items: { episodeId: string; streamPath: string }[],
  ): Promise<BulkAttachResult[]> {
    const results: BulkAttachResult[] = [];

    for (const item of items) {
      try {
        const episode = await this.prisma.episode.findFirst({ where: { id: item.episodeId, titleId } });
        if (!episode) throw new Error('Episode not found on this title');
        await this.prisma.episode.update({ where: { id: item.episodeId }, data: { streamPath: item.streamPath } });
        results.push({ episodeId: item.episodeId, ok: true });
      } catch (err) {
        results.push({ episodeId: item.episodeId, ok: false, error: err instanceof Error ? err.message : 'Update failed' });
      }
    }

    await this.bustHomeCache();
    return results;
  }

  async listChannels() {
    return this.prisma.channel.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
  }

  async createChannel(input: UpsertChannelInput) {
    const clash = await this.prisma.channel.findUnique({ where: { slug: input.slug } });
    if (clash) throw new BadRequestException('A channel with that slug already exists');
    const created = await this.prisma.channel.create({
      data: { ...input, searchText: normalizeSearch(input.name) },
    });
    await this.bustHomeCache();
    return created;
  }

  async updateChannel(id: string, input: UpsertChannelInput) {
    const existing = await this.prisma.channel.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Channel not found');
    if (existing.slug !== input.slug) {
      const clash = await this.prisma.channel.findUnique({ where: { slug: input.slug } });
      if (clash) throw new BadRequestException('A channel with that slug already exists');
    }
    const updated = await this.prisma.channel.update({
      where: { id },
      data: { ...input, searchText: normalizeSearch(input.name) },
    });
    await this.bustHomeCache();
    return updated;
  }

  async deleteChannel(id: string): Promise<void> {
    await this.prisma.channel.delete({ where: { id } });
    await this.bustHomeCache();
  }

  /** Channels always carry a stream path (required at creation), so this is unconditional. */
  async bulkPublishChannels(ids: string[], isPublished: boolean): Promise<BulkPublishResult> {
    const result = await this.prisma.channel.updateMany({ where: { id: { in: ids } }, data: { isPublished } });
    await this.bustHomeCache();
    return { updated: result.count };
  }

  async listGenres() {
    return this.prisma.genre.findMany({ orderBy: { name: 'asc' } });
  }

  async createGenre(name: string, slug: string) {
    return this.prisma.genre.create({ data: { name, slug } });
  }

  async listUsers() {
    return this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        _count: { select: { profiles: true } },
      },
    });
  }

  async setUserRole(id: string, role: 'USER' | 'ADMIN') {
    return this.prisma.user.update({ where: { id }, data: { role }, select: { id: true, role: true } });
  }

  /** Replaces the programme window covered by the payload, so re-imports are idempotent. */
  async importProgrammes(
    channelId: string,
    programmes: { title: string; description: string; startsAt: Date; endsAt: Date }[],
  ): Promise<{ imported: number }> {
    const channel = await this.prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) throw new NotFoundException('Channel not found');
    if (!programmes.length) return { imported: 0 };

    const from = new Date(Math.min(...programmes.map((p) => p.startsAt.getTime())));
    const to = new Date(Math.max(...programmes.map((p) => p.endsAt.getTime())));

    await this.prisma.$transaction([
      this.prisma.programme.deleteMany({
        where: { channelId, startsAt: { gte: from }, endsAt: { lte: to } },
      }),
      this.prisma.programme.createMany({
        data: programmes.map((p) => ({ ...p, channelId })),
        skipDuplicates: true,
      }),
    ]);

    return { imported: programmes.length };
  }

  /**
   * Everything with no stream attached yet, across the whole catalog — the
   * thing an admin needs when the catalog has grown past attaching streams
   * one episode at a time.
   */
  async awaitingStreams(): Promise<AwaitingStreams> {
    const [movies, episodes] = await Promise.all([
      this.prisma.title.findMany({
        where: { type: 'MOVIE', streamPath: null },
        orderBy: { name: 'asc' },
        select: { id: true, slug: true, name: true, isPublished: true },
      }),
      this.prisma.episode.findMany({
        where: { streamPath: '' },
        orderBy: [{ title: { name: 'asc' } }, { season: { number: 'asc' } }, { number: 'asc' }],
        select: {
          id: true,
          number: true,
          name: true,
          titleId: true,
          title: { select: { name: true, isPublished: true } },
          season: { select: { number: true } },
        },
      }),
    ]);

    return {
      movies,
      episodes: episodes.map((e) => ({
        id: e.id,
        titleId: e.titleId,
        titleName: e.title.name,
        titleIsPublished: e.title.isPublished,
        seasonNumber: e.season.number,
        number: e.number,
        name: e.name,
      })),
    };
  }

  private async assertSlugFree(slug: string): Promise<void> {
    const clash = await this.prisma.title.findUnique({ where: { slug } });
    if (clash) throw new BadRequestException('A title with that slug already exists');
  }

  /** A movie without a stream would publish an unplayable Play button. */
  private assertStreamConsistency(input: UpsertTitleInput): void {
    if (input.type === 'MOVIE' && input.isPublished && !input.streamPath) {
      throw new BadRequestException('A published movie needs a stream path');
    }
  }
}

function stripGenres(input: UpsertTitleInput) {
  const { genreIds: _genreIds, ...rest } = input;
  return rest;
}
