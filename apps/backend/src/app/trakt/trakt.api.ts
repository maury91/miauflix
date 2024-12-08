import { Global, Inject, Injectable, Module } from '@nestjs/common';
import { HttpModule, HttpService } from '@nestjs/axios';
import {
  DeviceCodeResponse,
  DeviceTokenResponse,
  ExtendedMovie,
  MostFavoritedMoviesResponse,
  Movie as TraktMovie,
  Movie,
  PopularMoviesResponse,
  ProgressResponse,
  SearchMoviesResponse,
  ShowSeason,
  TrendingMoviesResponse,
  TrendingShowsResponse,
  UserProfileResponse,
  Show,
  ShowEpisode,
  ShowEpisodeMinimal,
} from './trakt.types';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { AxiosRequestConfig } from 'axios';
import { Cacheable } from '../utils/cacheable.util';
import { Paginated } from '@miauflix/types';
import { MoviesData } from '../movies/movies.data';
import { sleep } from '../utils/sleep';

const parsePagination = <T>(
  data: T[],
  headers: Record<string, string>
): Paginated<T> => ({
  data,
  page: Number(headers['x-pagination-page']) - 1,
  pageSize: Number(headers['x-pagination-limit']),
  totalPages: Number(headers['x-pagination-page-count']) - 1,
  total: Number(headers['x-pagination-item-count']),
});

@Injectable()
export class TraktApi {
  private readonly apiUrl: string;
  private readonly clientId: string;
  private readonly clientSecret: string;

  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly movieData: MoviesData
  ) {
    this.apiUrl = this.configService.getOrThrow('TRAKT_API_URL');
    this.clientId = this.configService.getOrThrow('TRAKT_CLIENT_ID');
    this.clientSecret = this.configService.getOrThrow('TRAKT_CLIENT_SECRET');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private get<T, D = any>(url: string, config?: AxiosRequestConfig<D>) {
    return this.httpService.axiosRef.get<T>(url, {
      ...(config ?? {}),
      headers: {
        ...(config?.headers ?? {}),
        'trakt-api-version': '2',
        'trakt-api-key': this.clientId,
      },
    });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private post<T, D = any>(
    url: string,
    data: D,
    config?: AxiosRequestConfig<D>
  ) {
    return this.httpService.axiosRef.post<T>(url, data, {
      ...(config ?? {}),
      headers: {
        ...(config?.headers ?? {}),
        'trakt-api-version': '2',
        'trakt-api-key': this.clientId,
      },
    });
  }

  public async getDeviceCode() {
    const response = await this.httpService.axiosRef.post<DeviceCodeResponse>(
      `${this.apiUrl}/oauth/device/code`,
      {
        client_id: this.clientId,
      }
    );
    if (response.status !== 200) {
      throw new Error(response.statusText);
    }
    return {
      codeUrl: `${response.data.verification_url}/${response.data.user_code}`,
      deviceCode: response.data.device_code,
      expiresIn: response.data.expires_in,
      interval: response.data.interval,
    };
  }

  public async checkDeviceCode(deviceCode: string) {
    return (
      await this.httpService.axiosRef.post<DeviceTokenResponse>(
        `${this.apiUrl}/oauth/device/token`,
        {
          code: deviceCode,
          client_id: this.clientId,
          client_secret: this.clientSecret,
        }
      )
    ).data;
  }

  public async getProfile(accessToken: string, slug = 'me') {
    return (
      await this.get<UserProfileResponse>(`${this.apiUrl}/users/${slug}`, {
        headers: {
          Authorization: `bearer ${accessToken}`,
        },
      })
    ).data;
  }

  public async getMovieFromDB(slug: string): Promise<TraktMovie> {
    const movieFromDB = await this.movieData.findTraktMovie(slug);

    if (!movieFromDB) {
      console.log('Movie not in DB');
      const movieFromApi = await this.getMovie(slug);
      // FixMe: Trigger extend movie job
      return movieFromApi;
    }

    return movieFromDB;
  }

  public async refreshToken(refreshToken: string) {
    return (
      await this.post<DeviceTokenResponse>(`${this.apiUrl}/oauth/token`, {
        refresh_token: refreshToken,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: 'refresh_token',
      })
    ).data;
  }

  public async playbackTracking(
    media: Movie | ShowEpisodeMinimal,
    type: 'movie' | 'show',
    action: 'start' | 'pause' | 'stop',
    progress: number,
    accessToken: string
  ) {
    console.log({
      [type === 'show' ? 'episode' : 'movie']: media,
      progress,
    });
    return this.post(
      `${this.apiUrl}/scrobble/${action}`,
      {
        [type === 'show' ? 'episode' : 'movie']: media,
        progress,
      },
      {
        headers: {
          Authorization: `bearer ${accessToken}`,
        },
      }
    );
  }

  public async trackPlayback(
    slug: string,
    accessToken: string,
    type: 'movie' | 'episode',
    action: 'start' | 'pause' | 'stop',
    progress: number
  ) {
    if (type === 'episode') {
      return this.playbackTracking(
        { ids: { trakt: parseInt(slug, 10) } } as ShowEpisodeMinimal,
        'show',
        action,
        progress,
        accessToken
      );
    }
    const movie = await this.getMovieFromDB(slug);
    return this.playbackTracking(movie, 'movie', action, progress, accessToken);
  }

  @Cacheable(3e4 /* 30 seconds */)
  public async getProgress<T extends 'movies' | 'episodes'>(
    accessToken: string,
    type: T
  ) {
    return (
      await this.get<ProgressResponse<T>>(
        `${this.apiUrl}/sync/playback/${type}`,
        {
          headers: {
            Authorization: `bearer ${accessToken}`,
          },
        }
      )
    ).data;
  }

  private async getMethodSubset(
    method: 'getTrendingMoviesBig',
    page?: number,
    limit?: number
  ): Promise<ReturnType<TraktApi['getTrendingMoviesBig']>>;
  private async getMethodSubset(
    method: 'getTrendingShowsBig',
    page?: number,
    limit?: number
  ): Promise<ReturnType<TraktApi['getTrendingShowsBig']>>;
  private async getMethodSubset(
    method: 'getPopularMoviesBig',
    page?: number,
    limit?: number
  ): Promise<ReturnType<TraktApi['getPopularMoviesBig']>>;
  private async getMethodSubset(
    method:
      | 'getTrendingMoviesBig'
      | 'getTrendingShowsBig'
      | 'getPopularMoviesBig',
    page = 0,
    limit = 30
  ): Promise<ReturnType<TraktApi[typeof method]>> {
    const bigPage = Math.floor(page / 5);
    const subPage = page % 5;
    const { data, total } = (await this[method](
      bigPage,
      limit
    )) satisfies Awaited<ReturnType<TraktApi[typeof method]>>;

    return {
      data: data.slice(subPage * limit, (subPage + 1) * limit),
      page: page,
      totalPages: Math.ceil(total / limit),
      total,
      pageSize: limit,
    } as Awaited<ReturnType<TraktApi[typeof method]>>;
  }

  @Cacheable(216e5 /* 6 hours */)
  private async getTrendingMoviesBig(page = 0, limit = 20) {
    const result = await this.get<TrendingMoviesResponse>(
      `${this.apiUrl}/movies/trending`,
      {
        params: { page: page + 1, limit: limit * 5 },
      }
    );
    return parsePagination(
      result.data,
      result.headers as Record<string, string>
    );
  }

  public async getTrendingMovies(page = 0, limit = 20) {
    return this.getMethodSubset('getTrendingMoviesBig', page, limit);
  }

  @Cacheable(216e5 /* 6 hours */)
  private async getTrendingShowsBig(page = 0, limit = 20) {
    const result = await this.get<TrendingShowsResponse>(
      `${this.apiUrl}/shows/trending`,
      {
        params: { page, limit: limit * 5 },
      }
    );
    return parsePagination(
      result.data,
      result.headers as Record<string, string>
    );
  }

  public async getTrendingShows(page = 0, limit = 20) {
    return this.getMethodSubset('getTrendingShowsBig', page, limit);
  }

  @Cacheable(216e5 /* 6 hours */)
  private async getPopularMoviesBig(page = 0, limit = 20) {
    const result = await this.get<PopularMoviesResponse>(
      `${this.apiUrl}/movies/popular`,
      {
        params: { page, limit: limit * 5 },
      }
    );
    return parsePagination(
      result.data,
      result.headers as Record<string, string>
    );
  }

  public async getPopularMovies(page = 0, limit = 20) {
    return this.getMethodSubset('getPopularMoviesBig', page, limit);
  }

  @Cacheable(9e5 /* 15 minutes */)
  public async getMostFavoritedMovies(period = 'weekly', page = 0, limit = 30) {
    const result = await this.get<MostFavoritedMoviesResponse>(
      `${this.apiUrl}/movies/favorited/${period}`,
      {
        params: { page, limit },
      }
    );
    return {
      data: result.data,
      pagination: {
        page: Number(result.headers['X-Pagination-Page']),
        limit: Number(result.headers['X-Pagination-Limit']),
        pageCount: Number(result.headers['X-Pagination-Page-Count']),
        itemCount: Number(result.headers['X-Pagination-Item-Count']),
      },
    };
  }

  @Cacheable(144e6 /* 1 day */)
  public async searchMovies(query: string, limit = 30) {
    const result = await this.get<SearchMoviesResponse>(
      `${this.apiUrl}/search/movie`,
      {
        params: {
          limit,
          query,
        },
      }
    );
    return {
      data: result.data,
      pagination: {
        page: Number(result.headers['X-Pagination-Page']),
        limit: Number(result.headers['X-Pagination-Limit']),
        pageCount: Number(result.headers['X-Pagination-Page-Count']),
        itemCount: Number(result.headers['X-Pagination-Item-Count']),
      },
    };
  }

  @Cacheable(144e6 /* 1 day */)
  public async getMovie<
    E extends boolean = false,
    T = E extends true ? ExtendedMovie : Movie
  >(movieId: string, extended = false as E): Promise<T> {
    return (
      await this.get<T>(`${this.apiUrl}/movies/${movieId}`, {
        params: {
          extended: extended ? 'full' : 'metadata',
        },
      })
    ).data;
  }

  @Cacheable(144e6 /* 1 day */)
  public async getShow<E extends boolean = false>(
    showId: string,
    extended = false as E
  ): Promise<Show<E>> {
    return (
      await this.get<Show<E>>(`${this.apiUrl}/shows/${showId}`, {
        params: {
          extended: extended ? 'full' : 'metadata',
        },
      })
    ).data;
  }

  @Cacheable(144e6 /* 1 day */)
  public async getShowSeasons<E extends boolean = false>(
    showId: string,
    extended = false as E
  ): Promise<ShowSeason<E>[]> {
    return (
      await this.get<ShowSeason<E>[]>(
        `${this.apiUrl}/shows/${showId}/seasons`,
        {
          params: {
            extended: extended ? 'full' : 'metadata',
          },
        }
      )
    ).data;
  }

  public async getShowSeasonEpisodes<E extends boolean = false>(
    showId: string,
    season: number,
    extended = false as E
  ) {
    return (
      await this.get<ShowEpisode<E>[]>(
        `${this.apiUrl}/shows/${showId}/seasons/${season}`,
        {
          params: {
            extended: extended ? 'full' : 'metadata',
          },
        }
      )
    ).data;
  }

  public async preCacheNextPages(
    page: number,
    totalPages: number,
    method: 'getTrendingMovies' | 'getPopularMovies' | 'getTrendingShows'
  ) {
    for (
      let nextPage = page + 1;
      nextPage <= Math.min(page + 5, totalPages);
      nextPage++
    ) {
      await sleep(500);
      await this[method](page);
    }
  }
}

@Global()
@Module({
  imports: [HttpModule],
  providers: [TraktApi],
  exports: [TraktApi],
})
export class TraktApiModule {}
