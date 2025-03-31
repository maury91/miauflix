import type {
  ChangeItem,
  ChangeResult,
  ChangesResponse,
  ConfigurationResponse,
  MovieDetails,
  MovieDetailsResponse,
  MediaSummaryList,
  MovieSummary,
  ShowSeason,
  TVShowDetails,
  TVShowSummary,
  WithExternalIds,
  WithTVShowTranslations,
  WithMovieTranslations,
  WithMovieImages,
} from "./tmdb.types";
import { Cacheable } from "../../utils/cacheable.util";
import { ENV } from "../../constants";
import { RateLimiter } from "../../utils/rateLimiter";
import { ServiceConfiguration } from "src/types/configuration";

export interface MediaImages {
  poster: string;
  backdrop: string;
  backdrops: string[];
  logos: string[];
}

export const NO_IMAGES: MediaImages = {
  logos: [],
  backdrop: "",
  backdrops: [],
  poster: "",
};

export class TMDBApi {
  /**
   * Note about rate limiting, the API is limited to 50requests per second
   * I hightly doubt is possible to reach this limit in a home setting.
   * However, if this happens a 429 error will be returned and this class should
   * start rate limiting itself.
   */

  private readonly apiUrl = ENV("TMDB_API_URL", "https://api.themoviedb.org/3");
  private readonly apiKey = ENV("TMDB_API_ACCESS_TOKEN");
  private readonly rateLimiter = new RateLimiter(50);
  private readonly configuration: Promise<ConfigurationResponse>;

  constructor(private readonly language = "en") {
    this.language = language;
    this.configuration = this.getConfiguration();
  }

  private async request<T>(url: string, init: RequestInit): Promise<T> {
    // Apply rate limiting before making the request
    await this.rateLimiter.throttle();

    const response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
    });
    if (!response.ok) {
      console.error(url, response);
      throw response;
    }
    return response.json() as Promise<T>;
  }

  private async get<T>(url: string): Promise<T> {
    return this.request<T>(url, {});
  }

  private async post<T>(
    url: string,
    body: Record<string, unknown>,
  ): Promise<T> {
    return this.request<T>(url, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  private async completeImageUrl(image: string, size = "original") {
    const config = await this.configuration;
    return `${config.images.secure_base_url}${size}${image}`;
  }

  public async test() {
    await this.get(`${this.apiUrl}/configuration`);
    return true;
  }

  @Cacheable(26e8 /* 30 days */)
  public async getConfiguration() {
    return this.get<ConfigurationResponse>(`${this.apiUrl}/configuration`);
  }

  @Cacheable(36e5 /* 1 hour */)
  public async getSeasonRaw(showId: number, season: number) {
    return this.get<ShowSeason>(
      `${this.apiUrl}/tv/${showId}/season/${season}?language=${this.language}`,
    );
  }

  @Cacheable(6e5 /* 10 minutes */)
  public async getSeason(showId: number, season: number): Promise<ShowSeason> {
    const data = await this.getSeasonRaw(showId, season);
    return {
      ...data,
      poster_path: data.poster_path
        ? await this.completeImageUrl(data.poster_path)
        : "",
      episodes: await Promise.all(
        data.episodes.map(async (episode) => ({
          ...episode,
          still_path: episode.still_path
            ? await this.completeImageUrl(episode.still_path)
            : "",
        })),
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
    const movieData = await this.get<
      MovieDetails & WithMovieTranslations & WithMovieImages
    >(url);
    // Process image paths to include the full URL
    return {
      ...movieData,
      poster_path: movieData.poster_path
        ? await this.completeImageUrl(movieData.poster_path)
        : "",
      backdrop_path: movieData.backdrop_path
        ? await this.completeImageUrl(movieData.backdrop_path)
        : "",
      logo_path: movieData.images?.logos?.length
        ? await this.completeImageUrl(movieData.images.logos[0].file_path)
        : "",
      production_companies: await Promise.all(
        movieData.production_companies.map(async (company) => ({
          ...company,
          logo_path: company.logo_path
            ? await this.completeImageUrl(company.logo_path)
            : "",
        })),
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
    const url = `${this.apiUrl}/tv/${showId}?append_to_response=external_ids,translations`;
    const showData = await this.get<
      TVShowDetails & WithExternalIds & WithTVShowTranslations
    >(url);
    // Process image paths to include the full URL
    return {
      ...showData,
      poster_path: showData.poster_path
        ? await this.completeImageUrl(showData.poster_path)
        : "",
      backdrop_path: showData.backdrop_path
        ? await this.completeImageUrl(showData.backdrop_path)
        : "",
      production_companies: await Promise.all(
        showData.production_companies.map(async (company) => ({
          ...company,
          logo_path: company.logo_path
            ? await this.completeImageUrl(company.logo_path)
            : "",
        })),
      ),
      translations: showData.translations.translations,
    };
  }

  @Cacheable(36e5 /* 1 hour */, true)
  public async getPopularMovies(page = 1): Promise<MediaSummaryList> {
    const url = `${this.apiUrl}/discover/movie?include_adult=false&include_video=false&language=${this.language}&page=${page}&sort_by=popularity.desc&vote_count.gte=10`;
    const [response, genreMap] = await Promise.all([
      this.get<MovieDetailsResponse>(url),
      this.getMovieGenresMap(),
    ]);
    return {
      ...response,
      results: await Promise.all(
        response.results.map(async ({ genre_ids, ...movie }) => ({
          ...movie,
          genres: genre_ids.map((id) => genreMap[id]),
          poster_path: await this.completeImageUrl(movie.poster_path),
          backdrop_path: await this.completeImageUrl(movie.backdrop_path),
          _type: "movie",
        })),
      ),
    };
  }

  @Cacheable(36e5 /* 1 hour */, true)
  public async getTopRatedMovies(page = 1): Promise<MediaSummaryList> {
    const url = `${this.apiUrl}/movie/top_rated?language=${this.language}&page=${page}`;
    const [response, genreMap] = await Promise.all([
      this.get<MovieDetailsResponse>(url),
      this.getMovieGenresMap(),
    ]);

    return {
      ...response,
      results: await Promise.all(
        response.results.map(async ({ genre_ids, ...movie }) => ({
          ...movie,
          genres: genre_ids.map((id) => genreMap[id]),
          poster_path: await this.completeImageUrl(movie.poster_path),
          backdrop_path: await this.completeImageUrl(movie.backdrop_path),
          _type: "movie",
        })),
      ),
    };
  }

  @Cacheable(36e5 /* 1 hour */)
  public async getTrending(
    timeWindow: "day" | "week" = "week",
  ): Promise<(MovieSummary | TVShowSummary)[]> {
    const url = `${this.apiUrl}/trending/all/${timeWindow}?language=${this.language}`;
    const response = await this.get<{
      results: (MovieSummary | TVShowSummary)[];
    }>(url);
    return Promise.all(
      response.results.map(async (item) => ({
        ...item,
        poster_path: await this.completeImageUrl(item.poster_path),
        backdrop_path: await this.completeImageUrl(item.backdrop_path),
      })),
    );
  }

  @Cacheable(36e5 /* 1 hour */)
  public async getTrendingMovies(
    timeWindow: "day" | "week" = "week",
  ): Promise<MovieSummary[]> {
    const url = `${this.apiUrl}/trending/movie/${timeWindow}?language=${this.language}`;
    const response = await this.get<{ results: MovieSummary[] }>(url);
    return Promise.all(
      response.results.map(async (movie) => ({
        ...movie,
        poster_path: await this.completeImageUrl(movie.poster_path),
        backdrop_path: await this.completeImageUrl(movie.backdrop_path),
      })),
    );
  }

  @Cacheable(36e5 /* 1 hour */)
  public async getTrendingShows(
    timeWindow: "day" | "week" = "week",
  ): Promise<TVShowSummary[]> {
    const url = `${this.apiUrl}/trending/tv/${timeWindow}?language=${this.language}`;
    const response = await this.get<{ results: TVShowSummary[] }>(url);
    return Promise.all(
      response.results.map(async (show) => ({
        ...show,
        poster_path: await this.completeImageUrl(show.poster_path),
        backdrop_path: await this.completeImageUrl(show.backdrop_path),
      })),
    );
  }

  @Cacheable(36e5 /* 1 hour */)
  public async getPopularShows(page = 1): Promise<TVShowSummary[]> {
    const url = `${this.apiUrl}/discover/tv?include_adult=false&include_null_first_air_dates=false&language=${this.language}&page=${page}&sort_by=popularity.desc&vote_count.gte=10`;
    const response = await this.get<{ results: TVShowSummary[] }>(url);
    return Promise.all(
      response.results.map(async (show) => ({
        ...show,
        poster_path: await this.completeImageUrl(show.poster_path),
        backdrop_path: await this.completeImageUrl(show.backdrop_path),
      })),
    );
  }

  @Cacheable(36e5 /* 1 hour */)
  public async getTopRatedShows(): Promise<TVShowSummary[]> {
    const url = `${this.apiUrl}/tv/top_rated?language=${this.language}`;
    const response = await this.get<{ results: TVShowSummary[] }>(url);
    return Promise.all(
      response.results.map(async (show) => ({
        ...show,
        poster_path: await this.completeImageUrl(show.poster_path),
        backdrop_path: await this.completeImageUrl(show.backdrop_path),
      })),
    );
  }

  /**
   * Format date for TMDB API (YYYY-MM-DD)
   * @param date The date to format
   * @returns Formatted date string
   */
  private formatDate(date: Date): string {
    return date.toISOString().split("T")[0];
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
    page: number = 1,
  ): Promise<ChangeResult> {
    const startDateStr = this.formatDate(startDate);
    const endDateStr = this.formatDate(endDate);

    const url = `${this.apiUrl}/movie/changes?start_date=${startDateStr}&end_date=${endDateStr}&page=${page}&language=${this.language}`;
    const response = await this.get<ChangesResponse>(url);

    return {
      items: response.results,
      page: response.page,
      totalPages: response.total_pages,
      totalResults: response.total_results,
    };
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
    page: number = 1,
  ): Promise<ChangeResult> {
    const startDateStr = this.formatDate(startDate);
    const endDateStr = this.formatDate(endDate);

    const url = `${this.apiUrl}/tv/changes?start_date=${startDateStr}&end_date=${endDateStr}&page=${page}&language=${this.language}`;
    const response = await this.get<ChangesResponse>(url);

    return {
      items: response.results,
      page: response.page,
      totalPages: response.total_pages,
      totalResults: response.total_results,
    };
  }

  /**
   * Get all changed movie IDs across all pages since the specified timestamp
   * @param startDate Date from which to start tracking changes
   * @param endDate Optional end date for the changes (defaults to current date)
   * @returns Array of all changed movie items
   */
  public async getAllChangedMovieIds(
    startDate: Date,
    endDate: Date = new Date(),
  ): Promise<ChangeItem[]> {
    const firstPage = await this.getChangedMovieIds(startDate, endDate, 1);
    const allItems = [...firstPage.items];

    // If there are more pages, fetch them all
    if (firstPage.totalPages > 1) {
      const remainingPagePromises = [];

      for (let page = 2; page <= firstPage.totalPages; page++) {
        remainingPagePromises.push(
          this.getChangedMovieIds(startDate, endDate, page),
        );
      }

      const remainingPages = await Promise.all(remainingPagePromises);

      for (const pageResult of remainingPages) {
        allItems.push(...pageResult.items);
      }
    }

    return allItems;
  }

  /**
   * Get all changed TV show IDs across all pages since the specified timestamp
   * @param startDate Date from which to start tracking changes
   * @param endDate Optional end date for the changes (defaults to current date)
   * @returns Array of all changed TV show items
   */
  public async getAllChangedTVShowIds(
    startDate: Date,
    endDate: Date = new Date(),
  ): Promise<ChangeItem[]> {
    const firstPage = await this.getChangedTVShowIds(startDate, endDate, 1);
    const allItems = [...firstPage.items];

    // If there are more pages, fetch them all
    if (firstPage.totalPages > 1) {
      const remainingPages = await Promise.all(
        Array.from({ length: firstPage.totalPages - 1 }, (_, i) =>
          this.getChangedTVShowIds(startDate, endDate, i + 2),
        ),
      );

      allItems.push(
        ...remainingPages.flatMap((pageResult) => pageResult.items),
      );
    }

    return allItems;
  }

  @Cacheable(172800000 /* 2 days */)
  public async getMovieGenres(): Promise<{
    genres: { id: number; name: string }[];
  }> {
    const url = `${this.apiUrl}/genre/movie/list?language=${this.language}`;
    return this.get<{ genres: { id: number; name: string }[] }>(url);
  }

  private async getMovieGenresMap() {
    const data = await this.getMovieGenres();
    return data.genres.reduce(
      (acc, genre) => {
        acc[genre.id] = genre.name;
        return acc;
      },
      {} as Record<number, string>,
    );
  }

  @Cacheable(172800000 /* 2 days */)
  public async getTVShowGenres(): Promise<{
    genres: { id: number; name: string }[];
  }> {
    const url = `${this.apiUrl}/genre/tv/list?language=${this.language}`;
    return this.get<{ genres: { id: number; name: string }[] }>(url);
  }

  private async getTVShowGenresMap() {
    const data = await this.getTVShowGenres();
    return data.genres.reduce(
      (acc, genre) => {
        acc[genre.id] = genre.name;
        return acc;
      },
      {} as Record<number, string>,
    );
  }
}

export const tmdbConfigurationDefinition: ServiceConfiguration = {
  name: "The Movie Database (TMDB)",
  description: "Service for fetching movie and TV show information",
  variables: {
    TMDB_API_URL: {
      description: "URL for The Movie Database API",
      example: "https://api.themoviedb.org/3",
      defaultValue: "https://api.themoviedb.org/3",
      required: false,
    },
    TMDB_API_ACCESS_TOKEN: {
      description: "Access token for The Movie Database API",
      example: "eyJhbGciOiJIUzI1NiJ9...",
      link: "https://www.themoviedb.org/settings/api",
      required: true,
      password: true,
    },
  },
  test: async () => {
    try {
      const tmdbApi = new TMDBApi();

      // Use test because it doesn't use cache
      await tmdbApi.test();
    } catch (error: any) {
      if ("status" in error) {
        if (error.status === 401) {
          throw new Error(`Invalid Access Token`);
        }
        throw new Error(`Connection error: ${error.status}`);
      }
      throw error;
    }
  },
};
