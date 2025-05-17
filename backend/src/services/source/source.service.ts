import { logger } from '@logger';

import type { Database } from '@database/database';
import type { VpnDetectionService } from '@services/security/vpn.service';
import type { TrackerService } from '@services/source/tracker.service';
import { sleep } from '@utils/time';

/**
 * Service for searching and managing sources
 */
export class SourceService {
  private readonly movieRepository;
  private readonly movieSourceRepository;

  private vpnConnected = false;
  private readonly searchOnlyBehindVpn = true;

  constructor(
    db: Database,
    vpnService: VpnDetectionService,
    private readonly trackerService: TrackerService
  ) {
    this.movieRepository = db.getMovieRepository();
    this.movieSourceRepository = db.getMovieSourceRepository();
    if (this.searchOnlyBehindVpn) {
      vpnService.isVpnActive().then(connected => {
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
  public async getSourcesForMovie(movieId: number) {
    return this.movieSourceRepository.findByMovieId(movieId);
  }
}
