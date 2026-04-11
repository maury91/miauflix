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

const mirrors = ['https://therarbg.to', 'https://therar.site'];

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
  private currentMirrorIndex = 0;
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
    super(cache, statsService, config.getOrThrow('THE_RARBG_API_URL'), 2, 4);
    void this.init();
  }

  getStatus(): ServiceInstanceStatus {
    return this._initStatus;
  }

  private async init(): Promise<void> {
    const startedAt = Date.now();
    this._initStatus = { status: 'initializing', details: 'Testing API connectivity', startedAt };
    this.isReady = await this.test();
    this._initStatus = this.isReady
      ? { status: 'ready' }
      : { status: 'error', errorMessage: 'TheRARBG API connectivity test failed', error: null };
  }

  public async reload(): Promise<void> {
    this.apiUrl = this.config.getOrThrow('THE_RARBG_API_URL');
    await this.init();
  }

  /**
   * Make HTTP request with common configuration and error handling
   */
  @TrackStatus()
  private async request<T>(
    endpoint: string,
    params: Record<string, number | string> = {},
    highPriority = false
  ): Promise<T> {
    await this.throttle(highPriority);

    const url = `${this.apiUrl}/${endpoint}`;

    // Always add format=json to get JSON response instead of HTML
    const queryParams = {
      ...params,
      format: 'json',
    };

    try {
      const response = await this.requestService.request<T>(url, {
        queryString: queryParams,
        timeout: 15000,
        redirect: 'manual',
      });

      if (response.status === 302) {
        const location = response.headers['location'] || '';
        if (location === '/') {
          // This is essentially a 404, it means they have nothing about this movie
          throw new ApiError('Redirect to homepage', 'http_error', 'therarbg', 404);
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
      return response.body;
    } catch (error) {
      logger.error('TheRARBG', `Request failed for ${url}:`, error);

      // ApiErrors come from valid (but bad) server responses — no point switching mirrors
      if (!(error instanceof ApiError) && this.currentMirrorIndex < mirrors.length - 1) {
        this.currentMirrorIndex++;
        const newMirror = mirrors[this.currentMirrorIndex];
        logger.debug('TheRARBG', `Switching to mirror: ${newMirror}`);
        this.apiUrl = newMirror;
        return this.request<T>(endpoint, params, highPriority);
      }

      if (error instanceof ApiError) {
        throw error;
      }

      if (error instanceof Error && error.name === 'TimeoutError') {
        throw new ApiError('Request timeout', 'timeout', 'therarbg');
      }

      if (error instanceof Error) {
        throw new ApiError(error.message, 'response_error', 'therarbg');
      }

      throw new ApiError('Unknown request failure', 'response_error', 'therarbg');
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

      if (!data.imdb || !data.trb_posts) {
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
