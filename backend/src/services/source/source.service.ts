import { logger } from '@logger';
import { Quality } from '@miauflix/source-metadata-extractor';

import { ENV } from '@constants';
import type { Database } from '@database/database';
import type { Movie } from '@entities/movie.entity';
import type { MovieSource } from '@entities/movie-source.entity';
import type { VpnDetectionService } from '@services/security/vpn.service';
import type { ContentDirectoryService } from '@services/source-metadata/content-directory.service';
import { enhancedFetch } from '@utils/fetch.util';
import { RateLimiter } from '@utils/rateLimiter';
import { SingleFlight } from '@utils/singleflight.util';
import { sleep } from '@utils/time';

import type { MagnetService } from './magnet.service';

/**
 * Service for searching and managing sources
 */
export class SourceService {
  private readonly movieRepository;
  private readonly movieSourceRepository;
  private readonly sourceRateLimiters = new Map<string, RateLimiter>();

  private vpnConnected = false;
  private readonly searchOnlyBehindVpn = !ENV.boolean('DISABLE_VPN_CHECK');
  private readonly startPromise: Promise<void>;
  private lastNoSourcesLogTime = 0;
  private noSourcesLogInterval = 30000; // Start with 30 seconds, will increase exponentially

  constructor(
    db: Database,
    vpnService: VpnDetectionService,
    private readonly trackerService: ContentDirectoryService,
    private readonly magnetService: MagnetService
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

  /**
   * Process movies that need source search
   * This method is designed to be run by the scheduler
   */
  public async searchSourcesForMovies(): Promise<void> {
    await this.startPromise;

    if (!this.vpnConnected) {
      logger.warn('SourceService', 'VPN is not connected, skipping source search');
      await sleep(2000);
      return;
    }

    // Find movies that haven't been searched for sources
    // We go one movie at time because the scheduler will call this method periodically
    const moviesToSearch = await this.movieRepository.findMoviesWithoutSources(1);

    if (moviesToSearch.length === 0) {
      await sleep(500);
      return;
    }

    for (const movie of moviesToSearch) {
      await this.searchSourcesForMovie(movie);

      // Mark as searched even if no sources were found
      await this.movieRepository.markSourceSearched(movie.id);
    }
  }

  /**
   * Search for sources for a specific movie
   */
  @SingleFlight(movie => movie.id)
  private async searchSourcesForMovie(
    movie: {
      id: number;
      imdbId: string | null;
      title: string;
    },
    isOnDemand: boolean = false
  ): Promise<MovieSource[] | void> {
    await this.startPromise;

    if (!this.vpnConnected) {
      logger.warn(
        'SourceService',
        `VPN is not connected, skipping source search for movie ${movie.id} (${movie.title})`
      );
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
      // Search for sources using the tracker service
      const movieWithTorrents = await this.trackerService.searchTorrentsForMovie(
        movie.imdbId,
        isOnDemand
      );

      if (!movieWithTorrents || !movieWithTorrents.sources?.length) {
        logger.debug('SourceService', `No sources found for movie ${movie.id} (${movie.title})`);
        return;
      }

      logger.debug(
        'SourceService',
        `Found ${movieWithTorrents.sources.length} sources for movie ${movie.id} (${movie.title})`
      );

      if (movieWithTorrents.trailerCode) {
        // If the movie has a trailer, update the movie record
        await this.movieRepository.updateMovieTrailerIfDoesntExists(
          movie.id,
          movieWithTorrents.trailerCode
        );
      }

      // Convert sources to MovieSource objects and save them
      const sources = movieWithTorrents.sources.map(
        (torrent): Omit<MovieSource, 'createdAt' | 'id' | 'movie' | 'updatedAt'> => ({
          movieId: movie.id,
          hash: torrent.magnetLink.split('btih:')[1].split('&')[0], // Extract identifier from URI link
          magnetLink: torrent.magnetLink,
          quality: torrent.quality,
          resolution: torrent.resolution.height,
          size: torrent.size,
          videoCodec: torrent.videoCodec?.toString() ?? null,
          broadcasters: torrent.broadcasters,
          watchers: torrent.watchers,
          sourceUploadedAt: torrent.uploadDate,
          url: torrent.url,
          source: 'YTS', // Currently only using YTS as a source
          sourceType: torrent.type,
          nextStatsCheckAt: new Date(),
        })
      );

      const createdSources = await this.movieSourceRepository.createMany(sources);
      logger.debug(
        'SourceService',
        `Saved ${sources.length} sources for movie ${movie.id} (${movie.title})`
      );
      return createdSources;
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
    movie: { id: number; imdbId: string | null; title: string; sourceSearched: boolean },
    timeoutMs: number = 1200
  ): Promise<MovieSource[]> {
    // First check if we already have sources
    const existingSources = await this.movieSourceRepository.findByMovieId(movie.id);
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
        // On purpose without await so it returns faster
        this.movieRepository.markSourceSearched(movie.id);
        if (status === 'pending') {
          status = 'success';
        } else {
          logger.debug(
            'SourceService',
            `Background search completed for movie ${movie.id} (${movie.title})`
          );
        }
        return sources;
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
   * Find all sources with data files for a specific movie
   */
  public async getSourcesWithTorrentsForMovie(movieId: number): Promise<MovieSource[]> {
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
          if (!source.file) {
            return;
          }
          const { seeders, leechers } = await this.magnetService.getStats(source.hash);
          const nextCheckTime = this.calculateNextStatsCheckTime(source, seeders, leechers);

          await this.movieSourceRepository.updateStats(source.id, seeders, leechers, nextCheckTime);
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
  public async searchTorrentFilesForSources(): Promise<void> {
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
      const now = Date.now();
      const timeSinceLastLog = now - this.lastNoSourcesLogTime;

      // Use exponential backoff for logging when consistently no sources found
      if (timeSinceLastLog > this.noSourcesLogInterval) {
        logger.debug('SourceService', 'No sources requiring data files found');
        this.lastNoSourcesLogTime = now;

        // Increase the log interval exponentially (double it, but cap at 10 minutes)
        this.noSourcesLogInterval = Math.min(this.noSourcesLogInterval * 2, 600000); // Max 10 minutes
      }
      return;
    }

    // Reset log interval when sources are found again
    this.noSourcesLogInterval = 30000; // Reset to 30 seconds

    logger.debug('SourceService', 'Searching data files for sources without them');

    const processSource = async (source: (typeof sourcesToProcess)[number]) => {
      logger.debug(
        'SourceService',
        `Processing source ${source.id} with quality ${source.quality}`
      );
      await this.searchTorrentFileForSource(source);
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
   * Search and save torrent file for a specific source
   */
  private async searchTorrentFileForSource(source: {
    id: number;
    hash: string;
    magnetLink: string;
    quality: Quality | null;
    movieId: number;
    url?: string;
    source: string;
  }): Promise<void> {
    logger.debug(
      'SourceService',
      `Searching file for source ${source.id} (quality: ${source.quality})`
    );

    try {
      let torrentFile: Buffer | null = null;

      if (source.url && this.canMakeSourceRequest(source.source)) {
        torrentFile = await this.downloadTorrentFromUrl(source.url, source.source);

        if (torrentFile) {
          logger.debug(
            'SourceService',
            `Successfully downloaded torrent via direct URL for source ${source.id}`
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
      if (!torrentFile) {
        torrentFile = await this.magnetService.getTorrent(source.magnetLink, source.hash);
      }

      if (!torrentFile) {
        logger.warn(
          'SourceService',
          `No file found for source ${source.id} (quality: ${source.quality})`
        );
        return;
      }

      // Save the torrent file to the database
      await this.movieSourceRepository.updateTorrentFile(source.id, torrentFile);

      logger.debug(
        'SourceService',
        `Successfully saved file for source ${source.id} (quality: ${source.quality}, size: ${torrentFile.length} bytes)`
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
   * Download torrent file from direct URL
   */
  private async downloadTorrentFromUrl(url: string, source: string): Promise<Buffer | null> {
    try {
      logger.debug('SourceService', `Downloading from URL (source: ${source})`);

      // Throttle the request
      const rateLimiter = this.getSourceRateLimiter(source);
      await rateLimiter.throttle();

      const response = await enhancedFetch(url);

      if (!response.ok) {
        logger.warn(
          'SourceService',
          `Failed to download from URL: ${response.status} ${response.statusText}`
        );
        return null;
      }

      const contentType = response.headers.get('content-type');
      if (!contentType?.includes('application/')) {
        logger.warn('SourceService', `Invalid content type for file: ${contentType}`);
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
   * Calculate the next stats check time using exponential backoff based on changes
   */
  private calculateNextStatsCheckTime(
    source: {
      broadcasters?: number;
      watchers?: number;
      lastStatsCheck?: Date;
      nextStatsCheckAt: Date;
    },
    newSeeders: number,
    newLeechers: number
  ): Date {
    const currentSeeders = source.broadcasters ?? 0;
    const currentLeechers = source.watchers ?? 0;

    // Calculate percentage change for both seeders and leechers
    const seedersChange =
      currentSeeders === 0
        ? newSeeders > 0
          ? 100
          : 0
        : Math.abs((newSeeders - currentSeeders) / currentSeeders) * 100;

    const leechersChange =
      currentLeechers === 0
        ? newLeechers > 0
          ? 100
          : 0
        : Math.abs((newLeechers - currentLeechers) / currentLeechers) * 100;

    // Use the maximum change between seeders and leechers
    const maxChange = Math.max(seedersChange, leechersChange);

    // Base intervals in hours
    const MIN_INTERVAL = 6; // 6 hours
    const MAX_INTERVAL = 72; // 3 days

    // Calculate the current interval from the last check time to remember the backoff state
    let currentInterval = MIN_INTERVAL;
    if (source.lastStatsCheck && source.nextStatsCheckAt) {
      const intervalMs = source.nextStatsCheckAt.getTime() - source.lastStatsCheck.getTime();
      currentInterval = intervalMs / (1000 * 60 * 60); // Convert milliseconds to hours (preserving fractions)
      currentInterval = Math.max(MIN_INTERVAL, Math.min(currentInterval, MAX_INTERVAL));
    }

    let nextInterval: number;

    if (maxChange < 5) {
      // Very small change - increase backoff (double it, but cap at max)
      nextInterval = Math.min(currentInterval * 2, MAX_INTERVAL);
    } else if (maxChange < 10) {
      // Small change - keep constant
      nextInterval = currentInterval;
    } else if (maxChange > 50) {
      // Huge change - reset to minimum
      nextInterval = MIN_INTERVAL;
    } else if (maxChange > 20) {
      // Considerable change - reduce backoff
      nextInterval = Math.max(currentInterval / 2, MIN_INTERVAL);
    } else {
      // 10-20% change - slight reduction
      nextInterval = Math.max(currentInterval * 0.75, MIN_INTERVAL);
    }

    // Add randomness (±20% of the interval)
    const randomFactor = 0.8 + Math.random() * 0.4; // 0.8 to 1.2
    nextInterval *= randomFactor;

    // Ensure bounds
    nextInterval = Math.max(MIN_INTERVAL, Math.min(nextInterval, MAX_INTERVAL));

    // Calculate next check time (convert hours to milliseconds for precision)
    const nextCheckTime = new Date();
    const intervalMs = nextInterval * 60 * 60 * 1000; // Convert hours to milliseconds
    nextCheckTime.setTime(nextCheckTime.getTime() + intervalMs);

    return nextCheckTime;
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
      // Get fresh data from tracker service
      const movieWithTorrents = await this.trackerService.searchTorrentsForMovie(movie.imdbId);

      if (!movieWithTorrents) {
        logger.warn(
          'SourceService',
          `No movie data found for movie ${movie.id} (${movie.title}) via tracker service`
        );
        return;
      }

      // Update trailer if movie doesn't have one and YTS provides it
      if (!movie.trailer && movieWithTorrents.trailerCode) {
        await this.movieRepository.updateMovieTrailerIfDoesntExists(
          movie.id,
          movieWithTorrents.trailerCode
        );
        logger.debug(
          'SourceService',
          `Updated trailer for movie ${movie.id} with code: ${movieWithTorrents.trailerCode}`
        );
      }

      if (!movieWithTorrents.sources?.length) {
        logger.warn(
          'SourceService',
          `No sources found for movie ${movie.id} (${movie.title}) on YTS`
        );
        return;
      }

      logger.debug(
        'SourceService',
        `Found ${movieWithTorrents.sources.length} sources for movie ${movie.id} (${movie.title})`
      );

      // Get existing sources for this movie
      const existingSources = await this.movieSourceRepository.findByMovieId(movie.id);

      // Create a map of existing sources by hash for quick lookup
      const existingSourcesMap = new Map(existingSources.map(source => [source.hash, source]));

      let updatedCount = 0;

      // Update existing sources with fresh data from YTS
      for (const torrent of movieWithTorrents.sources) {
        const existingSource = existingSourcesMap.get(torrent.hash);
        if (!existingSource) {
          logger.debug(
            'SourceService',
            `Source with hash "${torrent.hash.substring(0, 8)}-redacted" not found in database, skipping`
          );
          continue;
        }

        // Only update if sourceType is unknown or sourceUploadedAt is missing
        const needsUpdate =
          existingSource.sourceType === 'unknown' || !existingSource.sourceUploadedAt;

        if (needsUpdate) {
          const updateData: Partial<MovieSource> = {};

          if (existingSource.sourceType === 'unknown') {
            updateData.sourceType = torrent.type;
          }

          if (!existingSource.sourceUploadedAt && torrent.uploadDate) {
            updateData.sourceUploadedAt = torrent.uploadDate;
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
