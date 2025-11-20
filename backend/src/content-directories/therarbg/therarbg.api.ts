import { logger } from '@logger';
import type { Cache } from 'cache-manager';

import { ENV } from '@constants';
import { Api } from '@utils/api.util';
import { Cacheable } from '@utils/cacheable.util';
import { enhancedFetch } from '@utils/fetch.util';
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

class TheRARBGError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = 'TheRARBGError';
  }
}

export class TheRARBGApi extends Api {
  private currentMirrorIndex = 0;

  constructor(cache: Cache) {
    super(cache, ENV('THE_RARBG_API_URL') || mirrors[0], 2, 4);
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
      const response = await enhancedFetch(url, {
        queryString: queryParams,
        timeout: 15000,
        redirect: 'manual',
      });

      if (!response.ok) {
        logger.error('TheRARBG', `API error for ${url}:`, response.status, response.statusText);
        throw new Error(`TheRARBG API error: (${response.status}) ${response.statusText}`);
      }

      if (response.status === 302) {
        if (response.headers.get('location') === '/') {
          // This is essentially a 404, it means they have nothing about this movie
          throw new TheRARBGError('Redirect to homepage', 404);
        }
        logger.error('TheRARBG', `Redirected to ${response.headers.get('location')}`);
      }

      if (response.headers.get('content-type')?.includes('text/html')) {
        // This is most likely the 404 page or an error page
        logger.error(
          'TheRARBG',
          `Received HTML response for ${url}. This may indicate an error or a 404 page.`
        );
        throw new Error(
          `TheRARBG API returned HTML response for ${url}?${JSON.stringify(queryParams)}`
        );
      }

      const data = (await response.json()) as T;
      return data;
    } catch (error) {
      logger.error('TheRARBG', `Request failed for ${url}:`, error);

      if (error instanceof Error) {
        if (error.name === 'TimeoutError') {
          throw new Error('Request timeout');
        }
        throw error;
      }

      // Try with a different domain mirror if available
      if (this.currentMirrorIndex < mirrors.length - 1) {
        this.currentMirrorIndex++;
        const newMirror = mirrors[this.currentMirrorIndex];
        console.log(`Trying alternative TheRARBG mirror: ${newMirror}`);
        this.apiUrl = newMirror;
        return this.request<T>(endpoint, params);
      }

      throw error;
    }
  }

  /**
   * Search for movie by IMDB ID
   */
  @Cacheable(36e5 /* 1 hour */)
  async searchByImdbId(imdbId: string, highPriority = false): Promise<ImdbDetailResponse | null> {
    // Validate IMDB ID
    const validation = validateImdbId(imdbId);
    if (!validation.isValid) {
      throw new Error(validation.error);
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
      if (error instanceof TheRARBGError && error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Get recent posts with caching
   */
  @Cacheable(36e5 /* 1 hour */)
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
