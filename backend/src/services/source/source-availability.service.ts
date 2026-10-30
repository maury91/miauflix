import { logger } from '@logger';
import parseTorrent from 'parse-torrent';
import { In } from 'typeorm';

import type { Database } from '@database/database';
import type { ContentSource } from '@entities/content-source.entity';
import { EpisodeSource } from '@entities/episode-source.entity';
import { Movie } from '@entities/movie.entity';
import { MovieSource } from '@entities/movie-source.entity';
import type { PlayableRef } from '@routes/playable.types';
import { containsPlayableVideo } from '@services/download/download.utils';
import type {
  NotificationService,
  NotifiedSource,
} from '@services/notifications/notification.service';

/**
 * Whether a movie or episode can be played:
 * - `available`: at least one source is verified to hold a real video
 * - `pending`: candidates are unverified, or the search for sources is not finished
 * - `unavailable`: every known source is fake, or the finished search found none
 */
export type SourceAvailability = 'available' | 'pending' | 'unavailable';

export interface SourceAvailabilityChange {
  playable: PlayableRef;
  availability: SourceAvailability;
}

/** A source may still be picked unless its file list proved it fake. */
export const isUsableSource = (source: Pick<ContentSource, 'hasVideo'>) =>
  source.hasVideo !== false;

/** Availability from what is known about a playable's sources. */
export function availabilityOf(
  sources: ReadonlyArray<Pick<ContentSource, 'hasVideo'>>,
  searchFinished: boolean
): SourceAvailability {
  if (sources.some(source => source.hasVideo === true)) return 'available';
  if (sources.length ? sources.every(source => source.hasVideo === false) : searchFinished)
    return 'unavailable';
  return 'pending';
}

/**
 * Records which sources hold a real video, the moment their file list is known (a torrent
 * file, a resolved layout, or a playback attempt), and turns that into per-playable
 * availability. Listeners hear every playable whose availability may have changed; a playable
 * that became available notifies the users waiting for it.
 */
export class SourceAvailabilityService {
  private readonly listeners = new Set<(change: SourceAvailabilityChange) => void>();

  constructor(
    private readonly db: Database,
    private readonly notifications?: Pick<
      NotificationService,
      'episodeAvailable' | 'playableAvailable'
    >,
    private readonly movieProviderNames: () => string[] = () => []
  ) {}

  /** Record the verdict for a source's file list; returns whether it holds a real video. */
  async recordFiles(
    sourceId: number,
    files: ReadonlyArray<{ path: string; length: number }>
  ): Promise<boolean> {
    const hasVideo = containsPlayableVideo(files);
    if (!hasVideo) logger.warn('SourceAvailability', `Source ${sourceId} holds no playable video`);
    if (await this.db.getContentSourceRepository().setHasVideo(sourceId, hasVideo)) {
      await this.publishForSource(sourceId, hasVideo);
    }
    return hasVideo;
  }

  /** Record the verdict from a torrent file; unreadable files are left unjudged. */
  async recordTorrentFile(sourceId: number, file: Buffer): Promise<boolean | null> {
    try {
      const parsed = await parseTorrent(file);
      const files = parsed.files ?? [];
      if (!files.length) return null;
      return await this.recordFiles(sourceId, files);
    } catch (error) {
      logger.debug('SourceAvailability', `Torrent file of source ${sourceId} is unreadable`, error);
      return null;
    }
  }

  /** A movie's availability; `sources` saves the lookup when the caller already has them. */
  async forMovie(
    movie: Pick<Movie, 'contentDirectoriesSearched' | 'id'>,
    sources?: ReadonlyArray<Pick<ContentSource, 'hasVideo'>>
  ): Promise<SourceAvailability> {
    const known = sources ?? (await this.db.getContentSourceRepository().findByMovieId(movie.id));
    const providers = this.movieProviderNames();
    const searched =
      providers.length > 0 &&
      providers.every(name => movie.contentDirectoriesSearched?.includes(name));
    return availabilityOf(known, searched);
  }

  /**
   * Episodes are matched to sources on demand, so an episode with no matches is still
   * `pending`: only matches that all proved fake make it `unavailable`.
   */
  async forEpisodes(episodeIds: number[]): Promise<Map<number, SourceAvailability>> {
    const result = new Map<number, SourceAvailability>(
      episodeIds.map(id => [id, 'pending' as const])
    );
    if (!episodeIds.length) return result;
    const matches = await this.db.getRepository(EpisodeSource).find({
      where: { episodeId: In(episodeIds) },
      relations: { source: true },
    });
    const byEpisode = new Map<number, ContentSource[]>();
    for (const match of matches) {
      const list = byEpisode.get(match.episodeId) ?? [];
      list.push(match.source);
      byEpisode.set(match.episodeId, list);
    }
    for (const [episodeId, sources] of byEpisode)
      result.set(episodeId, availabilityOf(sources, false));
    return result;
  }

  /** Subscribe to availability changes; returns the unsubscribe function. */
  onChange(listener: (change: SourceAvailabilityChange) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Recompute every playable the source belongs to and tell listeners and waiting users. */
  private async publishForSource(sourceId: number, hasVideo: boolean): Promise<void> {
    try {
      const movies = await this.db
        .getRepository(Movie)
        .createQueryBuilder('movie')
        .innerJoin(MovieSource, 'link', 'link.movieId = movie.id')
        .where('link.sourceId = :sourceId', { sourceId })
        .getMany();
      // The source that just proved real is what the notifications announce.
      let notified: NotifiedSource | undefined;
      const notifiedSource = async (): Promise<NotifiedSource | undefined> => {
        if (notified) return notified;
        const source = await this.db.getContentSourceRepository().findQuality(sourceId);
        notified = source ? { quality: source.quality, sourceType: source.sourceType } : undefined;
        return notified;
      };
      for (const movie of movies) {
        const availability = await this.forMovie(movie);
        const playable: PlayableRef = { kind: 'movie', mediaId: movie.mediaId };
        this.emit({ playable, availability });
        if (availability === 'available' && hasVideo)
          await this.notifications?.playableAvailable(
            playable,
            movie.title,
            await notifiedSource()
          );
      }

      const episodeLinks = await this.db.getRepository(EpisodeSource).find({
        where: { sourceId },
        relations: { episode: { season: { tvShow: true } } },
      });
      const episodes = new Map(episodeLinks.map(link => [link.episodeId, link.episode]));
      const availability = await this.forEpisodes([...episodes.keys()]);
      for (const [episodeId, episode] of episodes) {
        const show = episode.season?.tvShow;
        if (!show) continue;
        const playable: PlayableRef = {
          kind: 'episode',
          showMediaId: show.mediaId,
          seasonNumber: episode.season.seasonNumber,
          episodeNumber: episode.episodeNumber,
        };
        const state = availability.get(episodeId) ?? 'pending';
        this.emit({ playable, availability: state });
        if (state !== 'available' || !hasVideo) continue;
        const source = await notifiedSource();
        await this.notifications?.playableAvailable(playable, show.name, source);
        await this.notifications?.episodeAvailable({
          showMediaId: show.mediaId,
          showTitle: show.name,
          seasonNumber: episode.season.seasonNumber,
          episodeNumber: episode.episodeNumber,
          airDate: episode.airDate,
          source,
        });
      }
    } catch (error) {
      logger.warn('SourceAvailability', `Availability of source ${sourceId} not published`, error);
    }
  }

  private emit(change: SourceAvailabilityChange): void {
    for (const listener of this.listeners) {
      try {
        listener(change);
      } catch (error) {
        logger.warn('SourceAvailability', 'Availability listener failed', error);
      }
    }
  }
}
