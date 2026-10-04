import { logger } from '@logger';

import type { Database } from '@database/database';
import type { ProgressRepository } from '@repositories/progress.repository';
import type { ProgressEntry, ProgressUpdateRequest } from '@routes/progress.types';
import type { ListClientService } from '@services/list/list-client.service';

import { mergeProgress } from './progress.merge';

export class ProgressService {
  private readonly progressRepository: ProgressRepository;

  constructor(
    database: Database,
    private readonly listClient?: ListClientService
  ) {
    this.progressRepository = database.getProgressRepository();
  }

  async update(userId: string, update: ProgressUpdateRequest): Promise<void> {
    await this.progressRepository.upsert(userId, update);
    if (this.listClient?.isReady()) {
      await this.listClient.syncPlayback(userId, update).catch(() => {
        // Local progress remains authoritative when the optional Trakt sync is unavailable.
        logger.warn('Progress', 'Trakt playback export failed; local progress was saved');
      });
    }
  }

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
}

function parseEpisodeKey(key: string) {
  const [, showMediaId, seasonNumber, episodeNumber] = key.split(':').map(Number);
  return { kind: 'episode' as const, showMediaId, seasonNumber, episodeNumber };
}
