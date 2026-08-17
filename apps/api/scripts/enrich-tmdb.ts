import { PrismaClient } from '@prisma/client';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../src/config/env';
import { RedisService } from '../src/common/redis.service';
import { TmdbService } from '../src/tmdb/tmdb.service';
import { TmdbImportService } from '../src/tmdb/tmdb-import.service';
import * as fs from 'fs';

const DATA_DIR =
  '/private/tmp/claude-501/-Users-rahil-Programming-Claude-Code/80b6daad-3b32-4863-8fe5-f568ee69e358/scratchpad';
const CONCURRENCY = 5;
const MAX_RETRIES = 3;

const prisma = new PrismaClient();

// Minimal stand-in for Nest's ConfigService — both TmdbService and
// RedisService only ever call `.get(key, {infer:true})`, so a thin object
// reading straight from process.env satisfies them without booting Nest DI.
const fakeConfig = {
  get: (key: string) => (key === 'TMDB_LANGUAGE' ? process.env.TMDB_LANGUAGE || 'en-US' : process.env[key]),
} as unknown as ConfigService<Env, true>;

const redis = new RedisService(fakeConfig);
const tmdb = new TmdbService(fakeConfig, redis);
const tmdbImport = new TmdbImportService(tmdb, prisma, redis);

interface FindResponse {
  movie_results: { id: number }[];
  tv_results: { id: number }[];
}

async function findTmdbId(imdbId: string, kind: 'movie' | 'tv'): Promise<number | null> {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) throw new Error('TMDB_API_KEY not set in environment');
  const isV4Token = apiKey.startsWith('ey');
  const params = new URLSearchParams({ external_source: 'imdb_id', language: process.env.TMDB_LANGUAGE || 'en-US' });
  if (!isV4Token) params.set('api_key', apiKey);

  const res = await fetch(`https://api.themoviedb.org/3/find/${imdbId}?${params.toString()}`, {
    headers: { accept: 'application/json', ...(isV4Token ? { authorization: `Bearer ${apiKey}` } : {}) },
  });
  if (res.status === 429) throw Object.assign(new Error('rate limited'), { rateLimited: true });
  if (!res.ok) return null;
  const data = (await res.json()) as FindResponse;
  const results = kind === 'movie' ? data.movie_results : data.tv_results;
  return results?.[0]?.id ?? null;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function processOne(
  title: { id: string; type: 'MOVIE' | 'SERIES' },
  imdbid: string,
): Promise<'applied' | 'not_found' | 'failed'> {
  const kind = title.type === 'MOVIE' ? 'movie' : 'tv';
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const tmdbId = await findTmdbId(imdbid, kind);
      if (!tmdbId) return 'not_found';

      const preview = await tmdbImport.preview(kind, tmdbId);
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
      const rateLimited = (err as { rateLimited?: boolean }).rateLimited || (err as Error).message?.includes('429');
      if (rateLimited && attempt < MAX_RETRIES) {
        await sleep(2000 * attempt);
        continue;
      }
      if (attempt < MAX_RETRIES) {
        await sleep(500 * attempt);
        continue;
      }
      console.error(`  FAILED ${title.id} (${imdbid}): ${(err as Error).message}`);
      return 'failed';
    }
  }
  return 'failed';
}

async function main(): Promise<void> {
  const imdbMap = JSON.parse(fs.readFileSync(`${DATA_DIR}/title_imdb_map.json`, 'utf-8')) as {
    titleId: string;
    imdbid: string;
  }[];

  const titleIds = imdbMap.map((m) => m.titleId);
  const titles = await prisma.title.findMany({
    where: { id: { in: titleIds }, tmdbSyncedAt: null },
    select: { id: true, type: true },
  });
  const titleById = new Map(titles.map((t) => [t.id, t]));

  const work = imdbMap.filter((m) => titleById.has(m.titleId));
  console.log(`${imdbMap.length} candidates, ${work.length} not yet synced — starting.`);

  let applied = 0;
  let notFound = 0;
  let failed = 0;
  const startedAt = Date.now();

  for (let i = 0; i < work.length; i += CONCURRENCY) {
    const batch = work.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map((m) => processOne(titleById.get(m.titleId)!, m.imdbid)),
    );
    for (const r of results) {
      if (r === 'applied') applied++;
      else if (r === 'not_found') notFound++;
      else failed++;
    }

    const done = i + batch.length;
    if (done % 200 < CONCURRENCY) {
      const mins = ((Date.now() - startedAt) / 60000).toFixed(1);
      console.log(`  ...${done}/${work.length} (applied ${applied}, not_found ${notFound}, failed ${failed}) — ${mins}m elapsed`);
    }
  }

  console.log(`Done. applied=${applied} not_found=${notFound} failed=${failed} total=${work.length}`);
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
