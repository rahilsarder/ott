import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import { RedisService } from '../common/redis.service';
import type {
  TmdbMovieDetail,
  TmdbSearchResponse,
  TmdbSeasonDetail,
  TmdbTvDetail,
} from './tmdb.types';

const TMDB_API = 'https://api.themoviedb.org/3';
const IMAGE_CDN = 'https://image.tmdb.org/t/p';
const CACHE_PREFIX = 'tmdb:';
const CACHE_TTL_SEC = 60 * 60 * 24;
const REQUEST_TIMEOUT_MS = 10_000;

/** Image widths chosen to match how each asset is displayed in the UI. */
export const IMAGE_SIZES = {
  poster: 'w500',
  backdrop: 'w1280',
  still: 'w300',
  profile: 'w185',
  logo: 'w300',
} as const;

@Injectable()
export class TmdbService {
  private readonly logger = new Logger(TmdbService.name);

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly redis: RedisService,
  ) {}

  get isConfigured(): boolean {
    return Boolean(this.config.get('TMDB_API_KEY', { infer: true }));
  }

  /** Absolute CDN URL for a TMDB relative image path, or null. */
  imageUrl(path: string | null | undefined, size: keyof typeof IMAGE_SIZES): string | null {
    if (!path) return null;
    return `${IMAGE_CDN}/${IMAGE_SIZES[size]}${path}`;
  }

  /**
   * GET against TMDB with a day-long Redis cache.
   *
   * Cached because an import is inherently repetitive — previewing a title,
   * then applying it, then re-syncing later all hit the same few endpoints —
   * and because the cache is shared, so extra API instances do not multiply
   * upstream traffic.
   */
  private async get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    const apiKey = this.config.get('TMDB_API_KEY', { infer: true });
    if (!apiKey) {
      throw new BadRequestException('TMDB is not configured — set TMDB_API_KEY in .env');
    }

    const query = new URLSearchParams({
      language: this.config.get('TMDB_LANGUAGE', { infer: true }),
      ...params,
    });

    // Built before credentials are added, so the key never reaches Redis.
    const cacheKey = `${CACHE_PREFIX}${path}?${query.toString()}`;
    const cached = await this.redis.getJson<T>(cacheKey);
    if (cached) return cached;

    /*
     * TMDB accepts a v4 read token as a bearer header or a v3 key as a query
     * parameter. A v4 token is a JWT and always starts `ey`; preferring the
     * header keeps the credential out of the URL, and therefore out of logs and
     * any error message that echoes it.
     */
    const isV4Token = apiKey.startsWith('ey');
    if (!isV4Token) query.set('api_key', apiKey);

    const url = `${TMDB_API}${path}?${query.toString()}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          accept: 'application/json',
          ...(isV4Token ? { authorization: `Bearer ${apiKey}` } : {}),
        },
      });

      if (res.status === 404) throw new BadRequestException('No TMDB record with that id');
      if (res.status === 401) throw new BadRequestException('TMDB rejected the API key');
      if (res.status === 429) throw new ServiceUnavailableException('TMDB rate limit reached — try again shortly');
      if (!res.ok) throw new ServiceUnavailableException(`TMDB request failed (${res.status})`);

      const data = (await res.json()) as T;
      await this.redis.setJson(cacheKey, data, CACHE_TTL_SEC);
      return data;
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof ServiceUnavailableException) throw error;
      if ((error as Error).name === 'AbortError') {
        throw new ServiceUnavailableException('TMDB did not respond in time');
      }
      this.logger.error(`TMDB request failed: ${(error as Error).message}`);
      throw new ServiceUnavailableException('Could not reach TMDB');
    } finally {
      clearTimeout(timer);
    }
  }

  search(kind: 'movie' | 'tv', query: string): Promise<TmdbSearchResponse> {
    return this.get<TmdbSearchResponse>(`/search/${kind}`, { query, include_adult: 'false' });
  }

  movie(id: number): Promise<TmdbMovieDetail> {
    return this.get<TmdbMovieDetail>(`/movie/${id}`, {
      append_to_response: 'credits,release_dates,images,videos',
      include_image_language: 'en,null',
    });
  }

  tv(id: number): Promise<TmdbTvDetail> {
    return this.get<TmdbTvDetail>(`/tv/${id}`, {
      append_to_response: 'aggregate_credits,credits,content_ratings,images,videos',
      include_image_language: 'en,null',
    });
  }

  season(tvId: number, seasonNumber: number): Promise<TmdbSeasonDetail> {
    return this.get<TmdbSeasonDetail>(`/tv/${tvId}/season/${seasonNumber}`, {});
  }
}
