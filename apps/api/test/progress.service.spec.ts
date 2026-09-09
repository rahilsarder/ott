import { describe, expect, it, vi } from 'vitest';
import { ProgressService } from '../src/progress/progress.service';
import type { PrismaService } from '../src/common/prisma.service';
import type { RedisService } from '../src/common/redis.service';

const TITLE_CARD_FIELDS = {
  type: 'MOVIE',
  slug: 'x',
  name: 'x',
  year: 2024,
  rating: null,
  durationSec: 7200,
  posterUrl: null,
  backdropUrl: null,
  logoUrl: null,
  synopsis: null,
  genres: [],
};

/** A WatchProgress row shaped exactly like what continueWatching's `include` produces. */
function watchProgressRow(overrides: {
  titleId: string;
  episodeId?: string | null;
  updatedAt: Date;
  positionSec?: number;
  durationSec?: number;
  episodeNumber?: number;
  seasonNumber?: number;
  episodeName?: string;
}) {
  const {
    titleId,
    episodeId = null,
    updatedAt,
    positionSec = 300,
    durationSec = 1200,
    episodeNumber,
    seasonNumber,
    episodeName,
  } = overrides;
  return {
    id: `wp_${titleId}_${episodeId ?? 'movie'}`,
    profileId: 'profile1',
    titleId,
    episodeId,
    episodeKey: episodeId ?? '',
    positionSec,
    durationSec,
    completedAt: null,
    updatedAt,
    title: { id: titleId, ...TITLE_CARD_FIELDS },
    episode: episodeId
      ? { id: episodeId, number: episodeNumber, name: episodeName, season: { number: seasonNumber } }
      : null,
  };
}

/**
 * Mimics real Prisma's findMany semantics for exactly what continueWatching
 * relies on: orderBy updatedAt desc, distinct keeping the first row per key
 * once ordered, then take. `where` is not simulated — fixtures are assumed
 * to already satisfy it, same as this repo's existing api-key.service.spec.ts.
 */
function makePrisma(rows: ReturnType<typeof watchProgressRow>[]): PrismaService {
  return {
    watchProgress: {
      findMany: vi.fn(async (args: { orderBy?: { updatedAt?: 'asc' | 'desc' }; distinct?: string[]; take?: number }) => {
        let result = [...rows];
        if (args.orderBy?.updatedAt === 'desc') {
          result.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
        }
        if (args.distinct?.includes('titleId')) {
          const seen = new Set<string>();
          result = result.filter((r) => {
            if (seen.has(r.titleId)) return false;
            seen.add(r.titleId);
            return true;
          });
        }
        if (typeof args.take === 'number') result = result.slice(0, args.take);
        return result;
      }),
    },
  } as unknown as PrismaService;
}

const noopRedis = {} as unknown as RedisService;

describe('ProgressService.continueWatching', () => {
  it('keeps only the most recently watched episode when a series has several in progress', async () => {
    const prisma = makePrisma([
      watchProgressRow({ titleId: 'series1', episodeId: 'ep1', updatedAt: new Date('2024-01-01') }),
      watchProgressRow({ titleId: 'series1', episodeId: 'ep2', updatedAt: new Date('2024-01-03') }),
      watchProgressRow({ titleId: 'series1', episodeId: 'ep3', updatedAt: new Date('2024-01-02') }),
    ]);

    const result = await new ProgressService(prisma, noopRedis).continueWatching('profile1');

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('ep2');
  });

  it('keeps every movie as its own entry, unaffected by the series dedup', async () => {
    const prisma = makePrisma([
      watchProgressRow({ titleId: 'movieA', updatedAt: new Date('2024-01-02') }),
      watchProgressRow({ titleId: 'movieB', updatedAt: new Date('2024-01-01') }),
    ]);

    const result = await new ProgressService(prisma, noopRedis).continueWatching('profile1');

    expect(result.map((r) => r.id).sort()).toEqual(['movieA', 'movieB']);
  });

  it('returns one entry per series alongside one entry per movie in a mixed rail', async () => {
    const prisma = makePrisma([
      watchProgressRow({ titleId: 'series1', episodeId: 'ep1', updatedAt: new Date('2024-01-01') }),
      watchProgressRow({ titleId: 'series1', episodeId: 'ep2', updatedAt: new Date('2024-01-04') }),
      watchProgressRow({ titleId: 'movieA', updatedAt: new Date('2024-01-03') }),
    ]);

    const result = await new ProgressService(prisma, noopRedis).continueWatching('profile1');

    expect(result.map((r) => r.id).sort()).toEqual(['ep2', 'movieA']);
  });

  it('excludes items barely started or effectively finished', async () => {
    const prisma = makePrisma([
      watchProgressRow({ titleId: 'movieA', updatedAt: new Date(), positionSec: 1, durationSec: 1200 }),
      watchProgressRow({ titleId: 'movieB', updatedAt: new Date(), positionSec: 1199, durationSec: 1200 }),
      watchProgressRow({ titleId: 'movieC', updatedAt: new Date(), positionSec: 300, durationSec: 1200 }),
    ]);

    const result = await new ProgressService(prisma, noopRedis).continueWatching('profile1');

    expect(result.map((r) => r.id)).toEqual(['movieC']);
  });

  it('labels an episode entry with its season/episode number and name', async () => {
    const prisma = makePrisma([
      watchProgressRow({
        titleId: 'series1',
        episodeId: 'ep1',
        updatedAt: new Date(),
        seasonNumber: 2,
        episodeNumber: 5,
        episodeName: 'The Reckoning',
      }),
    ]);

    const result = await new ProgressService(prisma, noopRedis).continueWatching('profile1');

    expect(result[0].label).toBe('S2 E5 · The Reckoning');
    expect(result[0].kind).toBe('episode');
  });
});
