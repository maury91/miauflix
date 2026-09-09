import { logger } from '@logger';
import type { Cache } from 'cache-manager';

import type {
  AbstractContentDirectory,
  SourceMetadata,
} from '@content-directories/content-directory.abstract';
import { TherarbgContentDirectory } from '@content-directories/therarbg';
import { YTSContentDirectory } from '@content-directories/yts';
import { ApiError } from '@errors/api.errors';
import type { ConfigService } from '@mytypes/configuration';
import type { DownloadService } from '@services/download/download.service';
import type { RequestService } from '@services/request/request.service';
import type { StatsService } from '@services/stats/stats.service';
import { traced } from '@utils/tracing.util';

/**
 * Service for searching content from various directory sources
 */
export class ContentDirectoryService {
  private readonly movieDirectories: AbstractContentDirectory[];
  public readonly ytsDirectory: YTSContentDirectory;
  public readonly therarbgDirectory: TherarbgContentDirectory;

  constructor(
    cache: Cache,
    downloadService: DownloadService,
    requestService: RequestService,
    statsService: StatsService,
    config: ConfigService
  ) {
    this.ytsDirectory = new YTSContentDirectory(cache, requestService, statsService, config);
    this.therarbgDirectory = new TherarbgContentDirectory(
      cache,
      downloadService,
      requestService,
      statsService,
      config
    );
    this.movieDirectories = [this.ytsDirectory, this.therarbgDirectory];
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
    contentDirectoriesSearched: string[] = [],
    includeSearchState = false
  ): Promise<{
    searched?: string[];
    source: string;
    sources: SourceMetadata[];
    trailerCode?: string;
  } | null> {
    const searched: string[] = [];
    for (const contentDirectory of this.movieDirectories) {
      if (contentDirectoriesSearched.includes(contentDirectory.name)) {
        continue;
      }
      searched.push(contentDirectory.name);
      try {
        const { sources, trailerCode } = await contentDirectory.getMovie(imdbId, highPriority);
        if (sources.length > 0) {
          return {
            sources,
            trailerCode,
            source: contentDirectory.name,
            ...(includeSearchState ? { searched } : {}),
          };
        }
      } catch (error) {
        if (error instanceof ApiError && error.code === 'service_unavailable') {
          logger.debug(
            'ContentDirectoryService',
            `${contentDirectory.name} is temporarily unavailable; continuing with other providers`
          );
        } else {
          logger.warn(
            'ContentDirectoryService',
            `Error searching ${contentDirectory.name} for movie ${imdbId}:`,
            error
          );
        }
      }
    }
    return includeSearchState ? { sources: [], source: '', searched } : null;
  }

  public getMovieDirectoryNames(): string[] {
    return this.movieDirectories.map(directory => directory.name);
  }
}
