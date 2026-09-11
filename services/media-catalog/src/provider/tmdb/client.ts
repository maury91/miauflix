import { logger } from '../../logger';
import type { ApiCache } from '../../utils/api-cache';
import { RateLimiter } from '../../utils/rate-limiter';
import { SingleFlight } from '../../utils/single-flight';
import { ProviderError } from '../provider';

/* Raw TMDB wire shapes (only the fields we consume) ------------------------- */

interface TmdbGenre {
  id: number;
  name: string;
}
interface TmdbImages {
  secure_base_url: string;
}
interface TmdbConfiguration {
  images: TmdbImages;
}
interface TmdbPaged {
  page: number;
  total_pages: number;
  total_results: number;
}
interface TmdbMovieSummary {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  genre_ids: number[];
  release_date: string;
  popularity: number;
  vote_average: number;
}
interface TmdbTVShowSummary {
  id: number;
  name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  genre_ids: number[];
  first_air_date: string;
  popularity: number;
  vote_average: number;
}
interface TmdbMovieDetails {
  id: number;
  imdb_id: string | null;
  title: string;
  overview: string;
  tagline: string | null;
  release_date: string;
  poster_path: string | null;
  backdrop_path: string | null;
  runtime: number | null;
  genres: TmdbGenre[];
  popularity: number;
  vote_average: number;
  images?: { logos?: Array<{ file_path: string }> };
  translations: {
    translations: Array<{
      iso_639_1: string;
      data: { title: string; overview: string; tagline: string; runtime: number };
    }>;
  };
}
interface TmdbTVShowDetails {
  id: number;
  external_ids: { imdb_id: string | null };
  name: string;
  overview: string;
  tagline: string | null;
  first_air_date: string;
  poster_path: string | null;
  backdrop_path: string | null;
  status: string;
  type: string;
  in_production: boolean;
  episode_run_time: number[];
  genres: TmdbGenre[];
  popularity: number;
  vote_average: number;
  seasons: Array<{
    id: number;
    season_number: number;
    name: string;
    overview: string;
    air_date: string;
    poster_path: string | null;
  }>;
  translations: {
    translations: Array<{
      iso_639_1: string;
      data: { name: string; overview: string; tagline: string };
    }>;
  };
}
interface TmdbSeason {
  id: number;
  season_number: number;
  name: string;
  overview: string;
  air_date: string | null;
  poster_path: string | null;
  episodes: Array<{
    id: number;
    episode_number: number;
    name: string;
    overview: string;
    air_date: string | null;
    still_path: string | null;
  }>;
}
interface TmdbChanges extends TmdbPaged {
  results: Array<{ id: number }>;
}

const oneHourMs = 36e5;
const dayMs = 24 * oneHourMs;
const requestTimeoutMs = 15_000;

/**
 * TMDB HTTP client — port of the backend's `TMDBApi` (bearer auth, 40 req/s
 * client-side rate limiting, TTL-cached responses, absolute image URLs) trimmed
 * to what the catalog provider consumes.
 */
export class TmdbClient {
  /**
   * Note about rate limiting: the API allows ~40 requests per second, which a home
   * deployment is unlikely to reach. If a 429 ever arrives, this class should start
   * adapting its limit from the response headers.
   */
  private readonly rateLimiter = new RateLimiter(40, 'tmdb');
  private readonly configurationFlight = new SingleFlight();

  constructor(
    private readonly apiCache: ApiCache,
    private readonly values: { apiUrl: string; accessToken: string },
    private readonly language = 'en'
  ) {}

  /* ------------------------------------------------------------------ plumbing */

  private async request<T>(path: string): Promise<T> {
    await this.rateLimiter.throttle();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      const response = await fetch(`${this.values.apiUrl}${path}`, {
        headers: {
          Authorization: `Bearer ${this.values.accessToken}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });
      if (!response.ok || response.status >= 400) {
        // Cancel the body explicitly so a misconfigured URL cannot leave an open
        // stream/socket retained in memory.
        await response.body?.cancel().catch(() => undefined);
        logger.error(
          'TmdbClient',
          `${this.values.apiUrl}${path}`,
          response.status,
          response.statusText
        );
        throw new ProviderError(
          `TMDB API error: (${response.status}) ${response.statusText}`,
          response.status
        );
      }
      return (await response.json()) as T;
    } catch (error) {
      if (controller.signal.aborted) {
        throw new ProviderError(`TMDB API request timed out after ${requestTimeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private cached<T>(key: string, ttlMs: number, path: string): Promise<T> {
    return this.apiCache.wrap(`tmdb:v1:${key}`, ttlMs, () => this.request<T>(path));
  }

  /* -------------------------------------------------------------- endpoints */

  /** Live probe used by the configuration test / activation. */
  async test(): Promise<boolean> {
    await this.request('/configuration');
    return true;
  }

  private configuration(): Promise<TmdbConfiguration> {
    return this.configurationFlight.run('configuration', () =>
      this.cached('configuration', 30 * dayMs, '/configuration')
    );
  }

  private async imageUrl(path: string | null | undefined, size = 'original'): Promise<string> {
    if (!path) return '';
    const configuration = await this.configuration();
    return `${configuration.images.secure_base_url}${size}${path}`;
  }

  /** Season with poster and episode stills completed to absolute URLs. */
  async getSeasonWithImages(showId: number, season: number): Promise<TmdbSeason> {
    const data = await this.cached<TmdbSeason>(
      `season:${showId}:${season}:${this.language}`,
      36e5,
      `/tv/${showId}/season/${season}?language=${this.language}`
    );
    const [poster, stills] = await Promise.all([
      this.imageUrl(data.poster_path),
      Promise.all(data.episodes.map(episode => this.imageUrl(episode.still_path))),
    ]);
    return {
      ...data,
      poster_path: poster || null,
      episodes: data.episodes.map((episode, index) => ({
        ...episode,
        still_path: stills[index] || null,
      })),
    };
  }

  /** Movie details projected to the persistable shape (port of getMovieDetails v2). */
  async getMovieDetails(mediaId: number) {
    const data = await this.cached<TmdbMovieDetails>(
      `movie:${mediaId}:v2`,
      oneHourMs,
      `/movie/${mediaId}?append_to_response=translations,images&language=${this.language}`
    );
    const [poster, backdrop, logo] = await Promise.all([
      this.imageUrl(data.poster_path),
      this.imageUrl(data.backdrop_path),
      this.imageUrl(data.images?.logos?.[0]?.file_path),
    ]);
    return {
      mediaId: data.id,
      imdbId: data.imdb_id,
      title: data.title,
      overview: data.overview,
      tagline: data.tagline ?? '',
      releaseDate: data.release_date,
      poster,
      backdrop,
      logo,
      runtime: data.runtime ?? 0,
      genreIds: data.genres.map(genre => genre.id),
      popularity: data.popularity,
      rating: data.vote_average,
      translations: data.translations.translations.map(translation => ({
        language: translation.iso_639_1,
        title: translation.data.title,
        overview: translation.data.overview,
        tagline: translation.data.tagline,
      })),
    };
  }

  /** TV show details projected to the persistable shape (port of getTVShowDetails v2). */
  async getTVShowDetails(mediaId: number) {
    const data = await this.cached<TmdbTVShowDetails>(
      `tv:${mediaId}:v2`,
      oneHourMs,
      `/tv/${mediaId}?append_to_response=external_ids,translations&language=${this.language}`
    );
    const [poster, backdrop] = await Promise.all([
      this.imageUrl(data.poster_path),
      this.imageUrl(data.backdrop_path),
    ]);
    const seasons = await Promise.all(
      data.seasons.map(async season => ({
        mediaId: season.id,
        seasonNumber: season.season_number,
        name: season.name,
        overview: season.overview,
        airDate: season.air_date,
        poster: await this.imageUrl(season.poster_path),
      }))
    );
    return {
      mediaId: data.id,
      imdbId: data.external_ids.imdb_id || null,
      name: data.name,
      overview: data.overview,
      tagline: data.tagline ?? '',
      firstAirDate: data.first_air_date,
      poster,
      backdrop,
      logo: '',
      status: data.status,
      type: data.type,
      inProduction: data.in_production,
      episodeRunTime: [...data.episode_run_time],
      genreIds: data.genres.map(genre => genre.id),
      popularity: data.popularity,
      rating: data.vote_average,
      seasons,
      translations: data.translations.translations.map(translation => ({
        language: translation.iso_639_1,
        title: translation.data.name,
        overview: translation.data.overview,
        tagline: translation.data.tagline,
      })),
    };
  }

  /* ------------------------------------------------------------------- lists */

  async popularMovies(page: number, language = this.language) {
    return this.list(
      `list:movies-popular:${page}:${language}`,
      `/discover/movie?include_adult=false&include_video=false&language=${language}&page=${page}&sort_by=popularity.desc&vote_count.gte=10`
    );
  }

  async topRatedMovies(page: number, language = this.language) {
    return this.list(
      `list:movies-top-rated:${page}:${language}`,
      `/movie/top_rated?language=${language}&page=${page}`
    );
  }

  async popularShows(page: number, language = this.language) {
    return this.list(
      `list:shows-popular:${page}:${language}`,
      `/discover/tv?include_adult=false&include_null_first_air_dates=false&language=${language}&page=${page}&sort_by=popularity.desc&vote_count.gte=10`
    );
  }

  private async list(
    cacheKey: string,
    path: string
  ): Promise<{
    page: number;
    totalPages: number;
    totalItems: number;
    items: Array<TmdbMovieSummary | TmdbTVShowSummary>;
  }> {
    const response = await this.cached<{
      page: number;
      total_pages: number;
      total_results: number;
      results: Array<TmdbMovieSummary | TmdbTVShowSummary>;
    }>(cacheKey, oneHourMs, path);
    const items = await Promise.all(
      response.results.map(async media => ({
        ...media,
        poster_path: await this.imageUrl(media.poster_path),
        backdrop_path: await this.imageUrl(media.backdrop_path),
      }))
    );
    return {
      page: response.page,
      totalPages: response.total_pages,
      totalItems: response.total_results,
      items,
    };
  }

  /* ------------------------------------------------------------------ genres */

  movieGenres(language: string) {
    return this.cached<{ genres: TmdbGenre[] }>(
      `genres:movie:${language}`,
      2 * dayMs,
      `/genre/movie/list?language=${language}`
    );
  }

  tvGenres(language: string) {
    return this.cached<{ genres: TmdbGenre[] }>(
      `genres:tv:${language}`,
      2 * dayMs,
      `/genre/tv/list?language=${language}`
    );
  }

  /* ------------------------------------------------------------------ changes */

  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  changedMovies(startDate: Date, endDate: Date, page = 1) {
    return this.cached<TmdbChanges>(
      `changes:movie:${this.formatDate(startDate)}:${this.formatDate(endDate)}:${page}`,
      oneHourMs,
      `/movie/changes?start_date=${this.formatDate(startDate)}&end_date=${this.formatDate(endDate)}&page=${page}`
    );
  }

  changedTVShows(startDate: Date, endDate: Date, page = 1) {
    return this.cached<TmdbChanges>(
      `changes:tv:${this.formatDate(startDate)}:${this.formatDate(endDate)}:${page}`,
      oneHourMs,
      `/tv/changes?start_date=${this.formatDate(startDate)}&end_date=${this.formatDate(endDate)}&page=${page}`
    );
  }

  tvShowChanges(mediaId: number, page = 1) {
    return this.cached<{
      changes: Array<{
        key: string;
        items: Array<{ value?: { season_number?: number } }>;
      }>;
      page?: number;
      total_pages?: number;
    }>(`tv-changes:${mediaId}:${page}`, oneHourMs, `/tv/${mediaId}/changes?page=${page}`);
  }
}
