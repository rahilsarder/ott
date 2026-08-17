import { PrismaClient, type TitleType } from '@prisma/client';
import { normalizeSearch } from '@ott/shared';
import * as fs from 'fs';

const prisma = new PrismaClient();
const DATA_DIR =
  '/private/tmp/claude-501/-Users-rahil-Programming-Claude-Code/80b6daad-3b32-4863-8fe5-f568ee69e358/scratchpad';

function load<T>(name: string): T {
  return JSON.parse(fs.readFileSync(`${DATA_DIR}/${name}`, 'utf-8'));
}

interface RawVideo {
  id: string;
  imdbid: string | null;
  title: string;
  slug: string | null;
  description: string | null;
  release: string | null;
  genre_ids: string[];
  runtime: string | null;
  imdb_rating: string | null;
  is_tvseries: boolean;
  tmdbid: string | null;
}
interface RawSeason {
  id: string;
  videos_id: string;
  name: string | null;
  order: string;
}
interface RawEpisode {
  id: string;
  videos_id: string;
  seasons_id: string;
  name: string | null;
  file_url: string | null;
  order: string;
}
interface RawVideoFile {
  id: string;
  videos_id: string;
  file_url: string | null;
  order: string;
}
interface RawGenre {
  id: string;
  name: string;
  slug: string;
}

function yearOf(release: string | null): number | null {
  if (!release) return null;
  const y = parseInt(release.slice(0, 4), 10);
  return Number.isFinite(y) && y > 1800 && y < 2100 ? y : null;
}

function slugify(base: string): string {
  return (
    base
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'untitled'
  );
}

function streamPathFrom(fileUrl: string | null): string {
  if (!fileUrl) return '';
  return fileUrl.replace(/^\/+/, '');
}

async function main(): Promise<void> {
  const genres = load<RawGenre[]>('genres.json');
  const videos = load<RawVideo[]>('videos.json');
  const seasons = load<RawSeason[]>('seasons.json');
  const episodes = load<RawEpisode[]>('episodes.json');
  const videoFiles = load<RawVideoFile[]>('video_files.json');

  console.log(
    `Loaded ${genres.length} genres, ${videos.length} videos, ${seasons.length} seasons, ${episodes.length} episodes, ${videoFiles.length} video_files`,
  );

  const genreIdMap = new Map<string, string>();
  for (const g of genres) {
    const slug = slugify(g.slug || g.name);
    const row = await prisma.genre.upsert({ where: { slug }, create: { slug, name: g.name }, update: {} });
    genreIdMap.set(g.id, row.id);
  }
  console.log(`Genres upserted: ${genreIdMap.size}`);

  const seasonsByVideo = new Map<string, RawSeason[]>();
  for (const s of seasons) {
    (seasonsByVideo.get(s.videos_id) ?? seasonsByVideo.set(s.videos_id, []).get(s.videos_id)!).push(s);
  }
  const episodesBySeason = new Map<string, RawEpisode[]>();
  for (const e of episodes) {
    if (!e.seasons_id) continue;
    (episodesBySeason.get(e.seasons_id) ?? episodesBySeason.set(e.seasons_id, []).get(e.seasons_id)!).push(e);
  }
  const videoFilesByVideo = new Map<string, RawVideoFile[]>();
  for (const vf of videoFiles) {
    (videoFilesByVideo.get(vf.videos_id) ?? videoFilesByVideo.set(vf.videos_id, []).get(vf.videos_id)!).push(vf);
  }

  const usedSlugs = new Set<string>((await prisma.title.findMany({ select: { slug: true } })).map((t) => t.slug));

  let created = 0;
  let episodesCreated = 0;
  const startedAt = Date.now();
  const imdbMap: { titleId: string; imdbid: string }[] = [];

  for (const v of videos) {
    const baseSlug = slugify(v.slug || v.title);
    let slug = baseSlug;
    let n = 2;
    while (usedSlugs.has(slug)) slug = `${baseSlug}-${n++}`;
    usedSlugs.add(slug);

    const type: TitleType = v.is_tvseries ? 'SERIES' : 'MOVIE';
    const year = yearOf(v.release);
    const name = v.title || 'Untitled';

    let streamPath: string | null = null;
    if (type === 'MOVIE') {
      const files = (videoFilesByVideo.get(v.id) ?? []).sort((a, b) => parseInt(a.order, 10) - parseInt(b.order, 10));
      if (files.length) streamPath = streamPathFrom(files[0].file_url);
    }

    const tmdbIdNum = v.tmdbid ? parseInt(v.tmdbid, 10) : NaN;

    const title = await prisma.title.create({
      data: {
        type,
        slug,
        name,
        synopsis: v.description ?? '',
        year,
        streamPath: type === 'MOVIE' ? streamPath : null,
        tmdbId: Number.isFinite(tmdbIdNum) ? tmdbIdNum : null,
        searchText: normalizeSearch(name),
        isPublished: true,
        publishedAt: new Date(),
        genres: {
          create: v.genre_ids
            .map((gid) => genreIdMap.get(gid))
            .filter((id): id is string => !!id)
            .map((genreId) => ({ genreId })),
        },
      },
    });
    created++;
    if (v.imdbid) imdbMap.push({ titleId: title.id, imdbid: v.imdbid });

    if (type === 'SERIES') {
      const vSeasons = (seasonsByVideo.get(v.id) ?? []).sort((a, b) => parseInt(a.order, 10) - parseInt(b.order, 10));
      const usedSeasonNumbers = new Set<number>();
      let seasonSeq = 0;
      for (const s of vSeasons) {
        seasonSeq++;
        const parsedNum = parseInt((s.name?.match(/\d+/) ?? [])[0] ?? '', 10);
        let number = Number.isFinite(parsedNum) && parsedNum > 0 ? parsedNum : seasonSeq;
        while (usedSeasonNumbers.has(number)) number++;
        usedSeasonNumbers.add(number);
        const seasonName = s.name || `Season ${number}`;

        const seasonRow = await prisma.season.create({ data: { titleId: title.id, number, name: seasonName } });

        const eps = (episodesBySeason.get(s.id) ?? []).sort((a, b) => parseInt(a.order, 10) - parseInt(b.order, 10));
        const usedEpNumbers = new Set<number>();
        let epSeq = 0;
        for (const e of eps) {
          epSeq++;
          const parsedEp = parseInt((e.name?.match(/\d+/) ?? [])[0] ?? '', 10);
          let number = Number.isFinite(parsedEp) && parsedEp > 0 ? parsedEp : epSeq;
          while (usedEpNumbers.has(number)) number++;
          usedEpNumbers.add(number);
          const epName = (e.name ?? '').replace(/^\d+\s*/, '') || `Episode ${number}`;
          const streamPathEp = streamPathFrom(e.file_url);

          await prisma.episode.create({
            data: { titleId: title.id, seasonId: seasonRow.id, number, name: epName, streamPath: streamPathEp },
          });
          episodesCreated++;
        }
      }
    }

    if (created % 500 === 0) {
      const secs = ((Date.now() - startedAt) / 1000).toFixed(0);
      console.log(`  ...${created}/${videos.length} titles (${secs}s elapsed)`);
    }
  }

  fs.writeFileSync(`${DATA_DIR}/title_imdb_map.json`, JSON.stringify(imdbMap));
  console.log(`Done. Titles created: ${created}, episodes created: ${episodesCreated}, imdb-mapped: ${imdbMap.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
