import { logger } from '@logger';
import type { Quality } from '@miauflix/source-metadata-extractor';

import type { Database } from '@database/database';
import type { ContentSource } from '@entities/content-source.entity';
import type { Movie } from '@entities/movie.entity';
import type { PlaybackGrant } from '@entities/playback-grant.entity';
import type { ContentSourceRepository } from '@repositories/content-source.repository';
import type { EpisodeSourceRepository } from '@repositories/episode-source.repository';
import { playableFromKey } from '@routes/playable.types';
import type { DownloadService } from '@services/download/download.service';
import type { MediaService } from '@services/media/media.service';
import type { PlaybackTarget } from '@services/playback/playback-target';
import type { PlaybackTargetService } from '@services/playback/playback-target.service';
import type { SourceService } from '@services/source/source.service';
import { filterHevcSources, filterSources } from '@services/stream/stream.util';
import { traced } from '@utils/tracing.util';

export interface ResolvedPlayback {
  target: PlaybackTarget;
  /** Set for movie grants; the source is verified to be linked to this movie. */
  movie: Movie | null;
}

export class StreamService {
  private readonly contentSourceRepository: ContentSourceRepository;
  private readonly episodeSourceRepository: EpisodeSourceRepository;

  constructor(
    db: Database,
    private readonly sourceService: SourceService,
    private readonly downloadService: DownloadService,
    private readonly mediaService: MediaService,
    private readonly targets: Pick<PlaybackTargetService, 'forEpisode' | 'forMovie'>
  ) {
    this.contentSourceRepository = db.getContentSourceRepository();
    this.episodeSourceRepository = db.getEpisodeSourceRepository();
  }

  /**
   * Resolve a playback grant to the exact file it may read, only when its source is associated
   * with that playable. Movie grants may attach the torrent once to learn the source's file list.
   */
  async resolvePlaybackTarget(
    grant: Pick<PlaybackGrant, 'playableKey' | 'playableKind' | 'sourceId'>
  ): Promise<ResolvedPlayback | null> {
    const source = await this.getSourceById(grant.sourceId);
    if (!source) return null;
    const playable = playableFromKey(grant.playableKey);
    if (!playable || playable.kind !== grant.playableKind) return null;

    if (playable.kind === 'movie') {
      const movie = await this.mediaService.getLocalMovieByMediaId(playable.mediaId);
      if (!movie || !(await this.contentSourceRepository.isLinkedToMovie(movie.id, source.id)))
        return null;
      return { target: await this.targets.forMovie(movie.id, source), movie };
    }

    const episodeSource = await this.episodeSourceRepository.findForPlayback(
      playable.showMediaId,
      playable.seasonNumber,
      playable.episodeNumber,
      source.id
    );
    const target = episodeSource && (await this.targets.forEpisode({ ...episodeSource, source }));
    return target ? { target, movie: null } : null;
  }

  /** The movie's main video inside a source chosen for it. */
  movieTarget(movieId: number, source: ContentSource): Promise<PlaybackTarget> {
    return this.targets.forMovie(movieId, source);
  }

  /**
   * Get the best movie source for streaming based on quality preference
   */
  @traced('StreamService')
  async getBestSourceForStreaming(
    movieId: number,
    quality: Quality | 'auto',
    allowHevc = true
  ): Promise<ContentSource | null> {
    // First, get the movie (the caller ensures fresh catalog data beforehand)
    const movie = await this.mediaService.getMovieById(movieId);
    if (!movie) {
      logger.warn('StreamService', `Movie with ID ${movieId} not found`);
      return null;
    }

    // Get sources with on-demand search if needed
    let sources = await this.sourceService.getSourcesForMovieWithOnDemandSearch(
      {
        id: movie.id,
        imdbId: movie.imdbId,
        title: movie.title,
        contentDirectoriesSearched: movie.contentDirectoriesSearched,
      },
      3000 // 3 second timeout for source search
    );

    if (!sources.length) {
      logger.warn('StreamService', `No sources found for movie ID ${movieId}`);
      return null;
    }

    // A streaming endpoint needs a usable source now. Resolve a small number inline instead of
    // waiting for the background metadata queue to catch up.
    let streamableSources = filterSources(sources, allowHevc);
    if (!streamableSources.length) {
      for (const source of filterHevcSources(sources, allowHevc).slice(0, 2)) {
        try {
          await this.sourceService.processSourceMetadata(source.id);
        } catch (error) {
          logger.warn('StreamService', `Inline metadata resolution failed for ${source.id}`, error);
        }
        sources = await this.sourceService.getSourcesForMovie(movie.id);
        streamableSources = filterSources(sources, allowHevc);
        if (streamableSources.length) break;
      }
    }

    if (!streamableSources.length) {
      logger.warn('StreamService', `No streamable sources found for movie ID ${movieId}`);
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
    sources: ContentSource[],
    quality: Quality | '3d' | 'auto'
  ): ContentSource {
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
  @traced('StreamService')
  async getStreamingStats(source: ContentSource): Promise<{
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
  @traced('StreamService')
  async getSourceById(sourceId: number): Promise<ContentSource | null> {
    try {
      return await this.contentSourceRepository.findById(sourceId);
    } catch (error) {
      logger.warn('StreamService', `Failed to get source ${sourceId}:`, error);
      return null;
    }
  }
}
