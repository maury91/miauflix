import { Global, Inject, Injectable, Module } from '@nestjs/common';
import { HttpModule, HttpService } from '@nestjs/axios';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { ConfigService } from '@nestjs/config';
import { AxiosRequestConfig } from 'axios';
import {
  ShowEpisodesResponse,
  ShowExtendedResponse,
  TBDBResponseWrapper,
  TokenResponse,
} from './tvdb.types';

const TOKEN_CACHE_KEY = 'tvdb_token';

@Injectable()
export class TVDBApi {
  private readonly apiUrl: string;
  private readonly apiKey: string;

  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private readonly configService: ConfigService,
    private readonly httpService: HttpService
  ) {
    this.apiUrl = this.configService.getOrThrow('TVDB_API_URL');
    this.apiKey = this.configService.getOrThrow('TVDB_API_KEY');
  }

  private getTokenExpiration(token: string): number {
    const tokenParts = token.split('.');
    if (tokenParts.length === 3) {
      try {
        const payload = JSON.parse(
          Buffer.from(tokenParts[1], 'base64').toString()
        );
        if ('exp' in payload) {
          return payload.exp * 1000;
        }
        return 0;
      } catch {
        return 0;
      }
    }
    return 0;
  }

  private async getToken(): Promise<string> {
    const cachedToken = await this.cacheManager.get<string>(TOKEN_CACHE_KEY);
    if (cachedToken) {
      const expiration = this.getTokenExpiration(cachedToken);
      if (expiration > Date.now() + 60000) {
        return cachedToken;
      }
    }
    const {
      data: {
        data: { token },
      },
    } = await this.httpService.axiosRef.post<
      TBDBResponseWrapper<TokenResponse>
    >(`${this.apiUrl}/login`, {
      apikey: this.apiKey,
    });
    const expiration = this.getTokenExpiration(token);
    await this.cacheManager.set(
      TOKEN_CACHE_KEY,
      token,
      expiration - Date.now()
    );
    return token;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async get<T, D = any>(url: string, config?: AxiosRequestConfig<D>) {
    const token = await this.getToken();
    return this.httpService.axiosRef.get<TBDBResponseWrapper<T>>(url, {
      ...(config ?? {}),
      headers: {
        ...(config?.headers ?? {}),
        Authorization: `Bearer ${token}`,
      },
    });
  }

  public async getShow(showId: number) {
    return this.get<ShowExtendedResponse>(
      `${this.apiUrl}/series/${showId}/extended`
    );
  }

  public async getShowEpisodes(showId: number) {
    return this.get<ShowEpisodesResponse>(
      `${this.apiUrl}/series/${showId}/episodes/official`
    );
  }
}

@Global()
@Module({
  imports: [HttpModule],
  providers: [TVDBApi],
  exports: [TVDBApi],
})
export class TVDBApiModule {}
