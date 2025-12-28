import { logger } from '@logger';
import type { Cache } from 'cache-manager';

import { ENV } from '@constants';
import type { RequestService } from '@services/request/request.service';
import { Api } from '@utils/api.util';
import { Cacheable } from '@utils/cacheable.util';
import { TrackStatus } from '@utils/trackStatus.util';

import type {
  MovieDetailsResponse,
  MovieListResponse,
  MovieParentalGuidesResponse,
  MovieSuggestionResponse,
} from './yts.types';
import { discoverYTSMirrors } from './yts-mirror-discovery';

const fallbackDomainMirrors = ['yts.lt', 'yts.gg', 'yts.am', 'yts.ag'];

/**
 * YTS API Service
 *
 * API documentation: https://yts.mx/api
 */
export class YTSApi extends Api {
  private currentDomainIndex = 0;
  private domainMirrors: string[] = fallbackDomainMirrors;
  private domainMirrorsPromise: Promise<string[]> | null = null;

  constructor(
    cache: Cache,
    private readonly requestService: RequestService
  ) {
    super(
      cache,
      ENV('YTS_API_URL') || `https://${fallbackDomainMirrors[0]}`,
      // YTS doesn't document rate limits specifically, but we'll implement
      // a conservative rate limiter (20 requests per minute) to be safe
      20 / 60, // Default RateLimiter: 20 requests per minute ( 1 request every 3 seconds )
      2 // High priority RateLimiter: 2 request per second
    );

    // Start discovering domains asynchronously
    this.initializeDomainMirrors();
  }

  /**
   * Initialize the domain mirrors
   */
  private async initializeDomainMirrors(): Promise<void> {
    if (this.domainMirrorsPromise) {
      await this.domainMirrorsPromise;
      return;
    }

    this.domainMirrorsPromise = discoverYTSMirrors(this.cache, this.requestService)
      .catch(() => fallbackDomainMirrors)
      .then(domains => {
        this.domainMirrors = domains;
        if (!ENV('YTS_API_URL') && domains.length > 0) {
          this.apiUrl = `https://${domains[0]}`;
        }
        return domains;
      });
  }

  /**
   * Make a request to the YTS API with rate limiting and error handling
   */
  @TrackStatus()
  private async request<T>(
    endpoint: string,
    params: Record<string, boolean | number | string> = {},
    highPriority = false
  ): Promise<T> {
    // Wait for the domain mirrors to be initialized
    await this.initializeDomainMirrors();

    // Apply rate limiting before making the request
    await this.throttle(highPriority);

    const url = `${this.apiUrl}/${endpoint}`;

    try {
      const response = await this.requestService.request<T>(url, {
        queryString: params,
      });

      if (!response.ok) {
        logger.error('YTS', `API error for ${url}:`, response.status, response.statusText);
        throw new Error(`YTS API error: (${response.status}) ${response.statusText}`);
      }

      const contentType = response.headers['content-type'] || '';
      if (contentType.includes('application/octet-stream')) {
        // Handle non-JSON responses (e.g., file downloads)
        if (typeof response.body === 'string') {
          return Buffer.from(response.body, 'binary').buffer as unknown as T;
        }
        return response.body as unknown as T;
      }
      if (contentType.includes('text/html')) {
        // This is most likely the 404 page or an error page
        logger.error(
          'YTS',
          `Received HTML response for ${url}. This may indicate an error or a 404 page.`
        );
        throw new Error(`YTS API returned HTML response for ${url}`);
      }
      if (typeof response.body === 'string') {
        throw new Error(`YTS API returned non-JSON response for ${url}`);
      }
      return response.body;
    } catch (error) {
      logger.error('YTS', `API request failed for ${url}:`, error);

      // Try with a different domain mirror if available
      if (this.currentDomainIndex < this.domainMirrors.length - 1) {
        this.currentDomainIndex++;
        this.apiUrl = `https://${this.domainMirrors[this.currentDomainIndex]}`;
        logger.info('YTS', `Trying alternative YTS domain: ${this.apiUrl}`);
        return this.request<T>(endpoint, params, highPriority);
      }

      throw error;
    }
  }

  /**
   * Test the API connection
   */
  public async test(): Promise<boolean> {
    try {
      const response = await this.request<MovieListResponse>('api/v2/list_movies.json', {
        limit: 1,
      });
      return response.status === 'ok';
    } catch {
      // Ignore the error and just return false to indicate the test failed
      return false;
    }
  }

  /**
   * Search for movies by query term (can be movie title or IMDb ID)
   * @param queryTerm The search term (movie title or IMDb ID)
   * @param page The page number for pagination (default: 1)
   * @param limit The number of results per page (default: 20)
   * @param highPriority Whether to use high priority rate limiting (default: false)
   * @returns A promise that resolves to a MovieListResponse containing the search results
   * @throws Error if the API request fails or returns an error
   */
  @Cacheable(36e5 /* 1 hour */)
  public async searchMovies(
    queryTerm: string,
    page: number = 1,
    limit: number = 20,
    highPriority = false
  ): Promise<MovieListResponse> {
    return this.request<MovieListResponse>(
      'api/v2/list_movies.json',
      {
        query_term: queryTerm,
        page,
        limit,
      },
      highPriority
    );
  }

  /**
   * Get details for a specific movie by IMDb ID
   */
  @Cacheable(36e5 /* 1 hour */)
  public async getMovieByImdbId(
    imdbId: string,
    withImages: boolean = true,
    withCast: boolean = true
  ): Promise<MovieDetailsResponse> {
    return this.request<MovieDetailsResponse>('api/v2/movie_details.json', {
      imdb_id: imdbId,
      with_images: withImages,
      with_cast: withCast,
    });
  }

  /**
   * Get details for a specific movie by YTS movie ID
   */
  @Cacheable(36e5 /* 1 hour */)
  public async getMovieById(
    movieId: number,
    withImages: boolean = true,
    withCast: boolean = true
  ): Promise<MovieDetailsResponse> {
    return this.request<MovieDetailsResponse>('api/v2/movie_details.json', {
      movie_id: movieId,
      with_images: withImages,
      with_cast: withCast,
    });
  }

  /**
   * Get movie suggestions related to a specific movie
   */
  @Cacheable(36e5 /* 1 hour */)
  public async getMovieSuggestions(movieId: number): Promise<MovieSuggestionResponse> {
    return this.request<MovieSuggestionResponse>('api/v2/movie_suggestions.json', {
      movie_id: movieId,
    });
  }

  /**
   * Get parental guides for a movie
   */
  @Cacheable(36e5 /* 1 hour */)
  public async getParentalGuides(movieId: number): Promise<MovieParentalGuidesResponse> {
    return this.request<MovieParentalGuidesResponse>('api/v2/movie_parental_guides.json', {
      movie_id: movieId,
    });
  }

  /**
   * List movies with various filtering options
   */
  @Cacheable(36e5 /* 1 hour */)
  public async listMovies(
    options: {
      page?: number;
      limit?: number;
      quality?: string;
      minimum_rating?: number;
      genre?: string;
      sort_by?:
        | 'date_added'
        | 'download_count'
        | 'like_count'
        | 'peers'
        | 'rating'
        | 'seeds'
        | 'title'
        | 'year';
      order_by?: 'asc' | 'desc';
    } = {}
  ): Promise<MovieListResponse> {
    return this.request<MovieListResponse>('api/v2/list_movies.json', options);
  }

  /**
   * List latest movies
   */
  @Cacheable(36e5 /* 1 hour */)
  public async getLatestMovies(page: number = 1, limit: number = 20): Promise<MovieListResponse> {
    return this.listMovies({
      page,
      limit,
      sort_by: 'date_added',
      order_by: 'desc',
    });
  }

  /**
   * List popular movies based on download count
   */
  @Cacheable(36e5 /* 1 hour */)
  public async getPopularMovies(page: number = 1, limit: number = 20): Promise<MovieListResponse> {
    return this.listMovies({
      page,
      limit,
      sort_by: 'download_count',
      order_by: 'desc',
    });
  }

  /**
   * Get top rated movies
   */
  @Cacheable(36e5 /* 1 hour */)
  public async getTopRatedMovies(
    page: number = 1,
    limit: number = 20,
    minimumRating: number = 7
  ): Promise<MovieListResponse> {
    return this.listMovies({
      page,
      limit,
      sort_by: 'rating',
      order_by: 'desc',
      minimum_rating: minimumRating,
    });
  }

  /**
   * Get movies by genre
   */
  @Cacheable(36e5 /* 1 hour */)
  public async getMoviesByGenre(
    genre: string,
    page: number = 1,
    limit: number = 20
  ): Promise<MovieListResponse> {
    return this.listMovies({
      page,
      limit,
      genre,
      sort_by: 'date_added',
      order_by: 'desc',
    });
  }

  public async download(hash: string): Promise<Buffer | null> {
    const result = await this.request<ArrayBuffer>(`torrent/download/${hash}`, {});
    if (result instanceof ArrayBuffer) {
      return Buffer.from(result);
    } else {
      logger.error('YTS', `Unexpected response type for source download: ${typeof result}`);
      return null;
    }
  }
}
