import { IsNull, type Repository } from 'typeorm';

import type { Database } from '@database/database';
import { Notification, type NotificationType } from '@entities/notification.entity';
import type { MediaListRepository } from '@repositories/mediaList.repository';
import type { ProgressRepository } from '@repositories/progress.repository';

export interface NotificationDto {
  id: number;
  type: NotificationType;
  mediaType: 'movie' | 'tv';
  mediaId: number;
  title: string;
  message: string;
  seasonNumber: number | null;
  episodeNumber: number | null;
  createdAt: string;
  readAt: string | null;
}

export class NotificationService {
  private readonly repository: Repository<Notification>;
  private readonly watchlists: MediaListRepository;
  private readonly progress: ProgressRepository;

  constructor(private readonly database: Database) {
    this.repository = database.getRepository(Notification);
    this.watchlists = database.getMediaListRepository();
    this.progress = database.getProgressRepository();
  }

  async list(
    userId: string,
    limit = 30
  ): Promise<{ notifications: NotificationDto[]; unreadCount: number }> {
    const [rows, unreadCount] = await Promise.all([
      this.repository.find({
        where: { userId },
        order: { createdAt: 'DESC' },
        take: Math.max(1, Math.min(limit, 100)),
      }),
      this.repository.count({ where: { userId, readAt: IsNull() } }),
    ]);
    return { notifications: rows.map(toDto), unreadCount };
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
    });
  }

  async episodeAvailable(input: {
    showMediaId: number;
    showTitle: string;
    seasonNumber: number;
    episodeNumber: number;
    airDate: string | null;
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
    });
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

function toDto(notification: Notification): NotificationDto {
  return {
    id: notification.id,
    type: notification.type,
    mediaType: notification.mediaType,
    mediaId: notification.mediaId,
    title: notification.title,
    message: notification.message,
    seasonNumber: notification.seasonNumber,
    episodeNumber: notification.episodeNumber,
    createdAt: notification.createdAt.toISOString(),
    readAt: notification.readAt?.toISOString() ?? null,
  };
}
