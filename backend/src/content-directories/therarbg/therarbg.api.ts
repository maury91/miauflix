import { logger } from '@logger';
import type { Cache } from 'cache-manager';

import { ApiError } from '@errors/api.errors';
import type { ConfigService, ServiceInstanceStatus } from '@mytypes/configuration';
import type { RequestService } from '@services/request/request.service';
import type { StatsService } from '@services/stats/stats.service';
import { Api } from '@utils/api.util';
import { Cacheable } from '@utils/cacheable.util';
import { tracedApi } from '@utils/tracing.util';
import { TrackStatus } from '@utils/trackStatus.util';

import type { GetPostsResponse, ImdbDetailResponse } from './therarbg.types';
import { validateImdbId } from './therarbg.utils';

const defaultMirrors = ['https://therarbg.to', 'https://therar.site'];
const cooldownMs = 15 * 60 * 1000;

const normalizeBaseUrl = (url: string): string => url.replace(/\/+$/, '');

type SearchPostsSortKey = 'added' | 'broadcasters' | 'size' | 'watchers';

interface SearchPostsOptions {
  sort?: {
    key: SearchPostsSortKey;
    direction: 'asc' | 'desc';
  };
  filter?: {
    type: 'days' | 'hours';
    value: number; // N for last N days/hours
  };
}

export class TheRARBGApi extends Api {
  private mirrors: string[];
  private cooldownUntil = 0;
  private isReady = false; // kept for internal use if needed
  private _initStatus: ServiceInstanceStatus = {
    status: 'initializing',
    details: 'Starting up',
    startedAt: Date.now(),
  };

  constructor(
    cache: Cache,
    statsService: StatsService,
    private readonly requestService: RequestService,
    private readonly config: ConfigService
  ) {
    const configuredUrl = normalizeBaseUrl(config.getOrThrow('THE_RARBG_API_URL'));
    super(cache, statsService, configuredUrl, 2, 4);
    this.mirrors = [...new Set([configuredUrl, ...defaultMirrors.map(normalizeBaseUrl)])];
    void this.init();
  }

  getStatus(): ServiceInstanceStatus {
    return this._initStatus;
  }

  private async init(): Promise<void> {
    const startedAt = Date.now();
    this._initStatus = { status: 'initializing', details: 'Testing API connectivity', startedAt };
    this.isReady = await this.test();
    if (this.isReady) {
      this._initStatus = { status: 'ready' };
    } else if (this.cooldownUntil === 0) {
      this._initStatus = {
        status: 'error',
        errorMessage: 'TheRARBG API connectivity test failed',
        error: null,
      };
    }
  }

  public async reload(): Promise<void> {
    const configuredUrl = normalizeBaseUrl(this.config.getOrThrow('THE_RARBG_API_URL'));
    this.apiUrl = configuredUrl;
    this.mirrors = [...new Set([configuredUrl, ...defaultMirrors.map(normalizeBaseUrl)])];
    this.cooldownUntil = 0;
    await this.init();
  }

  private enterCooldown(error: unknown): void {
    this.isReady = false;
    this.cooldownUntil = Date.now() + cooldownMs;
    const activeMirrorIndex = this.mirrors.indexOf(this.apiUrl);
    this.apiUrl = this.mirrors[(activeMirrorIndex + 1) % this.mirrors.length];
    this._initStatus = {
      status: 'degraded',
      reason: `all mirrors unavailable; retrying after ${new Date(this.cooldownUntil).toISOString()}`,
    };
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(
      'TheRARBG',
      `All mirrors unavailable; pausing requests for 15 minutes (${message})`
    );
  }

  private markReady(mirror: string): void {
    const wasUnavailable = this.cooldownUntil > 0;
    this.apiUrl = mirror;
    this.cooldownUntil = 0;
    this.isReady = true;
    this._initStatus = { status: 'ready' };
    if (wasUnavailable) {
      logger.info('TheRARBG', `Provider recovered using ${mirror}`);
    }
  }

  /**
   * Make HTTP request with common configuration and error handling
   */
  @TrackStatus()
  private async request<T>(
    endpoint: string,
    params: Record<string, number | string> = {},
    highPriority = false
  ): Promise<T | null> {
    if (Date.now() < this.cooldownUntil) {
      throw new ApiError('TheRARBG is temporarily unavailable', 'service_unavailable', 'therarbg');
    }

    await this.throttle(highPriority);

    // Always add format=json to get JSON response instead of HTML
    const queryParams = {
      ...params,
      format: 'json',
    };

    const mirror = this.apiUrl;
    const url = `${mirror}/${endpoint}`;
    try {
      const response = await this.requestService.request<T>(url, {
        queryString: queryParams,
        timeout: 15000,
        redirect: 'manual',
      });

      if (response.status === 302) {
        const location = response.headers['location'] || '';
        if (location === '/') {
          // The provider uses its homepage redirect as a normal "not found" response.
          this.markReady(mirror);
          return null;
        }
        logger.error('TheRARBG', `Redirected to ${location}`);
      }

      if (!response.ok) {
        logger.error('TheRARBG', `API error for ${url}:`, response.status, response.statusText);
        throw new ApiError(
          `TheRARBG API error: (${response.status}) ${response.statusText}`,
          'http_error',
          'therarbg',
          response.status
        );
      }

      if (response.headers['content-type']?.includes('text/html')) {
        // This is most likely the 404 page or an error page
        logger.error(
          'TheRARBG',
          `Received HTML response for ${url}. This may indicate an error or a 404 page.`
        );
        throw new ApiError(
          `TheRARBG API returned HTML response for ${url}?${JSON.stringify(queryParams)}`,
          'invalid_response',
          'therarbg'
        );
      }

      if (response.body == null || typeof response.body !== 'object') {
        throw new ApiError(
          `TheRARBG API returned non-JSON response for ${url}`,
          'invalid_response',
          'therarbg'
        );
      }
      this.markReady(mirror);
      return response.body;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      this.enterCooldown(error);
      throw new ApiError(
        'TheRARBG mirror is temporarily unavailable',
        'service_unavailable',
        'therarbg'
      );
    }
  }

  /**
   * Search for movie by IMDB ID
   */
  @Cacheable(36e5 /* 1 hour */)
  @tracedApi('TheRARBGApi', 'therarbg')
  async searchByImdbId(imdbId: string, highPriority = false): Promise<ImdbDetailResponse | null> {
    // Validate IMDB ID
    const validation = validateImdbId(imdbId);
    if (!validation.isValid) {
      throw new ApiError(validation.error!, 'validation_error', 'therarbg');
    }

    const normalizedImdbId = validation.normalizedId!;

    // endpoint format: /imdb-detail/tt{imdbId}/?format=json
    const endpoint = `imdb-detail/${normalizedImdbId}/`;

    try {
      const data = await this.request<ImdbDetailResponse>(endpoint, {}, highPriority);

      if (!data?.imdb || !data.trb_posts) {
        return null;
      }

      // Process and normalize the response
      return data;
    } catch (error) {
      if (error instanceof ApiError && error.code === 'http_error' && error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Get recent posts with caching
   */
  @Cacheable(36e5 /* 1 hour */)
  @tracedApi('TheRARBGApi', 'therarbg')
  async searchPosts(
    keywords: string,
    options: SearchPostsOptions = {},
    page = 1,
    highPriority = false
  ): Promise<GetPostsResponse | null> {
    const urlParts = [`get-posts/keywords:${keywords}:ncategory:XXX`];
    if (options.filter) {
      const { type, value } = options.filter;
      if (type === 'days') {
        urlParts.push(`time:${value}D`);
      } else if (type === 'hours') {
        urlParts.push(`time:${value}H`);
      }
    }
    if (options.sort) {
      const { key, direction } = options.sort;
      const sortKeys: Record<SearchPostsSortKey, string> = {
        added: 'a',
        watchers: 'le',
        broadcasters: 'se',
        size: 's',
      };
      const sortField = sortKeys[key];
      if (sortField) {
        urlParts.push(`order:${direction === 'desc' ? '-' : ''}${sortField}`);
      }
    }
    const data = await this.request<GetPostsResponse>(
      urlParts.join(':'),
      page > 1 ? { page } : {},
      highPriority
    );

    return data;
  }

  /**
   * Self test to check if API is responsive
   */
  @tracedApi('TheRARBGApi', 'therarbg')
  async test(): Promise<boolean> {
    try {
      // Try to get a small amount of recent posts to check if API is responsive
      // Use direct _makeRequest to bypass cache for health checks
      await this.request<GetPostsResponse>(`get-posts/category:Movies:time:1H/`, {});
      return true;
    } catch {
      return false;
    }
  }
}
