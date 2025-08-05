import type { Cache } from 'cache-manager';

import type { AbstractContentDirectory } from '@content-directories/content-directory.abstract';
import { TherarbgContentDirectory } from '@content-directories/therarbg';
import { YTSContentDirectory } from '@content-directories/yts';
import type { DownloadService } from '@services/download/download.service';
import { traced } from '@utils/tracing.util';

/**
 * Service for searching content from various directory sources
 */
export class ContentDirectoryService {
  private readonly movieDirectories: AbstractContentDirectory[];

  constructor(cache: Cache, downloadService: DownloadService) {
    this.movieDirectories = [
      new YTSContentDirectory(cache),
      new TherarbgContentDirectory(cache, downloadService),
    ];
  }

  /**
   * Get the status of the content directory services
   * @returns Status of the content directory services
   */
  @traced('ContentDirectoryService')
  public async status() {
    return this.movieDirectories.map(contentDirectory => contentDirectory.status());
  }

  /**
   * Search content sources for a movie by its IMDb ID
   *
   * @param imdbId - The IMDb ID of the movie (format: ttXXXXXXX)
   * @param highPriority - Whether to use high priority rate limit (default: false)
   * @param contentDirectoriesSearched - The content directories that have already been searched (default: [])
   * @returns A movie object with normalized sources or null if not found
   */
  @traced('ContentDirectoryService')
  public async searchSourcesForMovie(
    imdbId: string,
    highPriority = false,
    contentDirectoriesSearched: string[] = []
  ) {
    for (const contentDirectory of this.movieDirectories) {
      if (contentDirectoriesSearched.includes(contentDirectory.name)) {
        continue;
      }
      try {
        const { sources, trailerCode } = await contentDirectory.getMovie(imdbId, highPriority);
        if (sources.length > 0) {
          return { sources, trailerCode, source: contentDirectory.name };
        }
      } catch (error) {
        console.error(`Error searching sources for movie ${imdbId}:`, error);
        return null;
      }
    }
  }
}
