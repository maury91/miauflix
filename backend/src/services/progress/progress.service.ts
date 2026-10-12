import { logger } from '@logger';

import type { Database } from '@database/database';
import type { Progress } from '@entities/progress.entity';
import type { ProgressRepository } from '@repositories/progress.repository';
import { playableKey } from '@routes/playable.types';
import type { ProgressEntry, ProgressUpdateRequest } from '@routes/progress.types';
import type { ListClientService } from '@services/list/list-client.service';

import { mergeProgress } from './progress.merge';

export class ProgressService {
  private readonly progressRepository: ProgressRepository;
  private readonly backgroundPlaybackCache = new Map<
    string,
    { expiresAt: number; entries: ProgressEntry[] }
  >();

  constructor(
    database: Database,
    private readonly listClient?: ListClientService
  ) {
    this.progressRepository = database.getProgressRepository();
  }

  /**
   * Save local progress before attempting export through a ready list service.
   * Export failures are ignored after the save succeeds; repository failures propagate.
   */
  async update(userId: string, update: ProgressUpdateRequest): Promise<void> {
    await this.progressRepository.upsert(userId, update);
    if (this.listClient?.isReady()) {
      await this.listClient.syncPlayback(userId, update).catch(() => {
        // Local progress remains authoritative when the optional Trakt sync is unavailable.
        logger.warn('Progress', 'Trakt playback export failed; local progress was saved');
      });
    }
  }

  /**
   * Return local and imported progress, newest first, with local entries winning timestamp ties.
   * An unavailable or failing list service contributes no entries. Repository failures propagate;
   * imported entries are neither persisted locally nor exported again.
   */
  async findByUser(userId: string): Promise<ProgressEntry[]> {
    const remote = this.listClient?.isReady()
      ? await this.listClient.getPlayback(userId).catch(() => {
          logger.warn('Progress', 'Trakt playback import failed; returning local progress');
          return [];
        })
      : [];
    const progress = await this.progressRepository.findByUser(userId);
    return mergeProgress(
      progress.map(item => ({
        playable:
          item.playableKind === 'movie'
            ? { kind: 'movie' as const, mediaId: Number(item.playableKey.slice(2)) }
            : parseEpisodeKey(item.playableKey),
        positionSeconds: item.positionSeconds,
        durationSeconds: item.durationSeconds,
        state: item.state,
        updatedAt: item.updatedAt.toISOString(),
      })),
      remote
    );
  }

  /** Local and imported episode progress used by the background TV acquisition planner. */
  async findEpisodeProgressForShow(
    showMediaId: number,
    userIds: string[]
  ): Promise<Array<Pick<Progress, 'playableKey' | 'updatedAt' | 'userId'>>> {
    const local = await this.progressRepository.findEpisodeProgressForShow(showMediaId, userIds);
    if (!userIds.length || !this.listClient?.isReady()) return local;

    const merged = new Map(
      local.map(item => [
        `${item.userId}:${item.playableKey}`,
        { userId: item.userId, playableKey: item.playableKey, updatedAt: item.updatedAt },
      ])
    );
    await Promise.all(
      userIds.map(async userId => {
        const remote = await this.getBackgroundPlayback(userId);
        for (const item of remote) {
          if (item.playable.kind !== 'episode' || item.playable.showMediaId !== showMediaId)
            continue;
          const updatedAt = new Date(item.updatedAt);
          if (!Number.isFinite(updatedAt.getTime())) continue;
          const key = `${userId}:${playableKey(item.playable)}`;
          const existing = merged.get(key);
          if (!existing || updatedAt > existing.updatedAt) {
            merged.set(key, { userId, playableKey: playableKey(item.playable), updatedAt });
          }
        }
      })
    );
    return [...merged.values()].sort(
      (left, right) => right.updatedAt.getTime() - left.updatedAt.getTime()
    );
  }

  private async getBackgroundPlayback(userId: string): Promise<ProgressEntry[]> {
    const cached = this.backgroundPlaybackCache.get(userId);
    if (cached && cached.expiresAt > Date.now()) return cached.entries;
    try {
      const entries = await this.listClient!.getPlayback(userId);
      if (this.backgroundPlaybackCache.size >= 256)
        this.backgroundPlaybackCache.delete(this.backgroundPlaybackCache.keys().next().value!);
      this.backgroundPlaybackCache.set(userId, { entries, expiresAt: Date.now() + 15 * 60_000 });
      return entries;
    } catch {
      logger.warn(
        'Progress',
        'Trakt playback import failed for TV acquisition; using local progress'
      );
      this.backgroundPlaybackCache.set(userId, {
        entries: [],
        expiresAt: Date.now() + 2 * 60_000,
      });
      return [];
    }
  }
}

/** Decode a stored e:showMediaId:seasonNumber:episodeNumber key without validating its parts. */
function parseEpisodeKey(key: string) {
  const [, showMediaId, seasonNumber, episodeNumber] = key.split(':').map(Number);
  return { kind: 'episode' as const, showMediaId, seasonNumber, episodeNumber };
}
