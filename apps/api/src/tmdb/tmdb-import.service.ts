import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { normalizeSearch } from '@ott/shared';
import type { MaturityRating, TmdbApplyResult, TmdbPreview, TmdbSearchItem } from '@ott/shared';
import { PrismaService } from '../common/prisma.service';
import { RedisService } from '../common/redis.service';
import { HOME_CACHE_PREFIX } from '../rails/rails.cache';
import { TmdbService } from './tmdb.service';
import type { TmdbCredits, TmdbMovieDetail, TmdbTvDetail, TmdbVideo } from './tmdb.types';

const MAX_CAST = 20;
const MAX_CREW = 8;
const CREW_JOBS = new Set(['Director', 'Creator', 'Writer', 'Screenplay', 'Producer', 'Executive Producer']);

/** US certifications map onto our MaturityRating enum; anything else is dropped. */
const RATING_MAP: Record<string, MaturityRating> = {
  G: 'G',
  PG: 'PG',
  'PG-13': 'PG_13',
  R: 'R',
  'NC-17': 'NC_17',
  'TV-Y': 'TV_Y',
  'TV-G': 'TV_G',
  'TV-PG': 'TV_PG',
  'TV-14': 'TV_14',
  'TV-MA': 'TV_MA',
};

@Injectable()
export class TmdbImportService {
  private readonly logger = new Logger(TmdbImportService.name);

  constructor(
    private readonly tmdb: TmdbService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async search(kind: 'movie' | 'tv', query: string): Promise<TmdbSearchItem[]> {
    const res = await this.tmdb.search(kind, query);
    return res.results.slice(0, 20).map((r) => ({
      tmdbId: r.id,
      name: r.title ?? r.name ?? 'Untitled',
      year: yearOf(r.release_date ?? r.first_air_date),
      overview: r.overview ?? '',
      posterUrl: this.tmdb.imageUrl(r.poster_path, 'poster'),
      voteAverage: r.vote_average ?? null,
    }));
  }

  /**
   * Everything the admin UI needs to show a diff before committing. Nothing is
   * written here — the admin decides what to apply.
   */
  async preview(kind: 'movie' | 'tv', tmdbId: number): Promise<TmdbPreview> {
    return kind === 'movie' ? this.previewMovie(tmdbId) : this.previewTv(tmdbId);
  }

  private async previewMovie(tmdbId: number): Promise<TmdbPreview> {
    const d = await this.tmdb.movie(tmdbId);
    return {
      kind: 'movie',
      tmdbId: d.id,
      name: d.title,
      slug: slugify(d.title, yearOf(d.release_date)),
      synopsis: d.overview ?? '',
      year: yearOf(d.release_date),
      rating: usCertification(d),
      durationSec: d.runtime ? d.runtime * 60 : null,
      posterUrl: this.tmdb.imageUrl(d.poster_path, 'poster'),
      backdropUrl: this.tmdb.imageUrl(d.backdrop_path, 'backdrop'),
      logoUrl: this.tmdb.imageUrl(d.images?.logos?.[0]?.file_path, 'logo'),
      trailerYoutubeId: pickTrailer(d.videos?.results),
      originalLanguage: d.original_language ?? null,
      genres: (d.genres ?? []).map((g) => g.name),
      cast: this.mapCast(d.credits),
      crew: this.mapCrew(d.credits),
      seasons: [],
    };
  }

  private async previewTv(tmdbId: number): Promise<TmdbPreview> {
    const d = await this.tmdb.tv(tmdbId);
    // aggregate_credits spans the whole run; plain credits is often just S1.
    const credits = d.aggregate_credits ?? d.credits;

    // Season 0 is TMDB's "Specials" bucket — skipped, it confuses the episode list.
    const realSeasons = (d.seasons ?? []).filter((s) => s.season_number > 0);
    const details = await Promise.all(realSeasons.map((s) => this.tmdb.season(d.id, s.season_number)));

    return {
      kind: 'tv',
      tmdbId: d.id,
      name: d.name,
      slug: slugify(d.name, yearOf(d.first_air_date)),
      synopsis: d.overview ?? '',
      year: yearOf(d.first_air_date),
      rating: usContentRating(d),
      durationSec: d.episode_run_time?.[0] ? d.episode_run_time[0] * 60 : null,
      posterUrl: this.tmdb.imageUrl(d.poster_path, 'poster'),
      backdropUrl: this.tmdb.imageUrl(d.backdrop_path, 'backdrop'),
      logoUrl: this.tmdb.imageUrl(d.images?.logos?.[0]?.file_path, 'logo'),
      trailerYoutubeId: pickTrailer(d.videos?.results),
      originalLanguage: d.original_language ?? null,
      genres: (d.genres ?? []).map((g) => g.name),
      cast: this.mapCast(credits),
      crew: this.mapCrew(credits),
      seasons: details.map((season) => ({
        number: season.season_number,
        name: season.name ?? `Season ${season.season_number}`,
        episodes: (season.episodes ?? []).map((ep) => ({
          number: ep.episode_number,
          name: ep.name ?? `Episode ${ep.episode_number}`,
          synopsis: ep.overview ?? '',
          stillUrl: this.tmdb.imageUrl(ep.still_path, 'still'),
          durationSec: ep.runtime ? ep.runtime * 60 : null,
          airDate: ep.air_date ?? null,
        })),
      })),
    };
  }

  private mapCast(credits: TmdbCredits | undefined) {
    return (credits?.cast ?? [])
      .slice(0, MAX_CAST)
      .map((c, index) => ({
        tmdbId: c.id,
        name: c.name,
        // aggregate_credits nests roles; plain credits has `character`.
        role: c.character ?? (c as { roles?: { character?: string }[] }).roles?.[0]?.character ?? '',
        profileUrl: this.tmdb.imageUrl(c.profile_path, 'profile'),
        order: c.order ?? index,
      }));
  }

  private mapCrew(credits: TmdbCredits | undefined) {
    const seen = new Set<string>();
    return (credits?.crew ?? [])
      .filter((c) => {
        const job = c.job ?? (c as { jobs?: { job?: string }[] }).jobs?.[0]?.job ?? '';
        if (!CREW_JOBS.has(job)) return false;
        const key = `${c.id}:${job}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, MAX_CREW)
      .map((c) => ({
        tmdbId: c.id,
        name: c.name,
        role: c.job ?? (c as { jobs?: { job?: string }[] }).jobs?.[0]?.job ?? 'Crew',
        profileUrl: this.tmdb.imageUrl(c.profile_path, 'profile'),
        order: 0,
      }));
  }

  /**
   * Writes a previewed payload onto a title. `fields` lets the admin apply a
   * subset — unchecking "synopsis" keeps a hand-written one, which is the whole
   * point of previewing first.
   */
  async apply(
    titleId: string,
    preview: TmdbPreview,
    fields: {
      metadata: boolean;
      artwork: boolean;
      trailer: boolean;
      genres: boolean;
      cast: boolean;
      episodes: boolean;
    },
  ): Promise<TmdbApplyResult> {
    const title = await this.prisma.title.findUnique({ where: { id: titleId } });
    if (!title) throw new NotFoundException('Title not found');

    const expectedType = preview.kind === 'movie' ? 'MOVIE' : 'SERIES';
    if (title.type !== expectedType) {
      throw new BadRequestException(
        `This title is a ${title.type.toLowerCase()} but TMDB record ${preview.tmdbId} is a ${preview.kind === 'movie' ? 'movie' : 'series'}`,
      );
    }

    const applied: string[] = [];
    const data: Record<string, unknown> = { tmdbId: preview.tmdbId, tmdbSyncedAt: new Date() };

    if (fields.metadata) {
      Object.assign(data, {
        name: preview.name,
        searchText: normalizeSearch(preview.name),
        synopsis: preview.synopsis,
        year: preview.year,
        rating: preview.rating,
        durationSec: preview.durationSec,
        originalLanguage: preview.originalLanguage,
      });
      applied.push('metadata');
    }
    if (fields.artwork) {
      Object.assign(data, {
        posterUrl: preview.posterUrl,
        backdropUrl: preview.backdropUrl,
        logoUrl: preview.logoUrl,
      });
      applied.push('artwork');
    }
    if (fields.trailer) {
      Object.assign(data, { trailerYoutubeId: preview.trailerYoutubeId });
      applied.push('trailer');
    }

    await this.prisma.title.update({ where: { id: titleId }, data });

    if (fields.genres && preview.genres.length) {
      await this.applyGenres(titleId, preview.genres);
      applied.push('genres');
    }
    if (fields.cast) {
      await this.applyCredits(titleId, preview);
      applied.push('cast');
    }

    let episodesCreated = 0;
    let episodesRemoved = 0;
    let orphanedEpisodes: string[] = [];

    if (fields.episodes && preview.kind === 'tv') {
      const result = await this.applyEpisodes(titleId, preview);
      episodesCreated = result.created;
      episodesRemoved = result.removed;
      orphanedEpisodes = result.orphaned;
      applied.push('episodes');
    }

    await this.redis.invalidatePrefix(HOME_CACHE_PREFIX);
    this.logger.log(`Applied TMDB ${preview.kind}/${preview.tmdbId} to title ${titleId}: ${applied.join(', ')}`);
    if (orphanedEpisodes.length) {
      this.logger.warn(
        `Title ${titleId} kept ${orphanedEpisodes.length} episode(s) TMDB no longer lists, because they still have streams: ${orphanedEpisodes.join(', ')}`,
      );
    }

    return { applied, episodesCreated, episodesRemoved, orphanedEpisodes };
  }

  private async applyGenres(titleId: string, names: string[]): Promise<void> {
    const ids: string[] = [];
    for (const name of names) {
      const slug = slugify(name);
      const genre = await this.prisma.genre.upsert({
        where: { slug },
        create: { slug, name },
        update: {},
      });
      ids.push(genre.id);
    }
    await this.prisma.titleGenre.deleteMany({ where: { titleId } });
    await this.prisma.titleGenre.createMany({
      data: ids.map((genreId) => ({ titleId, genreId })),
      skipDuplicates: true,
    });
  }

  private async applyCredits(titleId: string, preview: TmdbPreview): Promise<void> {
    const rows = [
      ...preview.cast.map((p) => ({ ...p, kind: 'CAST' as const })),
      ...preview.crew.map((p) => ({ ...p, kind: 'CREW' as const })),
    ];

    // Replaced wholesale so a re-sync drops people no longer credited.
    await this.prisma.credit.deleteMany({ where: { titleId } });

    for (const row of rows) {
      const person = await this.prisma.person.upsert({
        where: { tmdbId: row.tmdbId },
        create: { tmdbId: row.tmdbId, name: row.name, profilePath: row.profileUrl },
        // Refresh the name and photo, which TMDB does correct over time.
        update: { name: row.name, profilePath: row.profileUrl },
      });

      await this.prisma.credit.upsert({
        where: {
          titleId_personId_kind_role: { titleId, personId: person.id, kind: row.kind, role: row.role },
        },
        create: { titleId, personId: person.id, kind: row.kind, role: row.role, order: row.order },
        update: { order: row.order },
      });
    }
  }

  /**
   * Creates the episode list without stream paths — admins attach those as
   * files arrive. Existing episodes keep their streamPath, so re-syncing
   * metadata never unpublishes working content.
   *
   * Also reconciles what TMDB no longer lists, which matters when an id is
   * corrected or a show is renumbered: without this the title keeps phantom
   * episodes from its previous shape. Placeholders (no stream) are removed
   * silently since nothing is lost; anything with a stream is kept and
   * reported, because deleting playable content on a metadata sync would be a
   * destructive surprise.
   */
  private async applyEpisodes(
    titleId: string,
    preview: TmdbPreview,
  ): Promise<{ created: number; removed: number; orphaned: string[] }> {
    let created = 0;
    let removed = 0;
    const orphaned: string[] = [];

    const keptSeasonIds = new Set<string>();

    for (const season of preview.seasons) {
      const seasonRow = await this.prisma.season.upsert({
        where: { titleId_number: { titleId, number: season.number } },
        create: { titleId, number: season.number, name: season.name },
        update: { name: season.name },
      });
      keptSeasonIds.add(seasonRow.id);

      for (const ep of season.episodes) {
        const metadata = {
          name: ep.name,
          synopsis: ep.synopsis,
          stillUrl: ep.stillUrl,
          durationSec: ep.durationSec,
          airDate: ep.airDate ? new Date(ep.airDate) : null,
        };

        const existing = await this.prisma.episode.findUnique({
          where: { seasonId_number: { seasonId: seasonRow.id, number: ep.number } },
        });

        if (existing) {
          await this.prisma.episode.update({ where: { id: existing.id }, data: metadata });
        } else {
          await this.prisma.episode.create({
            data: { ...metadata, titleId, seasonId: seasonRow.id, number: ep.number, streamPath: '' },
          });
          created += 1;
        }
      }

      // Episode numbers beyond what TMDB lists for this season.
      const surplus = await this.prisma.episode.findMany({
        where: { seasonId: seasonRow.id, number: { notIn: season.episodes.map((e) => e.number) } },
      });
      for (const ep of surplus) {
        if (ep.streamPath) orphaned.push(`S${season.number}E${ep.number} ${ep.name}`);
        else {
          await this.prisma.episode.delete({ where: { id: ep.id } });
          removed += 1;
        }
      }
    }

    // Whole seasons TMDB no longer lists.
    const staleSeasons = await this.prisma.season.findMany({
      where: { titleId, id: { notIn: [...keptSeasonIds] } },
      include: { episodes: true },
    });

    for (const season of staleSeasons) {
      const withStream = season.episodes.filter((e) => e.streamPath);
      for (const ep of season.episodes.filter((e) => !e.streamPath)) {
        await this.prisma.episode.delete({ where: { id: ep.id } });
        removed += 1;
      }
      if (withStream.length === 0) {
        await this.prisma.season.delete({ where: { id: season.id } });
      } else {
        orphaned.push(
          ...withStream.map((e) => `S${season.number}E${e.number} ${e.name}`),
        );
      }
    }

    return { created, removed, orphaned };
  }
}

/**
 * Prefers an official trailer, then any trailer, then an official teaser,
 * then any teaser — TMDB lists videos for a title in no particular order, and
 * "Trailer" beats "Teaser" beats a random clip or featurette. Only YouTube is
 * considered since that is the only site the player embeds.
 */
function pickTrailer(videos: TmdbVideo[] | undefined): string | null {
  const youtube = (videos ?? []).filter((v) => v.site === 'YouTube');
  const byType = (type: string) =>
    youtube.find((v) => v.type === type && v.official) ?? youtube.find((v) => v.type === type);
  return (byType('Trailer') ?? byType('Teaser'))?.key ?? null;
}

function yearOf(date: string | undefined): number | null {
  if (!date) return null;
  const year = Number(date.slice(0, 4));
  return Number.isFinite(year) && year > 1800 ? year : null;
}

function usCertification(d: TmdbMovieDetail): MaturityRating | null {
  const us = d.release_dates?.results?.find((r) => r.iso_3166_1 === 'US');
  const cert = us?.release_dates?.map((r) => r.certification).find((c) => c && RATING_MAP[c]);
  return cert ? RATING_MAP[cert] : null;
}

function usContentRating(d: TmdbTvDetail): MaturityRating | null {
  const us = d.content_ratings?.results?.find((r) => r.iso_3166_1 === 'US');
  return us?.rating && RATING_MAP[us.rating] ? RATING_MAP[us.rating] : null;
}

function slugify(value: string, year?: number | null): string {
  const base = value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return year ? `${base}-${year}` : base;
}
