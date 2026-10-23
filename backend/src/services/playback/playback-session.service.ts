import { createHash, randomBytes } from 'node:crypto';

import { logger } from '@logger';
import { type Quality, VideoCodec } from '@miauflix/source-metadata-extractor';

import type { Database } from '@database/database';
import type { PlaybackGrant } from '@entities/playback-grant.entity';
import type { ConfigService } from '@mytypes/configuration';
import type { PlaybackGrantRepository } from '@repositories/playback-grant.repository';
import type { PlayableRef } from '@routes/playable.types';
import type { PlaybackTarget } from '@services/playback/playback-target';
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

/**
 * The delivery found once a session's background probe finishes. `recreate` means the
 * optimistic source cannot play here; the client asks for a new session, which now knows why.
 */
export interface PlaybackDeliveryUpdate {
  userId: string;
  sessionId?: string;
  playbackId: string;
  update:
    | { type: 'delivery'; delivery: PlaybackDelivery; streamUrl: string }
    | { type: 'recreate'; reason: string };
}

export interface PlaybackSession {
  playbackId: string;
  streamingKey: string;
  streamUrl: string;
  delivery?: PlaybackDelivery;
  /** Streams start before the file is probed; the delivery follows over realtime. */
  deliveryPending?: boolean;
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
  private readonly deliveryListeners = new Set<(event: PlaybackDeliveryUpdate) => void>();
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
    options: { deferDownload?: boolean; sessionId?: string } = {}
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
    let pendingTarget: PlaybackTarget | undefined;
    for (let attempt = 0; !options.deferDownload && attempt < 2; attempt++) {
      const { source, target } = prepared;
      if (!source) return null;
      // Without a resolved file the stream route resolves it later; deliver directly.
      if (!target) break;
      try {
        // Only a finished probe is consulted: an unknown file streams directly at once and
        // is probed in the background (see deliverWhenProbed).
        const known = await this.audioPlaybackService?.knownDelivery(target, preferences);
        if (known === null) pendingTarget = target;
        else delivery = known;
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

    const playbackId = randomBytes(16).toString('hex');
    if (pendingTarget) {
      this.deliverWhenProbed(pendingTarget, preferences, {
        userId,
        sessionId: options.sessionId,
        playbackId,
        streamingKey,
      });
    }

    return {
      playbackId,
      streamingKey,
      streamUrl: this.streamUrl(streamingKey, delivery),
      delivery,
      ...(pendingTarget ? { deliveryPending: true } : {}),
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

  /** Subscribe to background probe results; returns the unsubscribe function. */
  onDeliveryUpdate(listener: (event: PlaybackDeliveryUpdate) => void): () => void {
    this.deliveryListeners.add(listener);
    return () => this.deliveryListeners.delete(listener);
  }

  private deliverWhenProbed(
    target: PlaybackTarget,
    preferences: AudioPlaybackPreferences,
    session: { userId: string; sessionId?: string; playbackId: string; streamingKey: string }
  ): void {
    const { streamingKey, ...address } = session;
    const emit = (update: PlaybackDeliveryUpdate['update']) => {
      for (const listener of this.deliveryListeners) listener({ ...address, update });
    };
    void this.audioPlaybackService
      ?.inspect(target, preferences)
      .then(delivery =>
        emit({ type: 'delivery', delivery, streamUrl: this.streamUrl(streamingKey, delivery) })
      )
      .catch(error => {
        if (error instanceof AudioConversionRequiredError) {
          logger.warn('PlaybackSessionService', `Source ${target.source.id}: ${error.message}`);
          emit({ type: 'recreate', reason: error.message });
          return;
        }
        logger.warn(
          'PlaybackSessionService',
          'Audio inspection failed; keeping direct delivery',
          error
        );
      });
  }

  private streamUrl(streamingKey: string, delivery?: PlaybackDelivery): string {
    return `/api/stream/${streamingKey}${delivery?.mode === 'audio-transcode' ? '/audio' : ''}`;
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
