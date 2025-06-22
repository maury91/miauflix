import { logger } from '@logger';
import { Cache } from 'cache-manager';

import { ENV } from '@constants';
import { Api } from '@utils/api.util';
import { Cacheable } from '@utils/cacheable.util';
import { TrackStatus } from '@utils/trackStatus.util';

import type {
  ChangeItem,
  ChangeResult,
  ChangesResponse,
  ConfigurationResponse,
  Genre,
  MediaListResponse,
  MediaSummary,
  MediaSummaryList,
  MovieDetails,
  MovieListResponse,
  Paged,
  PagedResponse,
  ShowSeason,
  TVShowDetails,
  TVShowListResponse,
  WithExternalIds,
  WithMovieImages,
  WithMovieTranslations,
  WithTVShowTranslations,
} from './tmdb.types';

export interface MediaImages {
  poster: string;
  backdrop: string;
  backdrops: string[];
  logos: string[];
}

export const NO_IMAGES: MediaImages = {
  logos: [],
  backdrop: '',
  backdrops: [],
  poster: '',
};

export class TMDBApi extends Api {
  /**
   * Note about rate limiting, the API is limited to 50 requests per second
   * I highly doubt is possible to reach this limit in a home setting.
   * However, if this happens a 429 error will be returned and this class should
   * start rate limiting itself.
   */

  private readonly apiKey = ENV('TMDB_API_ACCESS_TOKEN');
  private readonly configuration: Promise<ConfigurationResponse>;

  constructor(
    cache: Cache,
    private readonly language = 'en'
  ) {
    super(
      cache,
      ENV('TMDB_API_URL'),
      50 // 50 requests per second, TMDB's documented rate limit
    );
    this.language = language;
    this.configuration = this.getConfiguration();
  }

  @TrackStatus()
  private async request<T>(url: string, init: RequestInit): Promise<T> {
    // Apply rate limiting before making the request
    await this.rateLimiter.throttle();

    const response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok || response.status >= 400) {
      logger.error('TMDB', url, response);
      throw response;
    }
    return response.json() as Promise<T>;
  }

  private async get<T>(url: string): Promise<T> {
    return this.request<T>(url, {});
  }

  private async post<T>(url: string, body: Record<string, unknown>): Promise<T> {
    return this.request<T>(url, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  private async completeImageUrl(image: string, size = 'original') {
    const config = await this.configuration;
    return `${config.images.secure_base_url}${size}${image}`;
  }

  public async test() {
    await this.get(`${this.apiUrl}/configuration`);
    return true;
  }

  private paged<T>(input: PagedResponse<T>): Paged<T> {
    return {
      page: input.page,
      items: input.results,
      totalPages: input.total_pages,
      totalItems: input.total_results,
    };
  }

  @Cacheable(26e8 /* 30 days */)
  public async getConfiguration() {
    return this.get<ConfigurationResponse>(`${this.apiUrl}/configuration`);
  }

  @Cacheable(36e5 /* 1 hour */)
  public async getSeasonRaw(showId: number, season: number) {
    return this.get<ShowSeason>(
      `${this.apiUrl}/tv/${showId}/season/${season}?language=${this.language}`
    );
  }

  @Cacheable(6e5 /* 10 minutes */)
  public async getSeason(showId: number, season: number): Promise<ShowSeason> {
    const data = await this.getSeasonRaw(showId, season);
    return {
      ...data,
      poster_path: data.poster_path ? await this.completeImageUrl(data.poster_path) : '',
      episodes: await Promise.all(
        data.episodes.map(async episode => ({
          ...episode,
          still_path: episode.still_path ? await this.completeImageUrl(episode.still_path) : '',
        }))
      ),
    };
  }

  /**
   * Get detailed information about a movie
   * @param movieId The TMDB ID of the movie
   * @returns MovieDetails object with full movie information
   */
  @Cacheable(36e5 /* 1 hour */)
  public async getMovieDetails(movieId: number | string) {
    const url = `${this.apiUrl}/movie/${movieId}?append_to_response=translations,images&language=${this.language}`;
    const movieData = await this.get<MovieDetails & WithMovieImages & WithMovieTranslations>(url);
    // Process image paths to include the full URL
    return {
      ...movieData,
      poster_path: movieData.poster_path ? await this.completeImageUrl(movieData.poster_path) : '',
      backdrop_path: movieData.backdrop_path
        ? await this.completeImageUrl(movieData.backdrop_path)
        : '',
      logo_path: movieData.images?.logos?.length
        ? await this.completeImageUrl(movieData.images.logos[0].file_path)
        : '',
      production_companies: await Promise.all(
        movieData.production_companies.map(async company => ({
          ...company,
          logo_path: company.logo_path ? await this.completeImageUrl(company.logo_path) : '',
        }))
      ),
      translations: movieData.translations.translations,
    };
  }

  /**
   * Get detailed information about a TV show
   * @param showId The TMDB ID of the TV show
   * @returns TVShowDetails object with full TV show information
   */
  @Cacheable(36e5 /* 1 hour */)
  public async getTVShowDetails(showId: number | string) {
    const url = `${this.apiUrl}/tv/${showId}?append_to_response=external_ids,translations&language=${this.language}`;
    const showData = await this.get<TVShowDetails & WithExternalIds & WithTVShowTranslations>(url);
    // Process image paths to include the full URL
    return {
      ...showData,
      poster_path: showData.poster_path ? await this.completeImageUrl(showData.poster_path) : '',
      backdrop_path: showData.backdrop_path
        ? await this.completeImageUrl(showData.backdrop_path)
        : '',
      production_companies: await Promise.all(
        showData.production_companies.map(async company => ({
          ...company,
          logo_path: company.logo_path ? await this.completeImageUrl(company.logo_path) : '',
        }))
      ),
      translations: showData.translations.translations,
    };
  }

  private async getList<T extends MediaListResponse | MovieListResponse | TVShowListResponse>(
    url: string
  ): Promise<MediaSummaryList> {
    const response = await this.get<T>(url);
    const results = await Promise.all(
      response.results.map(async (media): Promise<MediaSummary> => {
        const [poster_path, backdrop_path] = await Promise.all([
          media.poster_path ? this.completeImageUrl(media.poster_path) : '',
          media.backdrop_path ? this.completeImageUrl(media.backdrop_path) : '',
        ]);

        if ('name' in media) {
          const { genre_ids, ...rest } = media;
          return {
            ...rest,
            genres: genre_ids,
            poster_path,
            backdrop_path,
            _type: 'tv',
          };
        }

        const { genre_ids, ...rest } = media;
        return {
          ...rest,
          genres: genre_ids,
          poster_path,
          backdrop_path,
          _type: 'movie',
        };
      })
    );
    return this.paged({
      ...response,
      results,
    });
  }

  @Cacheable(36e5 /* 1 hour */, true)
  public async getPopularMovies(page = 1): Promise<MediaSummaryList> {
    return this.getList<MovieListResponse>(
      `${this.apiUrl}/discover/movie?include_adult=false&include_video=false&language=${this.language}&page=${page}&sort_by=popularity.desc&vote_count.gte=10`
    );
  }

  @Cacheable(36e5 /* 1 hour */, true)
  public async getTopRatedMovies(page = 1): Promise<MediaSummaryList> {
    return this.getList<MovieListResponse>(
      `${this.apiUrl}/movie/top_rated?language=${this.language}&page=${page}`
    );
  }

  @Cacheable(36e5 /* 1 hour */)
  public async getTrending(timeWindow: 'day' | 'week' = 'week'): Promise<MediaSummaryList> {
    return this.getList<MediaListResponse>(
      `${this.apiUrl}/trending/all/${timeWindow}?language=${this.language}`
    );
  }

  @Cacheable(36e5 /* 1 hour */)
  public async getTrendingMovies(timeWindow: 'day' | 'week' = 'week'): Promise<MediaSummaryList> {
    return this.getList<MovieListResponse>(
      `${this.apiUrl}/trending/movie/${timeWindow}?language=${this.language}`
    );
  }

  @Cacheable(36e5 /* 1 hour */)
  public async getTrendingShows(timeWindow: 'day' | 'week' = 'week'): Promise<MediaSummaryList> {
    return this.getList<TVShowListResponse>(
      `${this.apiUrl}/trending/tv/${timeWindow}?language=${this.language}`
    );
  }

  @Cacheable(36e5 /* 1 hour */)
  public async getPopularShows(page = 1): Promise<MediaSummaryList> {
    return this.getList<TVShowListResponse>(
      `${this.apiUrl}/discover/tv?include_adult=false&include_null_first_air_dates=false&language=${this.language}&page=${page}&sort_by=popularity.desc&vote_count.gte=10`
    );
  }

  @Cacheable(36e5 /* 1 hour */)
  public async getTopRatedShows(): Promise<MediaSummaryList> {
    return this.getList<TVShowListResponse>(
      `${this.apiUrl}/tv/top_rated?language=${this.language}`
    );
  }

  /**
   * Format date for TMDB API (YYYY-MM-DD)
   * @param date The date to format
   * @returns Formatted date string
   */
  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  /**
   * Get list of movie IDs that have changed since the specified timestamp
   * @param startDate Date from which to start tracking changes
   * @param endDate Optional end date for the changes (defaults to current date)
   * @param page Page number for pagination (defaults to 1)
   * @returns Changes result with movie IDs and pagination info
   */
  @Cacheable(3600) // Cache for 1 hour
  public async getChangedMovieIds(
    startDate: Date,
    endDate: Date = new Date(),
    page: number = 1
  ): Promise<ChangeResult> {
    const startDateStr = this.formatDate(startDate);
    const endDateStr = this.formatDate(endDate);

    const url = `${this.apiUrl}/movie/changes?start_date=${startDateStr}&end_date=${endDateStr}&page=${page}&language=${this.language}`;
    const response = await this.get<ChangesResponse>(url);

    return this.paged(response);
  }

  /**
   * Get list of TV show IDs that have changed since the specified timestamp
   * @param startDate Date from which to start tracking changes
   * @param endDate Optional end date for the changes (defaults to current date)
   * @param page Page number for pagination (defaults to 1)
   * @returns Changes result with TV show IDs and pagination info
   */
  @Cacheable(3600) // Cache for 1 hour
  public async getChangedTVShowIds(
    startDate: Date,
    endDate: Date = new Date(),
    page: number = 1
  ): Promise<ChangeResult> {
    const startDateStr = this.formatDate(startDate);
    const endDateStr = this.formatDate(endDate);

    const url = `${this.apiUrl}/tv/changes?start_date=${startDateStr}&end_date=${endDateStr}&page=${page}&language=${this.language}`;
    const response = await this.get<ChangesResponse>(url);

    return this.paged(response);
  }

  /**
   * Get all changed movie IDs across all pages since the specified timestamp
   * @param startDate Date from which to start tracking changes
   * @param endDate Optional end date for the changes (defaults to current date)
   * @yields ChangeResult Pages of changed movie items
   */
  public async *getAllChangedMovieIds(
    startDate: Date,
    endDate: Date = new Date()
  ): AsyncGenerator<ChangeResult> {
    // Ensure it yields ChangeResult
    let currentPage = 1;
    let totalPages = 1; // Initialize with 1 to fetch the first page

    do {
      const pageResult = await this.getChangedMovieIds(startDate, endDate, currentPage);
      yield pageResult;

      totalPages = pageResult.totalPages;
      currentPage++;
    } while (currentPage <= totalPages);
  }

  /**
   * Get all changed TV show IDs across all pages since the specified timestamp
   * @param startDate Date from which to start tracking changes
   * @param endDate Optional end date for the changes (defaults to current date)
   * @returns Array of all changed TV show items
   */
  public async getAllChangedTVShowIds(
    startDate: Date,
    endDate: Date = new Date()
  ): Promise<ChangeItem[]> {
    const firstPage = await this.getChangedTVShowIds(startDate, endDate, 1);
    const allItems = [...firstPage.items];

    // If there are more pages, fetch them all
    if (firstPage.totalPages > 1) {
      const remainingPages = await Promise.all(
        Array.from({ length: firstPage.totalPages - 1 }, (_, i) =>
          this.getChangedTVShowIds(startDate, endDate, i + 2)
        )
      );

      allItems.push(...remainingPages.flatMap(pageResult => pageResult.items));
    }

    return allItems;
  }

  @Cacheable(172800000 /* 2 days */)
  public async getMovieGenres(language: string = this.language): Promise<{
    genres: Genre[];
  }> {
    const url = `${this.apiUrl}/genre/movie/list?language=${language}`;
    return this.get<{ genres: Genre[] }>(url);
  }

  @Cacheable(172800000 /* 2 days */)
  public async getTVShowGenres(language: string = this.language): Promise<{
    genres: Genre[];
  }> {
    const url = `${this.apiUrl}/genre/tv/list?language=${language}`;
    return this.get<{ genres: Genre[] }>(url);
  }

  /**
   * Get changes for a specific TV show
   * @param tvShowId The TMDB ID of the TV show
   * @returns TV show changes
   */
  @Cacheable(3600) // Cache for 1 hour
  public async getTVShowChanges(tvShowId: number | string): Promise<{
    changes: {
      key: string;
      items: Array<{
        id: string;
        action: string;
        time: string;
        iso_639_1: string;
        iso_3166_1: string;
        value?: {
          season_id?: number;
          season_number?: number;
        };
      }>;
    }[];
  }> {
    const url = `${this.apiUrl}/tv/${tvShowId}/changes?page=1`;
    return this.get(url);
  }
}
