import { logger } from '@logger';

import type { MovieSource } from '@entities/movie.entity';
import type { Database } from '@database/database';
import type { VpnDetectionService } from '@services/security/vpn.service';
import type { TrackerService } from '@services/source/tracker.service';
import { RateLimiter } from '@utils/rateLimiter';
import { sleep } from '@utils/time';

import { enhancedFetch } from './services/utils';
import type { MagnetService } from './magnet.service';

/**
 * Service for searching and managing sources
 */
export class SourceService {
  private readonly movieRepository;
  private readonly movieSourceRepository;
  private readonly sourceRateLimiters = new Map<string, RateLimiter>();

  private vpnConnected = false;
  private readonly searchOnlyBehindVpn = true;
  private readonly startPromise: Promise<void>;
  private lastNoSourcesLogTime = 0;

  constructor(
    db: Database,
    vpnService: VpnDetectionService,
    private readonly trackerService: TrackerService,
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
  private async searchSourcesForMovie(movie: {
    id: number;
    imdbId: string | null;
    title: string;
  }): Promise<void> {
    await this.startPromise;

    if (!this.vpnConnected && this.searchOnlyBehindVpn) {
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
      const movieWithTorrents = await this.trackerService.searchTorrentsForMovie(movie.imdbId);

      if (!movieWithTorrents || !movieWithTorrents.torrents?.length) {
        logger.debug('SourceService', `No sources found for movie ${movie.id} (${movie.title})`);
        return;
      }

      logger.debug(
        'SourceService',
        `Found ${movieWithTorrents.torrents.length} sources for movie ${movie.id} (${movie.title})`
      );

      // Convert sources to MovieSource objects and save them
      const sources = movieWithTorrents.torrents.map(
        (torrent): Omit<MovieSource, 'createdAt' | 'id' | 'movie' | 'updatedAt'> => ({
          movieId: movie.id,
          hash: torrent.magnetLink.split('btih:')[1].split('&')[0], // Extract identifier from URI link
          magnetLink: torrent.magnetLink,
          quality: torrent.quality,
          resolution: torrent.resolution.height,
          size: torrent.size.bytes,
          videoCodec: torrent.videoCodec.toString(),
          broadcasters: torrent.seeders,
          watchers: torrent.leechers,
          sourceUploadedAt: torrent.uploadDate,
          url: torrent.url,
          source: 'YTS', // Currently only using YTS as a source
        })
      );

      await this.movieSourceRepository.createMany(sources);
      logger.debug(
        'SourceService',
        `Saved ${sources.length} sources for movie ${movie.id} (${movie.title})`
      );
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
   * Find all sources with data files for a specific movie
   */
  public async getSourcesWithTorrentsForMovie(movieId: number): Promise<MovieSource[]> {
    const sources = await this.movieSourceRepository.findByMovieId(movieId);
    return sources.filter(source => source.file !== null);
  }

  /**
   * Get a specific source with its data file by source ID
   */
  public async getSourceWithTorrent(sourceId: number): Promise<MovieSource | null> {
    const source = await this.movieSourceRepository.findById(sourceId);

    if (!source || !source.file) {
      return null;
    }

    return source;
  }

  public async syncStatsForSources(): Promise<void> {
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
          await this.movieSourceRepository.updateStats(source.id, seeders, leechers);
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

    // Early exit if no movies need processing - avoid log spam
    if (sourcesToProcess.length === 0) {
      const now = Date.now();
      const timeSinceLastLog = now - this.lastNoSourcesLogTime;
      // Only log once every 30 seconds when there are no sources to process
      if (timeSinceLastLog > 30000) {
        logger.debug('SourceService', 'No sources requiring data files found');
        this.lastNoSourcesLogTime = now;
      }
      return;
    }
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
    quality: string;
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
      this.sourceRateLimiters.set(source, new RateLimiter(rateLimit));
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
      logger.debug('SourceService', `Downloading torrent from URL: ${url} (source: ${source})`);

      // Throttle the request
      const rateLimiter = this.getSourceRateLimiter(source);
      await rateLimiter.throttle();

      const response = await enhancedFetch(url);

      if (!response.ok) {
        logger.warn(
          'SourceService',
          `Failed to download torrent from URL: ${response.status} ${response.statusText}`
        );
        return null;
      }

      const contentType = response.headers.get('content-type');
      if (!contentType?.includes('application/')) {
        logger.warn('SourceService', `Invalid content type for torrent file: ${contentType}`);
        return null;
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      logger.error('SourceService', `Error downloading torrent from URL: ${url}`, error);
      return null;
    }
  }
}
