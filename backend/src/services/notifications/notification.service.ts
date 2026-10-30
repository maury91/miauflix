import type { Source } from '@miauflix/source-metadata-extractor';
import { In, IsNull, LessThan, Not, type Repository } from 'typeorm';

import type { Database } from '@database/database';
import { AvailabilityRequest } from '@entities/availability-request.entity';
import type { SourceQuality } from '@entities/content-source.entity';
import { Movie } from '@entities/movie.entity';
import { Notification, type NotificationType } from '@entities/notification.entity';
import { TVShow } from '@entities/tvshow.entity';
import type { MediaListRepository } from '@repositories/mediaList.repository';
import type { ProgressRepository } from '@repositories/progress.repository';
import { playableKey, type PlayableRef } from '@routes/playable.types';
import { EncryptedColumns } from '@utils/encrypted-column.util';

export interface NotificationDto {
  id: number;
  type: NotificationType;
  mediaType: 'movie' | 'tv';
  mediaId: number;
  title: string;
  message: string;
  seasonNumber: number | null;
  episodeNumber: number | null;
  quality: SourceQuality | null;
  sourceType: Source | null;
  previousSourceType: Source | null;
  poster: string | null;
  createdAt: string;
  readAt: string | null;
}

export type NotificationStatus = 'read' | 'unread';

export interface NotificationPage {
  notifications: NotificationDto[];
  /** Pass back as `cursor` for the next page; `null` once the stream is exhausted. */
  nextCursor: number | null;
}

/** The source a notification announces, shown as its quality badge. */
export interface NotifiedSource {
  quality: SourceQuality | null;
  sourceType: Source | null;
}

export const NOTIFICATIONS_PAGE_LIMIT = 50;

/** Pending "Notify me" requests one user may have at a time. */
export const MAX_PENDING_AVAILABILITY_REQUESTS = 200;

export class NotificationService {
  private readonly repository: Repository<Notification>;
  private readonly availabilityRequests: Repository<AvailabilityRequest>;
  private readonly watchlists: MediaListRepository;
  private readonly progress: ProgressRepository;

  constructor(private readonly database: Database) {
    this.repository = database.getRepository(Notification);
    this.availabilityRequests = database.getRepository(AvailabilityRequest);
    this.watchlists = database.getMediaListRepository();
    this.progress = database.getProgressRepository();
  }

  /**
   * One page of the user's unread or read notifications, newest first. Ids grow with creation
   * time, so the last id is a cursor that stays stable while new notifications arrive.
   */
  async list(
    userId: string,
    { status, cursor, limit = 20 }: { status: NotificationStatus; cursor?: number; limit?: number }
  ): Promise<NotificationPage> {
    const take = Math.max(1, Math.min(limit, NOTIFICATIONS_PAGE_LIMIT));
    const rows = await this.repository.find({
      where: {
        userId,
        readAt: status === 'unread' ? IsNull() : Not(IsNull()),
        ...(cursor ? { id: LessThan(cursor) } : {}),
      },
      order: { id: 'DESC' },
      take: take + 1,
    });
    const page = rows.slice(0, take);
    const posters = await this.postersFor(page);
    return {
      notifications: page.map(row => toDto(row, posters.get(posterKey(row)) ?? null)),
      nextCursor: rows.length > take ? (page.at(-1)?.id ?? null) : null,
    };
  }

  async counts(userId: string): Promise<{ unreadCount: number; hasRead: boolean }> {
    const [unreadCount, hasRead] = await Promise.all([
      this.repository.count({ where: { userId, readAt: IsNull() } }),
      this.repository.exists({ where: { userId, readAt: Not(IsNull()) } }),
    ]);
    return { unreadCount, hasRead };
  }

  async markAllRead(userId: string): Promise<number> {
    const result = await this.repository.update(
      { userId, readAt: IsNull() },
      { readAt: new Date() }
    );
    return result.affected ?? 0;
  }

  async markRead(userId: string, id: number): Promise<boolean> {
    const result = await this.repository.update(
      { id, userId, readAt: IsNull() },
      { readAt: new Date() }
    );
    return Boolean(result.affected);
  }

  async movieQualityUpgrade(input: {
    mediaId: number;
    title: string;
    qualityKey: string;
    previousQuality: string;
    nextQuality: string;
    source?: NotifiedSource;
    previousSourceType?: Source | null;
  }): Promise<void> {
    const [watchlisted, watched] = await Promise.all([
      this.watchlists.findLocalWatchlistOwners('movie', input.mediaId),
      this.progress.findUserIdsForMovie(input.mediaId),
    ]);
    await this.insertForUsers([...new Set([...watchlisted, ...watched])], {
      dedupeKey: `movie:${input.mediaId}:${input.qualityKey}`,
      type: 'movie_quality_upgrade',
      mediaType: 'movie',
      mediaId: input.mediaId,
      title: input.title,
      message: `A better ${input.nextQuality} source is available (previously ${input.previousQuality}).`,
      seasonNumber: null,
      episodeNumber: null,
      ...sourceColumns(input.source),
      previousSourceType: input.previousSourceType ?? null,
    });
  }

  async episodeAvailable(input: {
    showMediaId: number;
    showTitle: string;
    seasonNumber: number;
    episodeNumber: number;
    airDate: string | null;
    source?: NotifiedSource;
  }): Promise<void> {
    // A short release window prevents an initial show sync from filling the inbox with history.
    const airedAt = input.airDate ? Date.parse(input.airDate) : NaN;
    if (!Number.isFinite(airedAt) || airedAt > Date.now() || Date.now() - airedAt > 45 * 86_400_000)
      return;
    const [watchlisted, watched] = await Promise.all([
      this.watchlists.findLocalWatchlistOwners('tv', input.showMediaId),
      this.progress.findUserIdsForShow(input.showMediaId),
    ]);
    const season = String(input.seasonNumber).padStart(2, '0');
    const episode = String(input.episodeNumber).padStart(2, '0');
    await this.insertForUsers([...new Set([...watchlisted, ...watched])], {
      dedupeKey: `tv:${input.showMediaId}:${input.seasonNumber}:${input.episodeNumber}`,
      type: 'tv_episode_available',
      mediaType: 'tv',
      mediaId: input.showMediaId,
      title: input.showTitle,
      message: `S${season}E${episode} is ready to watch.`,
      seasonNumber: input.seasonNumber,
      episodeNumber: input.episodeNumber,
      ...sourceColumns(input.source),
      previousSourceType: null,
    });
  }

  /**
   * "Notify me": remember that the user wants to hear when the playable gets a real source.
   * Asking again for the same playable always succeeds; a new one is refused once the user has
   * `MAX_PENDING_AVAILABILITY_REQUESTS` pending.
   */
  async requestAvailability(
    userId: string,
    playable: PlayableRef
  ): Promise<'limited' | 'requested'> {
    const key = playableKey(playable);
    return this.database.write(async () => {
      if (await this.availabilityRequests.exists({ where: { userId, playableKey: key } }))
        return 'requested';
      const pending = await this.availabilityRequests.count({ where: { userId } });
      if (pending >= MAX_PENDING_AVAILABILITY_REQUESTS) return 'limited';
      await this.availabilityRequests
        .createQueryBuilder()
        .insert()
        .into(AvailabilityRequest)
        .values({ userId, playableKey: key })
        .orIgnore()
        .execute();
      return 'requested';
    });
  }

  async hasRequestedAvailability(userId: string, playable: PlayableRef): Promise<boolean> {
    return this.availabilityRequests.exists({
      where: { userId, playableKey: playableKey(playable) },
    });
  }

  /** Tell everyone who asked that the playable now has a real source, once. */
  async playableAvailable(
    playable: PlayableRef,
    title: string,
    source?: NotifiedSource
  ): Promise<void> {
    const key = playableKey(playable);
    const requests = await this.availabilityRequests.find({ where: { playableKey: key } });
    if (!requests.length) return;
    const episode =
      playable.kind === 'episode'
        ? `S${String(playable.seasonNumber).padStart(2, '0')}E${String(playable.episodeNumber).padStart(2, '0')}`
        : null;
    const userIds = requests.map(request => request.userId);
    await this.insertForUsers(userIds, {
      dedupeKey: `available:${key}`,
      type: 'source_available',
      mediaType: playable.kind === 'movie' ? 'movie' : 'tv',
      mediaId: playable.kind === 'movie' ? playable.mediaId : playable.showMediaId,
      title,
      message: episode
        ? `${episode} is now available to watch.`
        : `${title} is now available to watch.`,
      seasonNumber: playable.kind === 'episode' ? playable.seasonNumber : null,
      episodeNumber: playable.kind === 'episode' ? playable.episodeNumber : null,
      ...sourceColumns(source),
      previousSourceType: null,
    });
    // Only the requests just notified: one made meanwhile waits for the next check.
    await this.availabilityRequests.delete({ playableKey: key, userId: In(userIds) });
  }

  /** Playables someone is waiting on, so background checks can look for their sources. */
  async requestedPlayableKeys(limit = 50, offset = 0): Promise<string[]> {
    const rows = await this.availabilityRequests
      .createQueryBuilder('request')
      .select('request.playableKey', 'playableKey')
      .groupBy('request.playableKey')
      .orderBy('MIN(request.createdAt)', 'ASC')
      .limit(limit)
      .offset(offset)
      .getRawMany<{ playableKey: string }>();
    // Raw rows skip the column transformer.
    return rows.map(row => EncryptedColumns.decrypt(row.playableKey));
  }

  /** Posters are looked up when listing, so notifications stored before artwork arrived get one. */
  private async postersFor(rows: Notification[]): Promise<Map<string, string>> {
    const ids = (mediaType: 'movie' | 'tv') => [
      ...new Set(rows.filter(row => row.mediaType === mediaType).map(row => row.mediaId)),
    ];
    const movieIds = ids('movie');
    const showIds = ids('tv');
    const [movies, shows] = await Promise.all([
      movieIds.length
        ? this.database.getRepository(Movie).find({
            where: { mediaId: In(movieIds) },
            select: { mediaId: true, poster: true },
          })
        : [],
      showIds.length
        ? this.database.getRepository(TVShow).find({
            where: { mediaId: In(showIds) },
            select: { mediaId: true, poster: true },
          })
        : [],
    ]);
    const posters = new Map<string, string>();
    for (const movie of movies)
      if (movie.poster)
        posters.set(posterKey({ mediaType: 'movie', mediaId: movie.mediaId }), movie.poster);
    for (const show of shows)
      if (show.poster)
        posters.set(posterKey({ mediaType: 'tv', mediaId: show.mediaId }), show.poster);
    return posters;
  }

  private async insertForUsers(
    userIds: string[],
    notification: Omit<Notification, 'createdAt' | 'id' | 'readAt' | 'user' | 'userId'>
  ): Promise<void> {
    if (!userIds.length) return;
    await this.database.write(() =>
      this.repository
        .createQueryBuilder()
        .insert()
        .into(Notification)
        .values(userIds.map(userId => ({ ...notification, userId, readAt: null })))
        .orIgnore()
        .execute()
        .then(() => undefined)
    );
  }
}

function sourceColumns(source?: NotifiedSource): NotifiedSource {
  return { quality: source?.quality ?? null, sourceType: source?.sourceType ?? null };
}

function posterKey(notification: Pick<Notification, 'mediaId' | 'mediaType'>): string {
  return `${notification.mediaType}:${notification.mediaId}`;
}

function toDto(notification: Notification, poster: string | null): NotificationDto {
  return {
    id: notification.id,
    type: notification.type,
    mediaType: notification.mediaType,
    mediaId: notification.mediaId,
    title: notification.title,
    message: notification.message,
    seasonNumber: notification.seasonNumber,
    episodeNumber: notification.episodeNumber,
    quality: notification.quality ?? null,
    sourceType: notification.sourceType ?? null,
    previousSourceType: notification.previousSourceType ?? null,
    poster,
    createdAt: notification.createdAt.toISOString(),
    readAt: notification.readAt?.toISOString() ?? null,
  };
}
