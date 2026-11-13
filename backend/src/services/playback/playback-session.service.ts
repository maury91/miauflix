import { createHash, randomBytes } from 'node:crypto';

import { logger } from '@logger';
import { type Quality, VideoCodec } from '@miauflix/source-metadata-extractor';

import type { Database } from '@database/database';
import type { PlaybackGrant } from '@entities/playback-grant.entity';
import type { ConfigService } from '@mytypes/configuration';
import type { ContentSourceRepository } from '@repositories/content-source.repository';
import type { PlaybackGrantRepository } from '@repositories/playback-grant.repository';
import type { ProgressRepository } from '@repositories/progress.repository';
import type { PlayableRef } from '@routes/playable.types';
import type { MediaLoadClientService } from '@services/media-load/media-load-client.service';
import type { PlaybackTarget } from '@services/playback/playback-target';
import type {
  PlayablePreparationService,
  PlaybackPreferences,
  SourceAttempt,
} from '@services/preload/playable-preparation.service';
import type { SourceWarmupController } from '@services/preload/source-warmup.controller';
import { findResumeFraction } from '@services/progress/resume-fraction';
import type { SourceHealthService } from '@services/source/source-health.service';

import {
  AudioConversionRequiredError,
  AudioPlaybackError,
  type AudioPlaybackPreferences,
  type AudioPlaybackService,
  type PlaybackDelivery,
} from './audio-playback.service';
import { assessSwarm, type SwarmSample } from './swarm-health';

/** How often live sessions' sources are sampled. */
const HEALTH_SAMPLE_MS = 1_000;
const SAMPLE_HISTORY = 15;
/** A session whose stream has not opened yet is watched this long (it may be waiting on metadata). */
const STARTUP_WINDOW_MS = 60_000;
/**
 * Uninterrupted streaming without starving that proves a source plays; it is then recorded once
 * per session as a ranking signal.
 */
const PROVEN_PLAY_MS = 180_000;
/**
 * A stream that delivers nothing for this long (backpressure, pause) starts its proof over; the
 * proof only completes when bytes are still reaching the viewer at its end.
 */
const PROVEN_PLAY_DELIVERY_MS = 30_000;
/** The primary must deliver this long before its backup torrent is released. */
const HEDGE_RELEASE_MS = 10_000;
/** Bitrate assumed before a file's size is known. */
const DEFAULT_REQUIRED_BYTES_PER_SECOND = 512 * 1024;
const DEFAULT_DURATION_SECONDS = { movie: 7_200, episode: 2_700 } as const;

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

/** A session that may still be playing, for per-playback pushes. */
export interface LivePlayback {
  playbackId: string;
  userId: string;
  sessionId?: string;
  sourceId: number;
  /** The played file; unknown until the stream route resolves it. */
  filePath?: string;
}

/** A candidate source being checked while a viewer waits for playback to start. */
export interface PlaybackSourceAttempt {
  userId: string;
  sessionId?: string;
  playable: PlayableRef;
  attempt: SourceAttempt;
}

/** No session could be created: no source exists, or every source proved fake. */
export class PlaybackUnavailableError extends Error {
  constructor(readonly reason: 'exhausted' | 'not_found') {
    super(
      reason === 'exhausted'
        ? 'Every source found for this title is fake'
        : 'No playable source available'
    );
  }
}

/** Waits before inspecting a playing source's audio again after a failed inspection. */
const INSPECTION_RETRY_DELAYS_MS = [5_000, 15_000];

interface LiveSession {
  sourceId: number;
  userId: string;
  sessionId?: string;
  expiresAt: number;
  createdAt: number;
  playable: PlayableRef;
  /** The preferences the session's source was selected with, reused for its backup. */
  preferences: PlaybackPreferences;
  filePath?: string;
  durationSeconds?: number;
  samples: SwarmSample[];
  healthySince?: number;
  /**
   * When the current unstarved, delivering stretch began; cleared when the stream starves,
   * closes, or delivers nothing for PROVEN_PLAY_DELIVERY_MS.
   */
  provenSince?: number;
  /** The source was recorded as proven playable for this session. */
  provenRecorded?: boolean;
  /** A second source warming in case this one fails; `sourceId` once its claim exists. */
  hedge?: { ownerKey: string; sourceId?: number };
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
  /** Which of the compatible sources this session plays. */
  sourceAttempt?: { position: number; total: number };
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
  private readonly attemptListeners = new Set<(event: PlaybackSourceAttempt) => void>();
  /** Sessions that may still be streaming, so a failed source can move them elsewhere. */
  private readonly liveSessions = new Map<string, LiveSession>();
  private healthTimer: ReturnType<typeof setInterval> | undefined;
  private checkingHealth = false;
  private readonly ttlMs: number;

  constructor(
    db: Database,
    private readonly preparation: PlayablePreparationService,
    config: ConfigService,
    private readonly warmup?: SourceWarmupController,
    private readonly storage?: Pick<MediaLoadClientService, 'getStorageState'>,
    private readonly audioPlaybackService?: AudioPlaybackService,
    private readonly sourceHealth?: Pick<SourceHealthService, 'markFailed' | 'onFailed'>,
    private readonly downloads?: Pick<
      MediaLoadClientService,
      'getPlaybackHealth' | 'getWarmupTargetBytes' | 'releaseClaims' | 'warmSource'
    >,
    private readonly progress?: Pick<ProgressRepository, 'findByKey'>,
    private readonly playedSources?: Pick<ContentSourceRepository, 'recordPlayed'>
  ) {
    this.grants = db.getPlaybackGrantRepository();
    this.ttlMs = config.getOrThrow('STREAM_TOKEN_EXPIRATION');
    sourceHealth?.onFailed(sourceId => this.failOver(sourceId));
  }

  async create(
    userId: string,
    playable: PlayableRef,
    preferences: AudioPlaybackPreferences & PlaybackPreferences,
    options: {
      avoidSourceIds?: readonly number[];
      deferDownload?: boolean;
      sessionId?: string;
    } = {}
  ): Promise<PlaybackSession | null> {
    // Warm where the player will resume, as the details warmup did, not over it from the start.
    const resumeFraction = options.deferDownload
      ? undefined
      : await findResumeFraction(this.progress, userId, playable);
    let lastAttempt: SourceAttempt | undefined;
    const prepare = (allowHevc: boolean) =>
      this.preparation.prepare(playable, {
        through: options.deferDownload ? 'sources' : 'warm',
        ...(resumeFraction ? { resumeFraction } : {}),
        ...(options.avoidSourceIds ? { avoidSourceIds: options.avoidSourceIds } : {}),
        preferences: { ...preferences, allowHevc },
        workClass: 'interactive',
        ownerKey: this.playableKey(playable),
        onSourceAttempt: attempt => {
          lastAttempt = attempt;
          if (options.deferDownload) return;
          for (const listener of this.attemptListeners)
            listener({ userId, sessionId: options.sessionId, playable, attempt });
        },
      });
    let allowHevc =
      preferences.allowHevc ||
      preferences.supportedMseVideoCodecs?.includes('hevc') === true ||
      (this.audioPlaybackService?.canConvertHevc?.() ?? false);
    let prepared = await prepare(allowHevc);
    if (prepared.exhausted) throw new PlaybackUnavailableError('exhausted');
    if (!prepared.source) return null;
    // Each viewer keeps what they started watching; another viewer's claim is independent.
    const ownerKey = this.watchOwnerKey(userId, playable);
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
              allowHevc = false;
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
    // Download state is informational here: an unreachable engine reports nothing stored.
    const storage = await this.storage?.getStorageState(prepared.source.id).catch(() => null);

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
    this.rememberSession(playbackId, {
      sourceId: prepared.source.id,
      userId,
      sessionId: options.sessionId,
      expiresAt: expiresAt.getTime(),
      createdAt: Date.now(),
      playable,
      preferences: { ...preferences, allowHevc },
      filePath: prepared.target?.filePath,
      durationSeconds: delivery?.durationSeconds,
      samples: [],
    });
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
      ...(lastAttempt?.sourceId === prepared.source.id
        ? { sourceAttempt: { position: lastAttempt.position, total: lastAttempt.total } }
        : {}),
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

  private rememberSession(playbackId: string, session: LiveSession): void {
    const now = Date.now();
    for (const [id, live] of this.liveSessions) if (live.expiresAt <= now) this.forget(id, live);
    this.liveSessions.set(playbackId, session);
    if (this.downloads && !this.healthTimer) {
      this.healthTimer = setInterval(() => {
        void this.checkHealth().catch(error =>
          logger.warn('PlaybackSessionService', 'Playback health check failed', error)
        );
      }, HEALTH_SAMPLE_MS);
      this.healthTimer.unref?.();
    }
  }

  private forget(playbackId: string, live: LiveSession): void {
    this.liveSessions.delete(playbackId);
    this.releaseHedge(live);
  }

  /**
   * Judge each watched source from what its viewers experience. A weak source gets a backup
   * warming in parallel; a failed one is reported, which moves its viewers to another source.
   */
  async checkHealth(now = Date.now()): Promise<void> {
    if (!this.downloads || this.checkingHealth) return;
    this.checkingHealth = true;
    try {
      for (const [playbackId, live] of [...this.liveSessions]) {
        if (live.expiresAt <= now) {
          this.forget(playbackId, live);
          continue;
        }
        const health = await this.downloads
          .getPlaybackHealth(live.sourceId, live.filePath)
          .catch(error => {
            logger.debug(
              'PlaybackSessionService',
              `Could not sample source ${live.sourceId}`,
              error
            );
            return null;
          });
        if (!health || health.local) continue;
        const startup = health.lastDeliveryAt === null || health.lastDeliveryAt < live.createdAt;
        // Before the stream opens, only a missing file list can be what the viewer waits on.
        const watched =
          health.streaming ||
          (startup && !health.hasMetadata && now - live.createdAt < STARTUP_WINDOW_MS);
        if (!watched) {
          live.provenSince = undefined;
          continue;
        }
        live.samples.push({ at: now, peers: health.peers, downloadSpeed: health.downloadSpeed });
        if (live.samples.length > SAMPLE_HISTORY) live.samples.shift();
        const starvedSince = startup ? live.createdAt : health.blockedSince;
        if (starvedSince === null) {
          live.healthySince ??= now;
          this.trackProvenPlay(live, health.lastDeliveryAt, now);
          if (live.hedge && now - live.healthySince >= HEDGE_RELEASE_MS) this.releaseHedge(live);
          continue;
        }
        live.healthySince = undefined;
        live.provenSince = undefined;
        const verdict = assessSwarm({
          samples: live.samples,
          starvedForMs: now - starvedSince,
          requiredBytesPerSecond: this.requiredRate(live, health.fileLength),
          hedging: Boolean(live.hedge),
        });
        if (verdict === 'weak' && !live.hedge)
          this.startHedge(playbackId, live, health.readFraction);
        else if (verdict === 'failed') this.sourceHealth?.markFailed(live.sourceId);
      }
    } finally {
      this.checkingHealth = false;
      if (!this.liveSessions.size && this.healthTimer) {
        clearInterval(this.healthTimer);
        this.healthTimer = undefined;
      }
    }
  }

  /**
   * Measure the unstarved stretch in elapsed time, up to the latest delivery, so a stalled reader
   * adds nothing and sparse samples or bursty reads do not slow the proof down.
   */
  private trackProvenPlay(live: LiveSession, lastDeliveryAt: number | null, now: number): void {
    if (lastDeliveryAt === null || now - lastDeliveryAt > PROVEN_PLAY_DELIVERY_MS) {
      live.provenSince = undefined;
      return;
    }
    live.provenSince ??= now;
    if (!live.provenRecorded && lastDeliveryAt - live.provenSince >= PROVEN_PLAY_MS)
      this.recordProvenPlay(live, now);
  }

  /**
   * Remember that the source streamed well, as a ranking boost for later selections. Best effort:
   * a failed write is logged and never reaches playback.
   */
  private recordProvenPlay(live: LiveSession, now: number): void {
    live.provenRecorded = true;
    if (!this.playedSources) return;
    Promise.resolve()
      .then(() => this.playedSources!.recordPlayed(live.sourceId, now))
      .catch(error =>
        logger.warn(
          'PlaybackSessionService',
          `Could not record source ${live.sourceId} as played`,
          error
        )
      );
  }

  private requiredRate(live: LiveSession, fileLength: number | null): number {
    if (!fileLength) return DEFAULT_REQUIRED_BYTES_PER_SECOND;
    return fileLength / (live.durationSeconds ?? DEFAULT_DURATION_SECONDS[live.playable.kind]);
  }

  /**
   * Warm the next-best source where the viewer is reading (`readFraction` of the file, 0 before
   * the first seek or read past the header) so a fail-over starts on warm data.
   */
  private startHedge(playbackId: string, live: LiveSession, readFraction: number | null): void {
    const downloads = this.downloads;
    if (!downloads) return;
    const hedge: NonNullable<LiveSession['hedge']> = { ownerKey: `hedge:${playbackId}` };
    live.hedge = hedge;
    void this.preparation
      .prepare(live.playable, {
        through: 'warm',
        resolveOnly: true,
        avoidSourceIds: [live.sourceId],
        preferences: live.preferences,
        workClass: 'background',
        ownerKey: hedge.ownerKey,
      })
      .then(async prepared => {
        if (!prepared.target || live.hedge !== hedge) return;
        await downloads.warmSource(
          prepared.target,
          downloads.getWarmupTargetBytes(),
          hedge.ownerKey,
          readFraction ?? 0
        );
        hedge.sourceId = prepared.target.source.id;
        logger.info(
          'PlaybackSessionService',
          `Source ${live.sourceId} is weak; warming source ${hedge.sourceId} as a backup`
        );
        // Released while it was starting: drop the claim it just made.
        if (live.hedge !== hedge) this.releaseClaim(hedge);
      })
      .catch(error =>
        logger.warn('PlaybackSessionService', `Backup for ${playbackId} could not start`, error)
      );
  }

  private releaseHedge(live: LiveSession): void {
    const hedge = live.hedge;
    live.hedge = undefined;
    if (hedge) this.releaseClaim(hedge);
  }

  private releaseClaim(hedge: NonNullable<LiveSession['hedge']>): void {
    if (hedge.sourceId === undefined) return;
    void this.downloads
      ?.releaseClaims(hedge.sourceId, hedge.ownerKey, 'warmup')
      .catch(error => logger.warn('PlaybackSessionService', 'Failed to release backup', error));
  }

  /**
   * A failed source will not recover quickly: move its viewers to a new session and source, and
   * stop keeping the failed source for them, so it stops downloading next to the replacement.
   */
  private failOver(sourceId: number): void {
    const now = Date.now();
    const released = new Set<string>();
    for (const [playbackId, live] of this.liveSessions) {
      if (live.sourceId !== sourceId) continue;
      // The backup's claim is kept: the new session most likely starts on it.
      this.liveSessions.delete(playbackId);
      const ownerKey = this.watchOwnerKey(live.userId, live.playable);
      if (!released.has(ownerKey)) {
        released.add(ownerKey);
        void this.downloads
          ?.releaseClaims(sourceId, ownerKey, 'watched')
          .catch(error =>
            logger.warn(
              'PlaybackSessionService',
              `Failed to release failed source ${sourceId}`,
              error
            )
          );
      }
      if (live.expiresAt <= now) continue;
      logger.warn('PlaybackSessionService', `Source ${sourceId} failed; recreating ${playbackId}`);
      for (const listener of this.deliveryListeners) {
        listener({
          userId: live.userId,
          sessionId: live.sessionId,
          playbackId,
          update: { type: 'recreate', reason: 'The source stopped delivering data.' },
        });
      }
    }
  }

  /** Unexpired sessions: who watches which file of which source. */
  livePlaybacks(now = Date.now()): LivePlayback[] {
    const playbacks: LivePlayback[] = [];
    for (const [playbackId, live] of this.liveSessions)
      if (live.expiresAt > now)
        playbacks.push({
          playbackId,
          userId: live.userId,
          sessionId: live.sessionId,
          sourceId: live.sourceId,
          filePath: live.filePath,
        });
    return playbacks;
  }

  /** Subscribe to the candidates tried while sessions are created; returns the unsubscribe. */
  onSourceAttempt(listener: (event: PlaybackSourceAttempt) => void): () => void {
    this.attemptListeners.add(listener);
    return () => this.attemptListeners.delete(listener);
  }

  /** Subscribe to background probe results; returns the unsubscribe function. */
  onDeliveryUpdate(listener: (event: PlaybackDeliveryUpdate) => void): () => void {
    this.deliveryListeners.add(listener);
    return () => this.deliveryListeners.delete(listener);
  }

  private deliverWhenProbed(
    target: PlaybackTarget,
    preferences: AudioPlaybackPreferences,
    session: { userId: string; sessionId?: string; playbackId: string; streamingKey: string },
    attempt = 0
  ): void {
    const { streamingKey, ...address } = session;
    const emit = (update: PlaybackDeliveryUpdate['update']) => {
      for (const listener of this.deliveryListeners) listener({ ...address, update });
    };
    void this.audioPlaybackService
      ?.inspect(target, preferences)
      .then(delivery => {
        const live = this.liveSessions.get(address.playbackId);
        if (live) live.durationSeconds = delivery.durationSeconds;
        emit({ type: 'delivery', delivery, streamUrl: this.streamUrl(streamingKey, delivery) });
      })
      .catch(error => {
        if (error instanceof AudioConversionRequiredError) {
          logger.warn('PlaybackSessionService', `Source ${target.source.id}: ${error.message}`);
          emit({ type: 'recreate', reason: error.message });
          return;
        }
        // A source just switched to can fail its first reads: inspect again while it plays.
        const retryIn = INSPECTION_RETRY_DELAYS_MS[attempt];
        const live = this.liveSessions.get(address.playbackId);
        const permanent = error instanceof AudioPlaybackError && error.status === 422;
        if (!permanent && retryIn !== undefined && live && live.expiresAt > Date.now()) {
          logger.warn(
            'PlaybackSessionService',
            `Audio inspection failed; retrying in ${retryIn / 1000}s`,
            error
          );
          setTimeout(() => {
            if (this.liveSessions.get(address.playbackId) === live)
              this.deliverWhenProbed(target, preferences, session, attempt + 1);
          }, retryIn).unref();
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

  /** Owner of the `watched` claim that keeps a viewer's source downloading. */
  private watchOwnerKey(userId: string, playable: PlayableRef): string {
    return `user:${userId}:${this.playableKey(playable)}`;
  }

  private playableKey(playable: PlayableRef): string {
    if (playable.kind === 'movie') return `m:${playable.mediaId}`;
    return `e:${playable.showMediaId}:${playable.seasonNumber}:${playable.episodeNumber}`;
  }
}
