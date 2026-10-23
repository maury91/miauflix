import { createHash, randomBytes } from 'node:crypto';

import { logger } from '@logger';
import { type Quality, VideoCodec } from '@miauflix/source-metadata-extractor';

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

import {
  AudioConversionRequiredError,
  AudioPlaybackError,
  type AudioPlaybackPreferences,
  type AudioPlaybackService,
  type PlaybackDelivery,
} from './audio-playback.service';

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
  delivery?: PlaybackDelivery;
  episodeMatchKind?: 'combined' | 'single';
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
    private readonly storageService?: StorageService,
    private readonly audioPlaybackService?: AudioPlaybackService
  ) {
    this.grants = db.getPlaybackGrantRepository();
    this.ttlMs = config.getOrThrow('STREAM_TOKEN_EXPIRATION');
  }

  async create(
    userId: string,
    playable: PlayableRef,
    preferences: AudioPlaybackPreferences & PlaybackPreferences,
    options: { deferDownload?: boolean } = {}
  ): Promise<PlaybackSession | null> {
    const prepare = (allowHevc: boolean) =>
      this.preparation.prepare(playable, {
        through: options.deferDownload ? 'sources' : 'warm',
        preferences: { ...preferences, allowHevc },
        workClass: 'interactive',
        ownerKey: this.playableKey(playable),
      });
    let prepared = await prepare(
      preferences.allowHevc ||
        preferences.supportedMseVideoCodecs?.includes('hevc') === true ||
        (this.audioPlaybackService?.canConvertHevc?.() ?? false)
    );
    if (!prepared.source) return null;
    // Each viewer keeps what they started watching; another viewer's claim is independent.
    const ownerKey = `user:${userId}:${this.playableKey(playable)}`;
    if (prepared.target && (prepared.state === 'ready' || prepared.state === 'warming')) {
      await this.warmup?.promote(prepared.target, this.playableKey(playable), ownerKey);
    }
    let delivery: PlaybackDelivery | undefined;
    for (let attempt = 0; !options.deferDownload && attempt < 2; attempt++) {
      const { source, target } = prepared;
      if (!source) return null;
      // Without a resolved file the stream route resolves it later; deliver directly.
      if (!target) break;
      try {
        delivery = await this.audioPlaybackService?.inspect(target, preferences);
        break;
      } catch (error) {
        if (error instanceof AudioConversionRequiredError) {
          logger.warn('PlaybackSessionService', `Source ${source.id}: ${error.message}`);
          if (
            attempt === 0 &&
            (source.videoCodec === VideoCodec.X265 || source.videoCodec === VideoCodec.X265_10BIT)
          ) {
            const fallback = await prepare(false);
            if (fallback.source) {
              prepared = fallback;
              if (prepared.target && prepared.state !== 'cold') {
                await this.warmup?.promote(prepared.target, this.playableKey(playable), ownerKey);
              }
              continue;
            }
          }
          throw new AudioPlaybackError(error.message, 422);
        }
        logger.warn(
          'PlaybackSessionService',
          'Audio inspection failed; using direct delivery',
          error
        );
        break;
      }
    }
    if (!prepared.source) return null;
    const storage = await this.storageService?.getStorageBySource(prepared.source.id);

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
      streamUrl: `/api/stream/${streamingKey}${delivery?.mode === 'audio-transcode' ? '/audio' : ''}`,
      delivery,
      episodeMatchKind:
        prepared.target && prepared.target.matchKind !== 'movie'
          ? prepared.target.matchKind
          : undefined,
      source: {
        id: prepared.source.id,
        quality: prepared.source.quality,
        size: prepared.source.size,
        videoCodec: prepared.source.videoCodec,
        broadcasters: prepared.source.broadcasters ?? null,
        watchers: prepared.source.watchers ?? null,
      },
      preparation: {
        state:
          prepared.state === 'ready' ? 'warm' : prepared.state === 'warming' ? 'warming' : 'cold',
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
