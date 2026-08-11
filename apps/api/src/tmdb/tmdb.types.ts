/** Shapes of the TMDB v3 responses this service consumes. Partial by design. */

export interface TmdbSearchResult {
  id: number;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  overview?: string;
  poster_path?: string | null;
  vote_average?: number;
}

export interface TmdbSearchResponse {
  page: number;
  total_results: number;
  results: TmdbSearchResult[];
}

export interface TmdbGenre {
  id: number;
  name: string;
}

export interface TmdbCastMember {
  id: number;
  name: string;
  character?: string;
  profile_path?: string | null;
  order?: number;
  known_for_department?: string;
}

export interface TmdbCrewMember {
  id: number;
  name: string;
  job?: string;
  department?: string;
  profile_path?: string | null;
}

export interface TmdbCredits {
  cast?: TmdbCastMember[];
  crew?: TmdbCrewMember[];
}

export interface TmdbVideo {
  id: string;
  /** YouTube video id when `site` is "YouTube" — the only site this app embeds. */
  key: string;
  site: string;
  type: string;
  official?: boolean;
}

export interface TmdbVideos {
  results?: TmdbVideo[];
}

export interface TmdbReleaseDates {
  results?: { iso_3166_1: string; release_dates?: { certification?: string }[] }[];
}

export interface TmdbContentRatings {
  results?: { iso_3166_1: string; rating?: string }[];
}

export interface TmdbMovieDetail {
  id: number;
  title: string;
  /** ISO 639-1, e.g. `ml`, `hi`, `bn`. */
  original_language?: string;
  overview?: string;
  release_date?: string;
  runtime?: number | null;
  poster_path?: string | null;
  backdrop_path?: string | null;
  genres?: TmdbGenre[];
  credits?: TmdbCredits;
  release_dates?: TmdbReleaseDates;
  images?: { logos?: { file_path: string; iso_639_1: string | null }[] };
  videos?: TmdbVideos;
}

export interface TmdbSeasonSummary {
  id: number;
  season_number: number;
  name?: string;
  episode_count?: number;
}

export interface TmdbTvDetail {
  id: number;
  name: string;
  /** ISO 639-1, e.g. `ml`, `hi`, `bn`. */
  original_language?: string;
  overview?: string;
  first_air_date?: string;
  episode_run_time?: number[];
  poster_path?: string | null;
  backdrop_path?: string | null;
  genres?: TmdbGenre[];
  seasons?: TmdbSeasonSummary[];
  credits?: TmdbCredits;
  aggregate_credits?: TmdbCredits;
  content_ratings?: TmdbContentRatings;
  images?: { logos?: { file_path: string; iso_639_1: string | null }[] };
  videos?: TmdbVideos;
}

export interface TmdbEpisode {
  id: number;
  episode_number: number;
  name?: string;
  overview?: string;
  still_path?: string | null;
  runtime?: number | null;
  air_date?: string;
}

export interface TmdbSeasonDetail {
  id: number;
  season_number: number;
  name?: string;
  overview?: string;
  episodes?: TmdbEpisode[];
}
