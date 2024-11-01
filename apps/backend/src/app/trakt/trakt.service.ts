import { Inject, Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import {
  DeviceCodeResponse,
  DeviceTokenResponse,
  ExtendedMovie,
  MostFavoritedMoviesResponse,
  Movie,
  PopularMoviesResponse,
  TrendingMoviesResponse,
  UserProfileResponse,
} from './trakt.types';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { AxiosRequestConfig } from 'axios';
import { Cacheable } from '../utils/cacheable.util';
import { Paginated } from '@miauflix/types';

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
export class TraktService {
  private readonly apiUrl: string;
  private readonly clientId: string;
  private readonly clientSecret: string;

  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private readonly configService: ConfigService,
    private readonly httpService: HttpService
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
      await this.httpService.axiosRef.get<UserProfileResponse>(
        `${this.apiUrl}/users/${slug}`,
        {
          headers: {
            Authorization: `bearer ${accessToken}`,
          },
        }
      )
    ).data;
  }

  @Cacheable(9e5 /* 15 minutes */)
  public async getTrendingMovies(page = 1, limit = 20) {
    const result = await this.get<TrendingMoviesResponse>(
      `${this.apiUrl}/movies/trending`,
      {
        params: { page, limit },
      }
    );
    return parsePagination(
      result.data,
      result.headers as Record<string, string>
    );
  }

  @Cacheable(9e5 /* 15 minutes */, true)
  public async getPopularMovies(page = 1, limit = 30) {
    const result = await this.get<PopularMoviesResponse>(
      `${this.apiUrl}/movies/popular`,
      {
        params: { page, limit },
      }
    );
    return parsePagination(
      result.data,
      result.headers as Record<string, string>
    );
  }

  @Cacheable(3e5 /* 5 minutes */)
  public async getMostFavoritedMovies(period = 'weekly', page = 1, limit = 30) {
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
  public async getMovie<
    E extends boolean,
    T = E extends true ? ExtendedMovie : Movie
  >(movieId: string, extended?: E): Promise<T> {
    return (
      await this.get<T>(`${this.apiUrl}/movies/${movieId}`, {
        params: {
          extended: extended ? 'full' : 'metadata',
        },
      })
    ).data;
  }
}
