import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { PlayableKind, PlaybackSession } from '@ott/shared';
import { PrismaService } from '../common/prisma.service';
import { SubtitlesService } from '../subtitles/subtitles.service';
import { FlussonicService } from './flussonic.service';

@Injectable()
export class PlaybackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly flussonic: FlussonicService,
    private readonly subtitles: SubtitlesService,
  ) {}

  async createSession(
    kind: PlayableKind,
    id: string,
    profileId: string | null,
    clientIp: string,
  ): Promise<PlaybackSession> {
    switch (kind) {
      case 'movie':
        return this.movieSession(id, profileId, clientIp);
      case 'episode':
        return this.episodeSession(id, profileId, clientIp);
      case 'channel':
        return this.channelSession(id, profileId, clientIp);
    }
  }

  private async movieSession(id: string, profileId: string | null, clientIp: string): Promise<PlaybackSession> {
    const title = await this.prisma.title.findUnique({ where: { id } });
    if (!title) throw new NotFoundException('Title not found');
    if (!title.isPublished) throw new ForbiddenException('Title is not available');
    if (!title.streamPath) throw new NotFoundException('This title has no stream configured');

    const signed = this.flussonic.signManifest(title.streamPath, clientIp, false);
    // Resume position and play-event tracking are both profile-scoped (PlayEvent.profileId
    // is a required FK) — an anonymous viewer always starts from 0 and generates no event.
    const progress = profileId
      ? await this.prisma.watchProgress.findFirst({ where: { profileId, titleId: title.id, episodeId: null } })
      : null;
    const subtitles = await this.subtitles.forSession(title.id, null);

    if (profileId) await this.recordPlay({ profileId, titleId: title.id });

    return {
      kind: 'movie',
      id: title.id,
      manifestUrl: signed.url,
      isLive: false,
      expiresAt: signed.expiresAt,
      startPositionSec: resumeFrom(progress),
      durationSec: title.durationSec,
      title: title.name,
      subtitle: null,
      backdropUrl: title.backdropUrl,
      subtitles,
      nextEpisodeId: null,
      creditsLeadSec: null,
    };
  }

  private async episodeSession(id: string, profileId: string | null, clientIp: string): Promise<PlaybackSession> {
    const episode = await this.prisma.episode.findUnique({
      where: { id },
      include: { title: true, season: true },
    });
    if (!episode) throw new NotFoundException('Episode not found');
    if (!episode.title.isPublished) throw new ForbiddenException('Title is not available');
    // TMDB imports create the episode list before the files exist.
    if (!episode.streamPath) throw new NotFoundException('This episode has no stream configured yet');

    const signed = this.flussonic.signManifest(episode.streamPath, clientIp, false);
    const progress = profileId
      ? await this.prisma.watchProgress.findFirst({
          where: { profileId, titleId: episode.titleId, episodeId: episode.id },
        })
      : null;
    const subtitles = await this.subtitles.forSession(episode.titleId, episode.id);

    if (profileId) await this.recordPlay({ profileId, titleId: episode.titleId, episodeId: episode.id });

    return {
      kind: 'episode',
      id: episode.id,
      manifestUrl: signed.url,
      isLive: false,
      expiresAt: signed.expiresAt,
      startPositionSec: resumeFrom(progress),
      durationSec: episode.durationSec,
      title: episode.title.name,
      subtitle: `S${episode.season.number} E${episode.number} · ${episode.name}`,
      backdropUrl: episode.stillUrl ?? episode.title.backdropUrl,
      subtitles,
      nextEpisodeId: await this.findNextEpisodeId(episode.titleId, episode.season.number, episode.number),
      creditsLeadSec: episode.title.creditsLeadSec,
    };
  }

  private async channelSession(id: string, profileId: string | null, clientIp: string): Promise<PlaybackSession> {
    const channel = await this.prisma.channel.findFirst({
      where: { OR: [{ id }, { slug: id }] },
    });
    if (!channel) throw new NotFoundException('Channel not found');
    if (!channel.isPublished) throw new ForbiddenException('Channel is not available');

    const signed = this.flussonic.signManifest(channel.streamPath, clientIp, true);
    const now = new Date();
    const programme = await this.prisma.programme.findFirst({
      where: { channelId: channel.id, startsAt: { lte: now }, endsAt: { gt: now } },
    });

    if (profileId) await this.recordPlay({ profileId, channelId: channel.id });

    return {
      kind: 'channel',
      id: channel.id,
      manifestUrl: signed.url,
      isLive: true,
      expiresAt: signed.expiresAt,
      startPositionSec: 0,
      durationSec: null,
      title: channel.name,
      subtitle: programme?.title ?? null,
      backdropUrl: channel.logoUrl,
      subtitles: [],
      nextEpisodeId: null,
      creditsLeadSec: null,
    };
  }

  /**
   * Next episode within the season, else the first episode of the next season.
   * Drives the player's autoplay countdown.
   */
  private async findNextEpisodeId(titleId: string, seasonNumber: number, episodeNumber: number): Promise<string | null> {
    const withinSeason = await this.prisma.episode.findFirst({
      where: { titleId, season: { number: seasonNumber }, number: { gt: episodeNumber } },
      orderBy: { number: 'asc' },
      select: { id: true },
    });
    if (withinSeason) return withinSeason.id;

    const nextSeason = await this.prisma.episode.findFirst({
      where: { titleId, season: { number: { gt: seasonNumber } } },
      orderBy: [{ season: { number: 'asc' } }, { number: 'asc' }],
      select: { id: true },
    });
    return nextSeason?.id ?? null;
  }

  private async recordPlay(data: {
    profileId: string;
    titleId?: string;
    episodeId?: string;
    channelId?: string;
  }): Promise<void> {
    await this.prisma.playEvent.create({ data });
  }

  /** Resolves the stream name behind a token so the auth callback can verify it. */
  async resolveStreamPath(kind: PlayableKind, id: string): Promise<string | null> {
    if (kind === 'movie') {
      const t = await this.prisma.title.findUnique({ where: { id }, select: { streamPath: true } });
      return t?.streamPath ?? null;
    }
    if (kind === 'episode') {
      const e = await this.prisma.episode.findUnique({ where: { id }, select: { streamPath: true } });
      return e?.streamPath ?? null;
    }
    const c = await this.prisma.channel.findUnique({ where: { id }, select: { streamPath: true } });
    return c?.streamPath ?? null;
  }
}

function resumeFrom(progress: { positionSec: number; completedAt: Date | null } | null): number {
  if (!progress || progress.completedAt) return 0;
  return progress.positionSec;
}
