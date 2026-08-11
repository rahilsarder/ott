import { Injectable, NotFoundException } from '@nestjs/common';
import {
  RESUME_MAX_FRACTION,
  RESUME_MIN_FRACTION,
  type ContinueItem,
  type HeartbeatInput,
  type TitleCard,
} from '@ott/shared';
import { PrismaService } from '../common/prisma.service';
import { RedisService } from '../common/redis.service';
import { titleCardSelect, toTitleCard } from '../catalog/catalog.mapper';
import { homeCacheKey } from '../rails/rails.cache';

@Injectable()
export class ProgressService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async heartbeat(profileId: string, input: HeartbeatInput): Promise<void> {
    const titleId =
      input.kind === 'movie'
        ? input.id
        : (
            await this.prisma.episode.findUnique({ where: { id: input.id }, select: { titleId: true } })
          )?.titleId;

    if (!titleId) throw new NotFoundException('Playable not found');

    const episodeId = input.kind === 'episode' ? input.id : null;
    const positionSec = Math.floor(input.positionSec);
    const durationSec = Math.floor(input.durationSec);
    const finished = durationSec > 0 && positionSec / durationSec >= RESUME_MAX_FRACTION;

    await this.prisma.watchProgress.upsert({
      where: { profileId_titleId_episodeKey: { profileId, titleId, episodeKey: episodeId ?? '' } },
      create: {
        profileId,
        titleId,
        episodeId,
        episodeKey: episodeId ?? '',
        positionSec,
        durationSec,
        completedAt: finished ? new Date() : null,
      },
      update: {
        positionSec,
        durationSec,
        completedAt: finished ? new Date() : null,
      },
    });
  }

  async continueWatching(profileId: string, limit = 20): Promise<ContinueItem[]> {
    const rows = await this.prisma.watchProgress.findMany({
      where: { profileId, completedAt: null, durationSec: { gt: 0 } },
      orderBy: { updatedAt: 'desc' },
      take: limit * 2,
      include: {
        title: { select: titleCardSelect },
        episode: { include: { season: { select: { number: true } } } },
      },
    });

    return rows
      .filter((row) => {
        const fraction = row.positionSec / row.durationSec;
        return fraction > RESUME_MIN_FRACTION && fraction < RESUME_MAX_FRACTION;
      })
      .slice(0, limit)
      .map((row) => ({
        kind: row.episodeId ? ('episode' as const) : ('movie' as const),
        id: row.episodeId ?? row.titleId,
        title: toTitleCard(row.title) as TitleCard,
        label: row.episode ? `S${row.episode.season.number} E${row.episode.number} · ${row.episode.name}` : row.title.name,
        positionSec: row.positionSec,
        durationSec: row.durationSec,
        percent: Math.round((row.positionSec / row.durationSec) * 100),
      }));
  }

  async watchlist(profileId: string): Promise<TitleCard[]> {
    const rows = await this.prisma.watchlistItem.findMany({
      where: { profileId, title: { isPublished: true } },
      orderBy: { createdAt: 'desc' },
      include: { title: { select: titleCardSelect } },
    });
    return rows.map((row) => toTitleCard(row.title));
  }

  async addToWatchlist(profileId: string, titleId: string): Promise<void> {
    const exists = await this.prisma.title.count({ where: { id: titleId, isPublished: true } });
    if (!exists) throw new NotFoundException('Title not found');
    await this.prisma.watchlistItem.upsert({
      where: { profileId_titleId: { profileId, titleId } },
      create: { profileId, titleId },
      update: {},
    });
    await this.redis.client.del(homeCacheKey(profileId));
  }

  async removeFromWatchlist(profileId: string, titleId: string): Promise<void> {
    await this.prisma.watchlistItem.deleteMany({ where: { profileId, titleId } });
    await this.redis.client.del(homeCacheKey(profileId));
  }
}
