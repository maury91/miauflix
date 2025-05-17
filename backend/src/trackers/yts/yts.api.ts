import { Api } from '@utils/api.util';
import { Cacheable } from '@utils/cacheable.util';
import { TrackStatus } from '@utils/trackStatus.util';

import { ENV } from '../../constants';
import type {
  Movie,
  MovieDetailsResponse,
  MovieListResponse,
  MovieParentalGuidesResponse,
  MovieSuggestionResponse,
} from './yts.types';
import { normalizeYTSTorrent } from './yts.utils';

// A list of YTS domain mirrors to try if the primary domain is unreachable
const domainMirrors = ['yts.mx', 'yts.rs', 'yts.hn', 'yts.lt', 'yts.am'];

/**
 * YTS API Service
 *
 * API documentation: https://yts.mx/api
 */
export class YTSApi extends Api {
  private currentDomainIndex = 0;

  constructor() {
    super(
      ENV('YTS_API_URL') || `https://${domainMirrors[0]}/api/v2`,
      // YTS doesn't document rate limits specifically, but we'll implement
      // a conservative rate limiter (20 requests per minute) to be safe
      20 / 60 // 20 requests per minute
    );
  }

  /**
   * Make a request to the YTS API with rate limiting and error handling
   */
  @TrackStatus()
  private async request<T>(
    endpoint: string,
    params: Record<string, boolean | number | string> = {}
  ): Promise<T> {
    // Apply rate limiting before making the request
    await this.rateLimiter.throttle();

    const queryParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      queryParams.append(key, String(value));
    });

    const url = `${this.apiUrl}/${endpoint}?${queryParams.toString()}`;

    try {
      const response = await fetch(url);

      if (!response.ok) {
        console.error(`YTS API error for ${url}:`, response.status, response.statusText);
        throw new Error(`YTS API error: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as T;
      return data;
    } catch (error) {
      console.error(`YTS API request failed for ${url}:`, error);

      // Try with a different domain mirror if available
      if (this.currentDomainIndex < domainMirrors.length - 1) {
        this.currentDomainIndex++;
        const newDomain = domainMirrors[this.currentDomainIndex];
        console.log(`Trying alternative YTS domain: ${newDomain}`);
        this.apiUrl = `https://${newDomain}/api/v2`;
        return this.request<T>(endpoint, params);
      }

      throw error;
    }
  }

  /**
   * Test the API connection
   */
  public async test(): Promise<boolean> {
    try {
      const response = await this.request<MovieListResponse>('list_movies.json', { limit: 1 });
      return response.status === 'ok';
    } catch {
      // Ignore the error and just return false to indicate the test failed
      return false;
    }
  }

  /**
   * Search for movies by query term (can be movie title or IMDb ID)
   */
  @Cacheable(36e5 /* 1 hour */)
  public async searchMovies(
    queryTerm: string,
    page: number = 1,
    limit: number = 20
  ): Promise<MovieListResponse> {
    return this.request<MovieListResponse>('list_movies.json', {
      query_term: queryTerm,
      page,
      limit,
    });
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
    return this.request<MovieDetailsResponse>('movie_details.json', {
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
    return this.request<MovieDetailsResponse>('movie_details.json', {
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
    return this.request<MovieSuggestionResponse>('movie_suggestions.json', {
      movie_id: movieId,
    });
  }

  /**
   * Get parental guides for a movie
   */
  @Cacheable(36e5 /* 1 hour */)
  public async getParentalGuides(movieId: number): Promise<MovieParentalGuidesResponse> {
    return this.request<MovieParentalGuidesResponse>('movie_parental_guides.json', {
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
    return this.request<MovieListResponse>('list_movies.json', options);
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

  /**
   * Create a magnet link from a torrent hash and movie title
   */
  public createMagnetLink(torrentHash: string, movieTitle: string): string {
    const encodedTitle = encodeURIComponent(movieTitle);

    // List of trackers recommended by YTS
    const trackers = [
      'udp://open.demonii.com:1337/announce',
      'udp://tracker.openbittorrent.com:80',
      'udp://tracker.coppersurfer.tk:6969',
      'udp://glotorrents.pw:6969/announce',
      'udp://tracker.opentrackr.org:1337/announce',
      'udp://torrent.gresille.org:80/announce',
      'udp://p4p.arenabg.com:1337',
      'udp://tracker.leechers-paradise.org:6969',
    ];

    const trackerParams = trackers.map(tracker => `&tr=${encodeURIComponent(tracker)}`).join('');

    return `magnet:?xt=urn:btih:${torrentHash}&dn=${encodedTitle}${trackerParams}`;
  }

  /**
   * Get normalized torrent data for a movie
   * @param movie The YTS movie object
   * @returns Array of normalized torrent data
   */
  public getNormalizedTorrents(movie: Movie) {
    return movie.torrents.map(torrent =>
      normalizeYTSTorrent(torrent, movie.title_long, movie.runtime)
    );
  }

  /**
   * Search for a movie by IMDb ID and return normalized data
   * @param imdbId The IMDb ID of the movie
   * @returns The movie with normalized torrent data, or null if not found
   */
  @Cacheable(36e5 /* 1 hour */)
  public async getMovieWithTorrents(imdbId: string) {
    const response = await this.searchMovies(imdbId);

    if (!response.data.movie_count || !response.data.movies.length) {
      return null;
    }

    const movie = response.data.movies[0];

    return {
      id: movie.id,
      imdbCode: movie.imdb_code,
      title: movie.title,
      titleLong: movie.title_long,
      year: movie.year,
      rating: movie.rating,
      runtime: movie.runtime,
      genres: movie.genres,
      summary: movie.summary || movie.description_full || '',
      language: movie.language,
      coverImage: movie.large_cover_image,
      backdropImage: movie.background_image,
      trailerCode: movie.yt_trailer_code,
      torrents: this.getNormalizedTorrents(movie),
    };
  }
}
