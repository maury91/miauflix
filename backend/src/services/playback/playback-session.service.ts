import { createHash, randomBytes } from 'node:crypto';

import type { Quality, VideoCodec } from '@miauflix/source-metadata-extractor';

import type { Database } from '@database/database';
import type { PlaybackGrant } from '@entities/playback-grant.entity';
import type { ConfigService } from '@mytypes/configuration';
import type { PlaybackGrantRepository } from '@repositories/playback-grant.repository';
import type { PlayableRef } from '@routes/playable.types';
import type {
  PlayablePreparationService,
  PlaybackPreferences,
} from '@services/preload/playable-preparation.service';
import type { TorrentWarmupController } from '@services/preload/torrent-warmup.controller';
import type { StorageService } from '@services/storage/storage.service';

export interface PlaybackSessionSource {
  id: number;
  quality: Quality | '3D' | null;
  size: number;
  videoCodec: VideoCodec | null;
  broadcasters: number | null;
  watchers: number | null;
}

export interface PlaybackSession {
  playbackId: string;
  streamingKey: string;
  streamUrl: string;
  source: PlaybackSessionSource;
  preparation: {
    state: 'cold' | 'warm' | 'warming';
    verifiedBytes: number;
    allocatedBytes: number;
  };
  expiresAt: string;
}

export class PlaybackSessionService {
  private readonly grants: PlaybackGrantRepository;
  private readonly ttlMs: number;

  constructor(
    db: Database,
    private readonly preparation: PlayablePreparationService,
    config: ConfigService,
    private readonly warmup?: TorrentWarmupController,
    private readonly storageService?: StorageService
  ) {
    this.grants = db.getPlaybackGrantRepository();
    this.ttlMs = config.getOrThrow('STREAM_TOKEN_EXPIRATION');
  }

  async create(
    userId: string,
    playable: PlayableRef,
    preferences: PlaybackPreferences
  ): Promise<PlaybackSession | null> {
    const prepared = await this.preparation.prepare(playable, {
      through: 'warm',
      preferences,
      workClass: 'interactive',
      ownerKey: this.playableKey(playable),
    });
    if (!prepared.source?.file) return null;
    await this.warmup?.promote(prepared.source, this.playableKey(playable));
    const storage = await this.storageService?.getStorageByMovieSource(prepared.source.id);

    const streamingKey = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.ttlMs);
    await this.grants.create({
      keyHash: this.hash(streamingKey),
      userId,
      sourceId: prepared.source.id,
      playableKind: playable.kind,
      playableKey: this.playableKey(playable),
      expiresAt,
    });

    return {
      playbackId: randomBytes(16).toString('hex'),
      streamingKey,
      streamUrl: `/api/stream/${streamingKey}`,
      source: {
        id: prepared.source.id,
        quality: prepared.source.quality,
        size: prepared.source.size,
        videoCodec: prepared.source.videoCodec,
        broadcasters: prepared.source.broadcasters ?? null,
        watchers: prepared.source.watchers ?? null,
      },
      preparation: {
        state: prepared.state === 'ready' ? 'warm' : 'warming',
        verifiedBytes: storage?.verifiedBytes ?? 0,
        allocatedBytes: storage?.allocatedBytes ?? 0,
      },
      expiresAt: expiresAt.toISOString(),
    };
  }

  async verify(streamingKey: string): Promise<PlaybackGrant | null> {
    return this.grants.findActiveByHash(this.hash(streamingKey));
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private playableKey(playable: PlayableRef): string {
    if (playable.kind === 'movie') return `m:${playable.mediaId}`;
    return `e:${playable.showMediaId}:${playable.seasonNumber}:${playable.episodeNumber}`;
  }
}
