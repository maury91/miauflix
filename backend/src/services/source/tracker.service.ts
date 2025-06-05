import type { Cache } from 'cache-manager';

import { YTSApi } from '@trackers/yts/yts.api';

/**
 * Service for searching torrents from various tracker sources
 */
export class TrackerService {
  private readonly ytsApi: YTSApi;

  constructor(cache: Cache) {
    this.ytsApi = new YTSApi(cache);
  }

  /**
   * Get the status of the tracker services
   * @returns Status of the tracker services
   */
  public status() {
    return {
      yts: this.ytsApi.status(),
    };
  }

  /**
   * Search torrents for a movie by its IMDb ID
   *
   * @param imdbId - The IMDb ID of the movie (format: ttXXXXXXX)
   * @param highPriority - Whether to use high priority rate limit (default: false)
   * @returns A movie object with normalized torrents or null if not found
   */
  public async searchTorrentsForMovie(imdbId: string, highPriority = false) {
    try {
      // Currently only using YTS, but this can be extended to use multiple trackers
      const movie = await this.ytsApi.getMovieWithTorrents(imdbId, highPriority);
      return movie;
    } catch (error) {
      console.error(`Error searching torrents for movie ${imdbId}:`, error);
      return null;
    }
  }
}
