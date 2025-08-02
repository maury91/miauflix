import { ENV } from '@constants';
import { tracedApi } from '@utils/tracing.util';

import type {
  DeviceCodeResponse,
  DeviceTokenResponse,
  TraktList,
  TraktListItem,
  TraktPagination,
  UserProfileResponse,
} from './trakt.types';

interface RateLimitInfo {
  name: 'AUTHED_API_GET_LIMIT' | 'AUTHED_API_POST_LIMIT' | 'UNAUTHED_API_GET_LIMIT';
  period: number;
  limit: number;
  remaining: number;
  ongoing: number;
  until: Date;
}

export class TraktApi {
  private readonly clientId = ENV('TRAKT_CLIENT_ID');
  private readonly clientSecret = ENV('TRAKT_CLIENT_SECRET');
  private readonly apiUrl = ENV('TRAKT_API_URL');
  private rateLimits: Partial<Record<RateLimitInfo['name'], RateLimitInfo>> = {};
  private staticLimits: Record<RateLimitInfo['name'], [number, number]> = {
    // These are from the documentation
    AUTHED_API_GET_LIMIT: [1000, 300],
    UNAUTHED_API_GET_LIMIT: [1000, 300],
    AUTHED_API_POST_LIMIT: [1, 1],
  };

  constructor() {
    if (!this.clientId) {
      throw new Error('TRAKT_CLIENT_ID is not set');
    }
    if (!this.clientSecret) {
      throw new Error('TRAKT_CLIENT_SECRET is not set');
    }
  }

  private getRateLimit(limitName: RateLimitInfo['name']) {
    if (this.rateLimits[limitName] && this.rateLimits[limitName].until > new Date()) {
      return this.rateLimits[limitName];
    }
    const period = this.staticLimits[limitName][1];
    return {
      name: limitName,
      period,
      limit: this.staticLimits[limitName][0],
      remaining: this.staticLimits[limitName][0],
      ongoing: 0,
      until: new Date((Math.floor(Date.now() / (period * 1000)) + 1) * (period * 1000)),
    };
  }

  private setRateLimit(limit: RateLimitInfo) {
    const limitName = limit.name;
    // Update period if is different from documentation
    if (
      limit.period !== this.staticLimits[limitName][1] ||
      limit.limit !== this.staticLimits[limitName][0]
    ) {
      this.staticLimits[limitName] = [limit.limit, limit.period];
    }

    const lastRemaining = this.getRateLimit(limitName).remaining;
    this.rateLimits[limit.name] = {
      ...limit,
      remaining: Math.min(limit.remaining, lastRemaining),
      until: new Date(limit.until),
    };
  }

  private increaseOngoing(limitName: RateLimitInfo['name'], count: number) {
    const limit = this.getRateLimit(limitName);
    this.rateLimits[limit.name] = {
      ...limit,
      ongoing: limit.ongoing + count,
    };
  }

  private calculateDelay(limitName: RateLimitInfo['name']) {
    const limit = this.getRateLimit(limitName);
    const now = Date.now();

    if (limit.remaining <= 0) {
      return limit.until.getTime() - now + 100;
    }

    this.increaseOngoing(limitName, 1);
    return 0;
  }

  private async request<T>(
    url: string,
    init: RequestInit,
    limitName: RateLimitInfo['name']
  ): Promise<TraktPagination<T>> {
    const delay = this.calculateDelay(limitName);

    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    const response = await fetch(url, {
      ...init,
      headers: {
        'trakt-api-version': '2',
        'trakt-api-key': this.clientId,
        'Content-Type': 'application/json',
      },
    });

    if (response.headers.has('x-ratelimit')) {
      const rateLimitInfo = JSON.parse(response.headers.get('x-ratelimit')!);
      this.setRateLimit(rateLimitInfo);
    }
    this.increaseOngoing(limitName, -1);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = (await response.json()) as Promise<T[]>;
    const page = Number(response.headers.get('x-pagination-page'));
    const limit = Number(response.headers.get('x-pagination-limit'));
    const total = Number(response.headers.get('x-pagination-item-count'));

    return {
      page,
      limit,
      total,
      items: await data,
      has_next_page: total > page * limit,
    };
  }

  public async test() {
    await this.request<TraktList>(
      `${this.apiUrl}/lists/trending?limit=10`,
      {},
      'UNAUTHED_API_GET_LIMIT'
    );
    return true;
  }

  @tracedApi('TraktApi')
  public async getTrendingLists() {
    const url = `${this.apiUrl}/lists/trending?limit=50`;
    const response = await this.request<TraktList>(url, {}, 'UNAUTHED_API_GET_LIMIT');
    return response.items.map(item => item.list);
  }

  @tracedApi('TraktApi')
  public async getPopularLists() {
    const url = `${this.apiUrl}/lists/popular`;
    const response = await this.request<TraktList>(url, {}, 'UNAUTHED_API_GET_LIMIT');
    return response.items.map(item => item.list);
  }

  @tracedApi('TraktApi')
  public async getList(listId: string) {
    const url = `${this.apiUrl}/lists/${listId}/items`;
    const response = await this.request<TraktListItem>(url, {}, 'UNAUTHED_API_GET_LIMIT');
    return response;
  }

  @tracedApi('TraktApi')
  public async getDeviceCode() {
    const response = await fetch(`${this.apiUrl}/oauth/device/code`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: this.clientId,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = (await response.json()) as DeviceCodeResponse;
    return {
      codeUrl: `${data.verification_url}/${data.user_code}`,
      deviceCode: data.device_code,
      expiresIn: data.expires_in,
      interval: data.interval,
      userCode: data.user_code,
      expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    };
  }

  @tracedApi('TraktApi')
  public async checkDeviceCode(deviceCode: string): Promise<DeviceTokenResponse> {
    const response = await fetch(`${this.apiUrl}/oauth/device/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        code: deviceCode,
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }),
    });

    if (!response.ok) {
      if (response.status === 400) {
        const error = await response.text();
        throw new Error(error);
      }
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return (await response.json()) as DeviceTokenResponse;
  }

  @tracedApi('TraktApi')
  public async getProfile(accessToken: string, slug = 'me'): Promise<UserProfileResponse> {
    const response = await fetch(`${this.apiUrl}/users/${slug}`, {
      headers: {
        'trakt-api-version': '2',
        'trakt-api-key': this.clientId,
        Authorization: `bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return (await response.json()) as UserProfileResponse;
  }

  @tracedApi('TraktApi')
  public async refreshToken(refreshTokenValue: string): Promise<DeviceTokenResponse> {
    const response = await fetch(`${this.apiUrl}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        refresh_token: refreshTokenValue,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return (await response.json()) as DeviceTokenResponse;
  }
}
