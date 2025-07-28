import { logger } from '@logger';
import type { Quality } from '@miauflix/source-metadata-extractor';

import type { Database } from '@database/database';
import type { MovieSource } from '@entities/movie-source.entity';
import type { MovieSourceRepository } from '@repositories/movie-source.repository';
import type { DownloadService } from '@services/download/download.service';
import type { MediaService } from '@services/media/media.service';
import type { SourceService } from '@services/source/source.service';
import { filterHevcSources, filterSources } from '@services/stream/stream.util';

export class StreamService {
  private readonly movieSourceRepository: MovieSourceRepository;

  constructor(
    db: Database,
    private readonly sourceService: SourceService,
    private readonly downloadService: DownloadService,
    private readonly mediaService: MediaService
  ) {
    this.movieSourceRepository = db.getMovieSourceRepository();
  }

  /**
   * Get the best movie source for streaming based on quality preference
   */
  async getBestSourceForStreaming(
    tmdbMovieId: number,
    quality: Quality | 'auto',
    allowHevc = true
  ): Promise<MovieSource | null> {
    // First, get the movie (will fetch from TMDB if not in database)
    const movie = await this.mediaService.getMovieByTmdbId(tmdbMovieId);
    if (!movie) {
      logger.warn('StreamService', `Movie with ID ${tmdbMovieId} not found`);
      return null;
    }

    // Get sources with on-demand search if needed
    const sources = await this.sourceService.getSourcesForMovieWithOnDemandSearch(
      {
        id: movie.id,
        imdbId: movie.imdbId,
        title: movie.title,
        contentDirectoriesSearched: movie.contentDirectoriesSearched,
      },
      3000 // 3 second timeout for source search
    );

    if (!sources.length) {
      logger.warn('StreamService', `No sources found for movie ID ${tmdbMovieId}`);
      return null;
    }

    // Filter and sort sources for streaming
    const streamableSources = filterSources(sources, allowHevc);

    if (!streamableSources.length) {
      logger.warn('StreamService', `No streamable sources found for movie ID ${tmdbMovieId}`);
      const nonStreamableSources = filterHevcSources(sources, allowHevc);
      if (nonStreamableSources.length) {
        // ToDo: Use source service to have a source with file
        return null;
      }
      return null;
    }

    if (quality === 'auto') {
      return streamableSources[0];
    }

    return this.selectSourceByQuality(streamableSources, quality);
  }

  /**
   * Select source by specific quality, fallback to closest available
   */
  private selectSourceByQuality(
    sources: MovieSource[],
    quality: Quality | '3d' | 'auto'
  ): MovieSource {
    // First, try to find exact quality match
    const exactMatch = sources.find(
      source => source.quality?.toLowerCase() === quality.toLowerCase()
    );

    if (exactMatch) {
      return exactMatch;
    }

    logger.info('StreamService', `Exact quality ${quality} not found, selecting best alternative`);
    // If no exact match, fall back to best source ( first one )
    return sources[0];
  }

  /**
   * Get streaming statistics for a source
   */
  async getStreamingStats(source: MovieSource): Promise<{
    broadcasters: number;
    watchers: number;
  }> {
    try {
      return await this.downloadService.getStats(source.hash);
    } catch (error) {
      logger.warn('StreamService', `Failed to get stats for source ${source.id}:`, error);
      return {
        broadcasters: source.broadcasters || 0,
        watchers: source.watchers || 0,
      };
    }
  }

  /**
   * Get a movie source by ID
   */
  async getSourceById(sourceId: number): Promise<MovieSource | null> {
    try {
      return await this.movieSourceRepository.findById(sourceId);
    } catch (error) {
      logger.warn('StreamService', `Failed to get source ${sourceId}:`, error);
      return null;
    }
  }
}
