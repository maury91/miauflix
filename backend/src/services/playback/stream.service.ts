import { logger } from '@logger';

import type { Database } from '@database/database';
import type { ContentSource } from '@entities/content-source.entity';
import type { Movie } from '@entities/movie.entity';
import type { PlaybackGrant } from '@entities/playback-grant.entity';
import { playableFromKey } from '@mytypes/playable.types';
import type { ContentSourceRepository } from '@repositories/content-source.repository';
import type { EpisodeSourceRepository } from '@repositories/episode-source.repository';
import type { MediaService } from '@services/media/media.service';
import { traced } from '@utils/tracing.util';

import type { PlaybackTarget } from './playback-target';
import type { PlaybackTargetService } from './playback-target.service';

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
