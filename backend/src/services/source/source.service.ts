import { logger } from '@logger';

import { ENV } from '@constants';
import type { Database } from '@database/database';
import type { Movie } from '@entities/movie.entity';
import type { MovieSource } from '@entities/movie-source.entity';
import { MovieRepository } from '@repositories/movie.repository';
import {
  MovieSourceRepository,
  SourceProcessingResult,
} from '@repositories/movie-source.repository';
import type { VpnDetectionService } from '@services/security/vpn.service';
import type { ContentDirectoryService } from '@services/source-metadata/content-directory.service';
import { adaptiveLog } from '@utils/adaptive-logging.util';
import { enhancedFetch } from '@utils/fetch.util';
import { RateLimiter } from '@utils/rateLimiter';
import { scheduleNextCheck } from '@utils/scheduling.util';
import { SingleFlight } from '@utils/singleflight.util';
import { sleep } from '@utils/time';
import { providerSourcesToEntities } from '@utils/transformers.util';
import { validateContentFileResponse } from '@utils/validation.util';

import type { SourceMetadataFileService } from './source-metadata-file.service';

/**
 * Service for searching and managing sources
 */
export class SourceService {
  private readonly movieRepository: MovieRepository;
  private readonly movieSourceRepository: MovieSourceRepository;
  private readonly sourceRateLimiters = new Map<string, RateLimiter>();

  private vpnConnected = false;
  private readonly searchOnlyBehindVpn = !ENV('DISABLE_VPN_CHECK');
  private readonly startPromise: Promise<void>;

  constructor(
    db: Database,
    vpnService: VpnDetectionService,
    private readonly contentDirectoryService: ContentDirectoryService,
    private readonly magnetService: SourceMetadataFileService
  ) {
    this.movieRepository = db.getMovieRepository();
    this.movieSourceRepository = db.getMovieSourceRepository();
    if (this.searchOnlyBehindVpn) {
      this.startPromise = vpnService.isVpnActive().then(connected => {
        this.vpnConnected = connected;
      });
      vpnService.on('connect', () => {
        this.vpnConnected = true;
      });
      vpnService.on('disconnect', () => {
        this.vpnConnected = false;
      });
    } else {
      this.vpnConnected = true; // If not searching only behind VPN, assume connected
    }
  }

  private async checkForVpnConnection(action: string): Promise<boolean> {
    if (this.searchOnlyBehindVpn) {
      await this.startPromise;
      if (!this.vpnConnected) {
        logger.warn('SourceService', `VPN is not connected, skipping ${action}`);
        await sleep(2000);
        return false;
      }
      return this.vpnConnected;
    }
    return true;
  }

  /**
   * Process movies that need source search
   * This method is designed to be run by the scheduler
   */
  public async searchSourcesForMovies(): Promise<void> {
    if (!(await this.checkForVpnConnection('searchSourcesForMovies'))) {
      return;
    }

    // Find movies that haven't been searched at all
    const moviesToSearch = await this.movieRepository.findMoviesPendingSourceSearch(1);

    if (moviesToSearch.length === 0) {
      await sleep(500);
      return;
    }

    for (const movie of moviesToSearch) {
      await this.searchSourcesForMovie(movie, false);
    }
  }

  /**
   * Search for sources for a specific movie
   */
  @SingleFlight(movie => movie.id + ':' + movie.contentDirectoriesSearched?.join(','))
  private async searchSourcesForMovie(
    movie: {
      id: number;
      imdbId: string | null;
      title: string;
      contentDirectoriesSearched?: string[];
    },
    isOnDemand: boolean = false
  ): Promise<{ directory: string; sources: MovieSource[] } | void> {
    if (!(await this.checkForVpnConnection('searchSourcesForMovie'))) {
      return;
    }

    if (!movie.imdbId) {
      logger.warn(
        'SourceService',
        `Movie ${movie.id} (${movie.title}) has no IMDb ID, skipping source search`
      );
      return;
    }

    logger.debug(
      'SourceService',
      `Searching sources for movie ${movie.id} (${movie.title}) with IMDb ID ${movie.imdbId}`
    );

    try {
      // Search for sources using the content directory service
      const movieWithSources = await this.contentDirectoryService.searchSourcesForMovie(
        movie.imdbId,
        isOnDemand,
        movie.contentDirectoriesSearched || []
      );

      if (!movieWithSources || !movieWithSources.sources?.length) {
        logger.debug('SourceService', `No sources found for movie ${movie.id} (${movie.title})`);
        await this.movieRepository.markSourceSearchAttempt(movie.id);
        return;
      }

      logger.debug(
        'SourceService',
        `Found ${movieWithSources.sources.length} sources for movie ${movie.id} (${movie.title}) using ${movieWithSources.source}`
      );

      if (movieWithSources.trailerCode) {
        // If the movie has a trailer, update the movie record
        await this.movieRepository.updateMovieTrailerIfDoesntExists(
          movie.id,
          movieWithSources.trailerCode
        );
      }

      // Convert sources to MovieSource objects and save them
      const sources = providerSourcesToEntities(
        movieWithSources.sources,
        movie.id,
        movieWithSources.source
      );

      const createdSources = await this.movieSourceRepository.createMany(sources);
      logger.debug(
        'SourceService',
        `Saved ${sources.length} sources for movie ${movie.id} (${movie.title})`
      );
      await this.movieRepository.markSourceSearched(movie.id, movieWithSources.source);
      return { directory: movieWithSources.source, sources: createdSources };
    } catch (error) {
      logger.error(
        'SourceService',
        `Error searching sources for movie ${movie.id} (${movie.title}):`,
        error
      );
    }
  }

  /**
   * Find all sources for a specific movie
   */
  public async getSourcesForMovie(movieId: number): Promise<MovieSource[]> {
    return this.movieSourceRepository.findByMovieId(movieId);
  }

  /**
   * Search for sources for a specific movie with timeout (for on-demand requests)
   * If the movie has no sources and hasn't been searched yet, search immediately
   * Returns sources within timeout, but continues search in background if needed
   */
  public async getSourcesForMovieWithOnDemandSearch(
    movie: {
      id: number;
      imdbId: string | null;
      title: string;
      contentDirectoriesSearched: string[];
    },
    timeoutMs: number = 1200
  ): Promise<MovieSource[]> {
    // First check if we already have sources
    const existingSources = await this.getSourcesForMovie(movie.id);
    if (existingSources.length > 0) {
      return existingSources;
    }

    // ImdbId is required for searching sources
    if (movie.imdbId) {
      logger.info(
        'SourceService',
        `On-demand source search triggered for movie ${movie.id} (${movie.title})`
      );

      let status: 'pending' | 'success' | 'timeout' = 'pending';
      const searchPromise = (async () => {
        const sources = await this.searchSourcesForMovie(movie, true);
        if (sources) {
          if (status === 'pending') {
            status = 'success';
          } else {
            logger.debug(
              'SourceService',
              `Background search completed for movie ${movie.id} (${movie.title})`
            );
          }
          return sources.sources;
        }
        return [];
      })();
      const timeoutPromise = (async () => {
        await sleep(timeoutMs);
        if (status === 'pending') {
          status = 'timeout';
          logger.debug(
            'SourceService',
            `On-demand search timed out for movie ${movie.id}, continuing in background`
          );
        }
      })();
      try {
        // Wait for search with timeout
        return (await Promise.race([searchPromise, timeoutPromise])) || [];
      } catch (error) {
        logger.error('SourceService', `On-demand search failed for movie ${movie.id}:`, error);
      }
    }

    // Movie has been searched but no sources found, or no IMDb ID
    return [];
  }

  /**
   * Find all sources with source metadata files for a specific movie
   */
  public async getSourcesWithFilesForMovie(movieId: number): Promise<MovieSource[]> {
    const sources = await this.movieSourceRepository.findByMovieId(movieId);
    return sources.filter(source => source.file !== null);
  }

  public async syncStatsForSources(): Promise<void> {
    await this.startPromise;

    if (!this.vpnConnected) {
      logger.warn('SourceService', `VPN is not connected, skipping stats sync`);
      await sleep(5000);
      return;
    }

    const sourcesToUpdate = await this.movieSourceRepository.findSourceThatNeedsStatsUpdate(5);
    if (sourcesToUpdate.length === 0) {
      return;
    }
    logger.debug('SourceService', `Updating stats for ${sourcesToUpdate.length} sources`);
    await Promise.all(
      sourcesToUpdate.map(async source => {
        try {
          const { broadcasters, watchers } = await this.magnetService.getStats(source.hash);
          const nextCheckTime = scheduleNextCheck(
            source.lastStatsCheck && source.nextStatsCheckAt
              ? source.nextStatsCheckAt.getTime() - source.lastStatsCheck.getTime()
              : undefined,
            { old: source.broadcasters ?? 0, new: broadcasters },
            { old: source.watchers ?? 0, new: watchers }
          );

          await this.movieSourceRepository.updateStats(
            source.id,
            broadcasters,
            watchers,
            nextCheckTime
          );
          logger.debug(
            'SourceService',
            `Updated stats for source ${source.id} (quality: ${source.quality})`
          );
        } catch (error) {
          logger.error(
            'SourceService',
            `Error updating stats for source ${source.id} (quality: ${source.quality}):`,
            error
          );
        }
      })
    );
  }

  /**
   * Find and download data files for sources that don't have them yet
   * This method prioritizes by movie popularity and ensures fair distribution
   */
  public async syncMissingSourceFiles(): Promise<void> {
    await this.startPromise;

    if (!this.vpnConnected && this.searchOnlyBehindVpn) {
      logger.warn('SourceService', 'VPN is not connected, skipping data file search');
      await sleep(2000);
      return;
    }

    // 1. Find movies without sources ordered by popularity
    // 2. Count how many sources each movie has
    // 3. Prioritize by movie popularity and ensure fair distribution
    // 4. Get a group of 50 sources that need data files

    const batchSize = Math.max(2, this.magnetService.getAvailableConcurrency());
    const sourcesToProcess = await this.movieSourceRepository.getNextSourcesToProcess(batchSize);

    // Early exit if no movies need processing - avoid log spam with exponential backoff
    if (sourcesToProcess.length === 0) {
      adaptiveLog('SourceService', 'No sources requiring source files found');
      return;
    }

    logger.debug('SourceService', 'Searching source files for sources without them');

    const processSource = async (source: SourceProcessingResult) => {
      logger.debug(
        'SourceService',
        `Processing source ${source.id} with quality ${source.quality}`
      );
      await this.downloadSourceFileForSource(source);
      const potentialNextSource = sourcesToProcess[0];
      if (
        potentialNextSource &&
        ((potentialNextSource.url && this.canMakeSourceRequest(potentialNextSource.source)) ||
          this.magnetService.isIdle())
      ) {
        // If the magnet service is idle, we can process the next batch
        const nextSource = sourcesToProcess.shift();
        if (nextSource) {
          processSource(nextSource);
        }
      }
    };

    await Promise.all(sourcesToProcess.splice(0, batchSize).map(processSource));
  }

  /**
   * Search and save source file for a specific source
   */
  private async downloadSourceFileForSource(source: SourceProcessingResult): Promise<void> {
    logger.debug(
      'SourceService',
      `Searching file for source ${source.id} (quality: ${source.quality})`
    );

    try {
      let file: Buffer | null = null;

      if (source.url && this.canMakeSourceRequest(source.source)) {
        file = await this.downloadSourceMetadataFileFromUrl(source.url, source.source);

        if (file) {
          logger.debug(
            'SourceService',
            `Successfully downloaded source file via direct URL for source ${source.id}`
          );
        } else {
          logger.debug(
            'SourceService',
            `Direct URL download failed for source ${source.id}, falling back to magnet service`
          );
        }
      } else if (source.url) {
        logger.debug(
          'SourceService',
          `Rate limit reached for ${source.source}, using magnet service for source ${source.id}`
        );
      }

      // Fall back to magnet service if direct download failed or wasn't available
      if (!file) {
        file = await this.magnetService.getSourceMetadataFile(source.magnetLink, source.hash);
      }

      if (!file) {
        logger.warn(
          'SourceService',
          `No file found for source ${source.id} (quality: ${source.quality})`
        );
        return;
      }

      // Save the source file to the database
      await this.movieSourceRepository.updateSourceFile(source.id, file);

      logger.debug(
        'SourceService',
        `Successfully saved file for source ${source.id} (quality: ${source.quality}, size: ${file.length} bytes)`
      );
    } catch (error) {
      logger.error(
        'SourceService',
        `Error searching file for source ${source.id} (quality: ${source.quality}):`,
        error
      );
    }
  }

  /**
   * Get or create a rate limiter for a specific source
   */
  private getSourceRateLimiter(source: string): RateLimiter {
    if (!this.sourceRateLimiters.has(source)) {
      // Set rate limits per source (requests per second)
      const rateLimit = source === 'YTS' ? 0.5 : 0.2; // YTS: 30 req/min, others: 12 req/min
      this.sourceRateLimiters.set(source, new RateLimiter(rateLimit, `SourceService:${source}`));
    }
    return this.sourceRateLimiters.get(source)!;
  }

  /**
   * Check if we can make a request to a source without rate limiting
   */
  private canMakeSourceRequest(source: string): boolean {
    const rateLimiter = this.getSourceRateLimiter(source);
    return !rateLimiter.shouldReject();
  }

  /**
   * Download source file from direct URL
   */
  private async downloadSourceMetadataFileFromUrl(
    url: string,
    source: string
  ): Promise<Buffer | null> {
    try {
      logger.debug('SourceService', `Downloading from URL (source: ${source})`);

      // Throttle the request
      const rateLimiter = this.getSourceRateLimiter(source);
      await rateLimiter.throttle();

      const response = await enhancedFetch(url);

      const validation = validateContentFileResponse(response);
      if (!validation.isValid) {
        logger.warn('SourceService', `Download validation failed: ${validation.error}`);
        return null;
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      logger.error('SourceService', `Error downloading from URL: ${url}`, error);
      return null;
    }
  }

  /**
   * Resync source metadata for movies that have sources with unknown or missing data
   * This method is designed to be run by the scheduler
   */
  public async resyncMovieSources(): Promise<void> {
    await this.startPromise;

    if (!this.vpnConnected) {
      logger.warn('SourceService', 'VPN is not connected, skipping source resync');
      await sleep(2000);
      return;
    }

    try {
      // Find the next movie that needs processing
      const movies = await this.findMoviesWithUnknownSourceType(1);

      if (movies.length === 0) {
        // No more movies to process, wait before checking again
        await sleep(5000);
        return;
      }

      const movie = movies[0];
      await this.updateMovieSourcesFromYTS(movie);
    } catch (error) {
      logger.error('SourceService', 'Error in resyncMovieSources:', error);
    }
  }

  /**
   * Find movies that have sources with unknown sourceType or missing sourceUploadedAt
   */
  private async findMoviesWithUnknownSourceType(limit: number = 1): Promise<Movie[]> {
    // Get movie IDs that have sources with unknown sourceType or missing upload date
    const movieIds = await this.movieSourceRepository.findMovieIdsWithUnknownSourceType();

    if (movieIds.length === 0) {
      return [];
    }

    // Get the actual movies with imdbId, ordered by popularity
    return this.movieRepository.findMoviesByIdsWithImdb(movieIds, limit);
  }

  /**
   * Update sources for a movie with fresh data from YTS and update trailer if missing
   */
  private async updateMovieSourcesFromYTS(movie: Movie): Promise<void> {
    if (!movie.imdbId) {
      logger.warn(
        'SourceService',
        `Movie ${movie.id} (${movie.title}) has no IMDb ID, skipping resync`
      );
      return;
    }

    logger.info(
      'SourceService',
      `Resyncing sources for movie ${movie.id} (${movie.title}) with IMDb ID ${movie.imdbId}`
    );

    try {
      // Get fresh data from content directory service
      const movieWithSources = await this.contentDirectoryService.searchSourcesForMovie(
        movie.imdbId
      );

      if (!movieWithSources) {
        logger.warn(
          'SourceService',
          `No movie data found for movie ${movie.id} (${movie.title}) via content directory service`
        );
        return;
      }

      // Update trailer if movie doesn't have one and YTS provides it
      if (!movie.trailer && movieWithSources.trailerCode) {
        await this.movieRepository.updateMovieTrailerIfDoesntExists(
          movie.id,
          movieWithSources.trailerCode
        );
        logger.debug(
          'SourceService',
          `Updated trailer for movie ${movie.id} with code: ${movieWithSources.trailerCode}`
        );
      }

      if (!movieWithSources.sources?.length) {
        logger.warn(
          'SourceService',
          `No sources found for movie ${movie.id} (${movie.title}) on YTS`
        );
        return;
      }

      logger.debug(
        'SourceService',
        `Found ${movieWithSources.sources.length} sources for movie ${movie.id} (${movie.title})`
      );

      // Get existing sources for this movie
      const existingSources = await this.movieSourceRepository.findByMovieId(movie.id);

      // Create a map of existing sources by hash for quick lookup
      const existingSourcesMap = new Map(existingSources.map(source => [source.hash, source]));

      let updatedCount = 0;

      // Update existing sources with fresh data from YTS
      for (const source of movieWithSources.sources) {
        const existingSource = existingSourcesMap.get(source.hash);
        if (!existingSource) {
          logger.debug(
            'SourceService',
            `Source with hash "${source.hash.substring(0, 8)}-redacted" not found in database, skipping`
          );
          continue;
        }

        // Only update if sourceType is unknown or sourceUploadedAt is missing
        const needsUpdate = existingSource.sourceType === null || !existingSource.sourceUploadedAt;

        if (needsUpdate) {
          const updateData: Partial<MovieSource> = {};

          if (existingSource.sourceType === null) {
            updateData.sourceType = source.source;
          }

          if (!existingSource.sourceUploadedAt && source.uploadDate) {
            updateData.sourceUploadedAt = source.uploadDate;
          }

          if (Object.keys(updateData).length > 0) {
            await this.movieSourceRepository.updateSourceMetadata(existingSource.id, updateData);
            updatedCount++;

            logger.debug(
              'SourceService',
              `Updated source ${existingSource.id} - sourceType: ${updateData.sourceType || 'unchanged'}, ` +
                `sourceUploadedAt: ${updateData.sourceUploadedAt ? 'updated' : 'unchanged'}`
            );
          }
        }
      }

      logger.info(
        'SourceService',
        `Updated ${updatedCount} sources for movie ${movie.id} (${movie.title})`
      );
    } catch (error) {
      logger.error(
        'SourceService',
        `Error updating sources for movie ${movie.id} (${movie.title}):`,
        error
      );
    }
  }
}
