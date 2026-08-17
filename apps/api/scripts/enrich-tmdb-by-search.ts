import { PrismaClient } from '@prisma/client';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../src/config/env';
import { RedisService } from '../src/common/redis.service';
import { TmdbService } from '../src/tmdb/tmdb.service';
import { TmdbImportService } from '../src/tmdb/tmdb-import.service';
import type { TmdbSearchItem } from '@ott/shared';

const CONCURRENCY = 5;
const MAX_RETRIES = 3;
const YEAR_TOLERANCE = 1;

const prisma = new PrismaClient();

const fakeConfig = {
  get: (key: string) => (key === 'TMDB_LANGUAGE' ? process.env.TMDB_LANGUAGE || 'en-US' : process.env[key]),
} as unknown as ConfigService<Env, true>;

const redis = new RedisService(fakeConfig);
const tmdb = new TmdbService(fakeConfig, redis);
const tmdbImport = new TmdbImportService(tmdb, prisma, redis);

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const rateLimited = (err as Error).message?.toLowerCase().includes('rate limit');
      await sleep(rateLimited ? 2000 * attempt : 500 * attempt);
    }
  }
  throw lastErr;
}

interface CandidateTitle {
  id: string;
  name: string;
  year: number | null;
  type: 'MOVIE' | 'SERIES';
  genreNames: string[];
}

/** Narrows search results to plausible matches: exact year first, then +/-1 as a fallback. */
function yearCandidates(results: TmdbSearchItem[], year: number | null): TmdbSearchItem[] {
  if (year == null) return [];
  const exact = results.filter((r) => r.year === year);
  if (exact.length) return exact;
  return results.filter((r) => r.year != null && Math.abs(r.year - year) <= YEAR_TOLERANCE);
}

async function pickBestByGenre(
  candidates: TmdbSearchItem[],
  kind: 'movie' | 'tv',
  ourGenres: string[],
): Promise<TmdbSearchItem> {
  const ourSet = new Set(ourGenres.map((g) => g.toLowerCase()));
  let best = candidates[0];
  let bestScore = -1;
  for (const c of candidates) {
    const preview = await withRetry(() => tmdbImport.preview(kind, c.tmdbId));
    const overlap = preview.genres.filter((g) => ourSet.has(g.toLowerCase())).length;
    const score = overlap * 100 + (c.voteAverage ?? 0);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

async function processOne(title: CandidateTitle): Promise<'applied' | 'no_candidate' | 'failed'> {
  const kind = title.type === 'MOVIE' ? 'movie' : 'tv';
  try {
    const results = await withRetry(() => tmdbImport.search(kind, title.name));
    const candidates = yearCandidates(results, title.year);
    if (!candidates.length) return 'no_candidate';

    const chosen =
      candidates.length === 1 ? candidates[0] : await pickBestByGenre(candidates, kind, title.genreNames);

    const preview = await withRetry(() => tmdbImport.preview(kind, chosen.tmdbId));
    await tmdbImport.apply(title.id, preview, {
      metadata: true,
      artwork: true,
      trailer: true,
      genres: true,
      cast: true,
      episodes: true,
    });
    return 'applied';
  } catch (err) {
    console.error(`  FAILED ${title.id} (${title.name}, ${title.year}): ${(err as Error).message}`);
    return 'failed';
  }
}

async function main(): Promise<void> {
  const titles = await prisma.title.findMany({
    where: { tmdbSyncedAt: null },
    select: { id: true, name: true, year: true, type: true, genres: { include: { genre: true } } },
  });

  const work: CandidateTitle[] = titles.map((t) => ({
    id: t.id,
    name: t.name,
    year: t.year,
    type: t.type,
    genreNames: t.genres.map((tg) => tg.genre.name),
  }));

  console.log(`${work.length} titles without a synced TMDB match — starting search-based pass.`);

  let applied = 0;
  let noCandidate = 0;
  let failed = 0;
  const startedAt = Date.now();

  for (let i = 0; i < work.length; i += CONCURRENCY) {
    const batch = work.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(processOne));
    for (const r of results) {
      if (r === 'applied') applied++;
      else if (r === 'no_candidate') noCandidate++;
      else failed++;
    }

    const done = i + batch.length;
    if (done % 100 < CONCURRENCY) {
      const mins = ((Date.now() - startedAt) / 60000).toFixed(1);
      console.log(
        `  ...${done}/${work.length} (applied ${applied}, no_candidate ${noCandidate}, failed ${failed}) — ${mins}m elapsed`,
      );
    }
  }

  console.log(`Done. applied=${applied} no_candidate=${noCandidate} failed=${failed} total=${work.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await redis.client.quit();
  });
