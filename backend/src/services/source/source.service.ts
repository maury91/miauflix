import { logger } from '@logger';

import type { Database } from '@database/database';
import type { MovieSource } from '@repositories/movie-source.repository';
import type { VpnDetectionService } from '@services/security/vpn.service';
import type { TrackerService } from '@services/source/tracker.service';
import { sleep } from '@utils/time';

import type { MagnetService } from './magnet.service';

/**
 * Service for searching and managing sources
 */
export class SourceService {
  private readonly movieRepository;
  private readonly movieSourceRepository;

  private vpnConnected = false;
  private readonly searchOnlyBehindVpn = true;
  private readonly startPromise: Promise<void>;

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

    logger.info(
      'SourceService',
      `Searching sources for movie ${movie.id} (${movie.title}) with IMDb ID ${movie.imdbId}`
    );

    try {
      // Search for torrents using the tracker service
      const movieWithTorrents = await this.trackerService.searchTorrentsForMovie(movie.imdbId);

      if (!movieWithTorrents || !movieWithTorrents.torrents?.length) {
        logger.info('SourceService', `No sources found for movie ${movie.id} (${movie.title})`);
        return;
      }

      logger.info(
        'SourceService',
        `Found ${movieWithTorrents.torrents.length} sources for movie ${movie.id} (${movie.title})`
      );

      // Convert torrents to MovieSource objects and save them
      const sources = movieWithTorrents.torrents.map(torrent => ({
        movieId: movie.id,
        hash: torrent.magnetLink.split('btih:')[1].split('&')[0], // Extract hash from magnet link
        magnetLink: torrent.magnetLink,
        quality: torrent.quality,
        resolution: torrent.resolution.height,
        size: torrent.size.bytes,
        videoCodec: torrent.videoCodec.toString(),
        seeds: torrent.seeders,
        leechers: torrent.leechers,
        source: 'YTS', // Currently only using YTS as a source
      }));

      await this.movieSourceRepository.createMany(sources);
      logger.info(
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
   * Find all sources with torrent files for a specific movie
   */
  public async getSourcesWithTorrentsForMovie(movieId: number): Promise<MovieSource[]> {
    const sources = await this.movieSourceRepository.findByMovieId(movieId);
    return sources.filter(source => source.torrentFile !== null);
  }

  /**
   * Get a specific source with its torrent file by source ID
   */
  public async getSourceWithTorrent(sourceId: number): Promise<MovieSource | null> {
    const source = await this.movieSourceRepository.findById(sourceId);

    if (!source || !source.torrentFile) {
      return null;
    }

    return source;
  }

  /**
   * Find and download torrent files for sources that don't have them yet
   * This method prioritizes by movie popularity and ensures fair distribution
   */
  public async searchTorrentFilesForSources(): Promise<void> {
    await this.startPromise;

    if (!this.vpnConnected && this.searchOnlyBehindVpn) {
      logger.warn('SourceService', 'VPN is not connected, skipping torrent file search');
      await sleep(2000);
      return;
    }

    // 1. Find movies without sources ordered by popularity
    // 2. Count how many sources each movie has
    // 3. Prioritize by movie popularity and ensure fair distribution
    // 4. Get a group of 50 sources that need torrent files
    logger.info('SourceService', 'Searching torrent files for sources without them');

    const batchSize = Math.max(2, this.magnetService.getAvailableConcurrency());
    const moviesWithoutTorrents = await this.movieRepository.findMoviesWithoutTorrents(
      batchSize * 3
    );
    const sourcesWithoutTorrents = moviesWithoutTorrents.map(movie => ({
      id: movie.id,
      title: movie.title,
      sources: movie.sources.filter(source => source.torrentFile === null),
    }));
    const maxDepth = Math.max(...sourcesWithoutTorrents.map(movie => movie.sources.length));
    const allSources: {
      id: number;
      hash: string;
      magnetLink: string;
      quality: string;
      movieId: number;
      title: string;
    }[] = [];
    for (let depth = 0; depth < maxDepth; depth++) {
      for (const movie of sourcesWithoutTorrents) {
        if (movie.sources[depth]) {
          allSources.push({
            id: movie.sources[depth].id,
            title: movie.title,
            hash: movie.sources[depth].hash,
            magnetLink: movie.sources[depth].magnetLink,
            quality: movie.sources[depth].quality,
            movieId: movie.id,
          });
        }
      }
      if (allSources.length >= batchSize * 3) {
        break;
      }
    }

    console.log(
      `Found ${moviesWithoutTorrents.length} movies without torrents to process, and a total of ${allSources.length} sources without torrent files`
    );
    const processSource = async (source: (typeof allSources)[number]) => {
      logger.debug(
        'SourceService',
        `Processing source ${source.id} for movie "${source.title}" with quality ${source.quality}`
      );
      await this.searchTorrentFileForSource(source);
      if (this.magnetService.isIdle()) {
        // If the magnet service is idle, we can process the next batch
        const nextSource = allSources.shift();
        if (nextSource) {
          processSource(nextSource);
        }
      }
    };

    await Promise.all(allSources.splice(0, batchSize).map(processSource));
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
  }): Promise<void> {
    logger.info(
      'SourceService',
      `Searching file for source ${source.id} (quality: ${source.quality})`
    );

    try {
      const torrentFile = await this.magnetService.getTorrent(source.magnetLink, source.hash);

      if (!torrentFile) {
        logger.warn(
          'SourceService',
          `No file found for source ${source.id} (quality: ${source.quality})`
        );
        return;
      }

      // Save the torrent file to the database
      await this.movieSourceRepository.updateTorrentFile(source.id, torrentFile);

      logger.info(
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
}
