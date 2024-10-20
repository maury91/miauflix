import { Inject, Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { MovieFanartResponse } from './fanart.types';

@Injectable()
export class FanartService {
  private readonly apiUrl: string;
  private readonly apiKey: string;

  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private readonly configService: ConfigService,
    private readonly httpService: HttpService
  ) {
    this.apiUrl = this.configService.getOrThrow('FANART_API_URL');
    this.apiKey = this.configService.getOrThrow('FANART_API_KEY');
  }

  public async getMovieImages(tmdb: string) {
    const cacheKey = `fanart:movie:${tmdb}`;
    const cached = await this.cacheManager.get<MovieFanartResponse>(cacheKey);
    if (cached) {
      return cached;
    }
    const { data } = await this.httpService.axiosRef.get<MovieFanartResponse>(
      `${this.apiUrl}/movies/${tmdb}`,
      {
        params: {
          api_key: this.apiKey,
        },
      }
    );
    await this.cacheManager.set(cacheKey, data, 864e5);
  }
}
