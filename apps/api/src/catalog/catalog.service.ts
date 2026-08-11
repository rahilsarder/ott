import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  RESUME_MAX_FRACTION,
  RESUME_MIN_FRACTION,
  type CatalogQuery,
  type CreditSummary,
  type Genre,
  type Paginated,
  type PersonDetail,
  type TitleCard,
  type TitleDetail,
} from '@ott/shared';
import { PrismaService } from '../common/prisma.service';
import { titleCardSelect, toTitleCard } from './catalog.mapper';

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async genres(): Promise<Genre[]> {
    return this.prisma.genre.findMany({ orderBy: { name: 'asc' }, select: { id: true, slug: true, name: true } });
  }

  async browse(query: CatalogQuery): Promise<Paginated<TitleCard>> {
    const where: Prisma.TitleWhereInput = {
      isPublished: true,
      ...(query.type ? { type: query.type } : {}),
      ...(query.genre ? { genres: { some: { genre: { slug: query.genre } } } } : {}),
      ...(query.q ? { name: { contains: query.q, mode: 'insensitive' } } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.title.findMany({
        where,
        select: titleCardSelect,
        orderBy: [{ publishedAt: 'desc' }, { name: 'asc' }],
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
      }),
      this.prisma.title.count({ where }),
    ]);

    return {
      items: rows.map(toTitleCard),
      page: query.page,
      perPage: query.perPage,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.perPage)),
    };
  }

  async detail(slug: string, profileId: string | null): Promise<TitleDetail> {
    const title = await this.prisma.title.findFirst({
      where: { slug, isPublished: true },
      include: {
        genres: { select: { genre: { select: { id: true, slug: true, name: true } } } },
        seasons: {
          orderBy: { number: 'asc' },
          include: { episodes: { orderBy: { number: 'asc' } } },
        },
        credits: {
          orderBy: [{ kind: 'asc' }, { order: 'asc' }],
          include: { person: true },
        },
      },
    });
    if (!title) throw new NotFoundException('Title not found');

    const progress = profileId
      ? await this.prisma.watchProgress.findMany({ where: { profileId, titleId: title.id } })
      : [];
    const progressByEpisode = new Map(progress.filter((p) => p.episodeId).map((p) => [p.episodeId!, p]));

    const inWatchlist = profileId
      ? (await this.prisma.watchlistItem.count({ where: { profileId, titleId: title.id } })) > 0
      : false;

    return {
      ...toTitleCard(title),
      isPublished: title.isPublished,
      trailerYoutubeId: title.trailerYoutubeId,
      streamPath: title.streamPath,
      inWatchlist,
      seasons: title.seasons.map((season) => ({
        id: season.id,
        number: season.number,
        name: season.name,
        episodes: season.episodes.map((ep) => ({
          id: ep.id,
          number: ep.number,
          name: ep.name,
          synopsis: ep.synopsis,
          stillUrl: ep.stillUrl,
          durationSec: ep.durationSec,
          progressSec: progressByEpisode.get(ep.id)?.positionSec,
          playable: Boolean(ep.streamPath),
        })),
      })),
      resume: pickResume(title, progress),
      cast: title.credits.filter((c) => c.kind === 'CAST').map(toCreditSummary),
      crew: title.credits.filter((c) => c.kind === 'CREW').map(toCreditSummary),
    };
  }

  /**
   * A person page shows only what is actually playable here — a viewer clicking
   * an actor should never land on a list of titles this service does not carry.
   */
  async person(personId: string): Promise<PersonDetail> {
    const person = await this.prisma.person.findFirst({
      where: { OR: [{ id: personId }, { tmdbId: Number(personId) || -1 }] },
      include: {
        credits: {
          where: { title: { isPublished: true } },
          orderBy: [{ order: 'asc' }],
          include: { title: { select: titleCardSelect } },
        },
      },
    });
    if (!person) throw new NotFoundException('Person not found');

    // One card per title, even when someone is credited twice (actor + director).
    const seen = new Map<string, { card: TitleCard; roles: string[] }>();
    for (const credit of person.credits) {
      const entry = seen.get(credit.titleId);
      const role = credit.role || (credit.kind === 'CAST' ? 'Actor' : 'Crew');
      if (entry) {
        if (!entry.roles.includes(role)) entry.roles.push(role);
      } else {
        seen.set(credit.titleId, { card: toTitleCard(credit.title), roles: [role] });
      }
    }

    const titles = [...seen.values()].map(({ card, roles }) => ({ ...card, role: roles.join(', ') }));

    return {
      id: person.id,
      tmdbId: person.tmdbId,
      name: person.name,
      profileUrl: person.profilePath,
      roles: [...new Set(titles.flatMap((t) => t.role.split(', ')))],
      titles,
    };
  }
}

function toCreditSummary(credit: {
  personId: string;
  role: string;
  kind: string;
  person: { tmdbId: number; name: string; profilePath: string | null };
}): CreditSummary {
  return {
    personId: credit.personId,
    tmdbId: credit.person.tmdbId,
    name: credit.person.name,
    role: credit.role,
    profileUrl: credit.person.profilePath,
    kind: credit.kind as 'CAST' | 'CREW',
  };
}

/**
 * What the big Play button should do: resume an in-flight item, otherwise start
 * the earliest unwatched episode, otherwise the beginning.
 */
function pickResume(
  title: {
    id: string;
    type: string;
    streamPath: string | null;
    seasons: { number: number; episodes: { id: string; number: number; streamPath: string }[] }[];
  },
  progress: { titleId: string; episodeId: string | null; positionSec: number; durationSec: number; completedAt: Date | null; updatedAt: Date }[],
): TitleDetail['resume'] {
  const inFlight = progress
    .filter((p) => !p.completedAt && p.durationSec > 0)
    .filter((p) => {
      const fraction = p.positionSec / p.durationSec;
      return fraction > RESUME_MIN_FRACTION && fraction < RESUME_MAX_FRACTION;
    })
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];

  if (title.type === 'MOVIE') {
    if (!title.streamPath) return null;
    return inFlight ? { kind: 'movie', id: title.id, positionSec: inFlight.positionSec, label: 'Resume' } : null;
  }

  /*
   * Only episodes with a stream can be offered. A TMDB import creates the whole
   * list up front, so without this the Play button happily points at an episode
   * that has no file behind it.
   */
  const episodes = title.seasons
    .flatMap((s) => s.episodes.map((e) => ({ ...e, seasonNumber: s.number })))
    .filter((e) => e.streamPath);
  if (episodes.length === 0) return null;

  if (inFlight?.episodeId) {
    const match = episodes.find((e) => e.id === inFlight.episodeId);
    if (match) {
      return {
        kind: 'episode',
        id: match.id,
        positionSec: inFlight.positionSec,
        label: `Resume S${match.seasonNumber} E${match.number}`,
      };
    }
  }

  const completed = new Set(progress.filter((p) => p.completedAt && p.episodeId).map((p) => p.episodeId!));
  const nextUp = episodes.find((e) => !completed.has(e.id)) ?? episodes[0];
  return {
    kind: 'episode',
    id: nextUp.id,
    positionSec: 0,
    label: `Play S${nextUp.seasonNumber} E${nextUp.number}`,
  };
}
