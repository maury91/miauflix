import type { Cache } from 'cache-manager';

import type { AbstractContentDirectory } from '@content-directories/content-directory.abstract';
import { TherarbgContentDirectory } from '@content-directories/therarbg';
import { YTSContentDirectory } from '@content-directories/yts';
import type { DownloadService } from '@services/download/download.service';

/**
 * Service for searching torrents from various tracker sources
 */
export class ContentDirectoryService {
  private readonly movieTrackers: AbstractContentDirectory[];

  constructor(cache: Cache, downloadService: DownloadService) {
    this.movieTrackers = [
      new YTSContentDirectory(cache),
      new TherarbgContentDirectory(cache, downloadService),
    ];
  }

  /**
   * Get the status of the tracker services
   * @returns Status of the tracker services
   */
  public status() {
    return this.movieTrackers.map(tracker => tracker.status());
  }

  /**
   * Search torrents for a movie by its IMDb ID
   *
   * @param imdbId - The IMDb ID of the movie (format: ttXXXXXXX)
   * @param highPriority - Whether to use high priority rate limit (default: false)
   * @returns A movie object with normalized torrents or null if not found
   */
  public async searchTorrentsForMovie(imdbId: string, highPriority = false) {
    for (const tracker of this.movieTrackers) {
      try {
        // Currently only using YTS, but this can be extended to use multiple trackers
        const { sources, trailerCode } = await tracker.getMovie(imdbId, highPriority);
        if (sources.length > 0) {
          return { sources, trailerCode };
        }
      } catch (error) {
        console.error(`Error searching torrents for movie ${imdbId}:`, error);
        return null;
      }
    }
  }
}
