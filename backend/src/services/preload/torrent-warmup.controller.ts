import type { MovieSource } from '@entities/movie-source.entity';
import type { WarmupResult } from '@services/download/download.service';

export type WarmState =
  | 'adding_torrent'
  | 'evicted'
  | 'failed'
  | 'idle'
  | 'paused'
  | 'ready'
  | 'resolving_store'
  | 'warming';

export interface WarmSlot {
  generation: number;
  leaseKey: string;
  playableKey: string;
  sourceId: number;
  state: WarmState;
  targetVerifiedBytes: number;
  verifiedBytesAtStart: number;
  startedAt: number;
  range?: Pick<WarmupResult, 'firstPiece' | 'lastPiece'>;
}

export interface TorrentWarmupDriver {
  warmSource(
    source: MovieSource,
    targetBytes: number,
    speculativeExpiresAt?: Date | null
  ): Promise<WarmupResult>;
  pauseSource(sourceId: number): Promise<boolean>;
  promoteSource(source: MovieSource): Promise<boolean>;
  hasActivePlayback(): boolean;
  isPlaybackActive(sourceId: number): boolean;
  isRangeVerified?(sourceId: number, firstPiece: number, lastPiece: number): Promise<boolean>;
}

const DEFAULT_TARGET_BYTES = 64 * 1024 * 1024;

/**
 * Serializes only slot transitions. The torrent itself downloads outside the
 * mutex, so a slow peer cannot block a Watch request or a later replacement.
 */
export class TorrentWarmupController {
  private slot: WarmSlot | null = null;
  private generation = 0;
  private transition: Promise<void> = Promise.resolve();
  private readinessTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly driver: TorrentWarmupDriver) {}

  getState(): WarmSlot | null {
    return this.slot ? { ...this.slot, range: this.slot.range && { ...this.slot.range } } : null;
  }

  async warm(
    source: MovieSource,
    leaseKey: string,
    playableKey: string,
    options: { targetBytes?: number; speculativeExpiresAt?: Date | null } = {}
  ): Promise<WarmSlot> {
    return this.withTransition(async () => {
      if (this.driver.hasActivePlayback()) {
        if (this.slot) {
          if (
            this.slot.state !== 'paused' &&
            !this.driver.isPlaybackActive(this.slot.sourceId) &&
            (await this.driver.pauseSource(this.slot.sourceId))
          ) {
            this.cancelReadinessCheck();
            this.slot = { ...this.slot, state: 'paused' };
          }
          return this.getState()!;
        }
        return {
          generation: this.generation,
          leaseKey,
          playableKey,
          sourceId: source.id,
          state: 'paused',
          targetVerifiedBytes: options.targetBytes ?? DEFAULT_TARGET_BYTES,
          verifiedBytesAtStart: 0,
          startedAt: Date.now(),
        };
      }
      if (
        this.slot?.sourceId === source.id &&
        this.slot.leaseKey === leaseKey &&
        ['adding_torrent', 'resolving_store', 'warming', 'ready'].includes(this.slot.state)
      ) {
        return this.getState()!;
      }

      const previous = this.slot;
      if (previous && previous.state !== 'paused' && previous.state !== 'evicted') {
        this.cancelReadinessCheck();
        if (!this.driver.isPlaybackActive(previous.sourceId)) {
          await this.driver.pauseSource(previous.sourceId);
        }
        if (this.slot?.generation === previous.generation) {
          this.slot = { ...previous, state: 'paused' };
        }
      }

      const generation = ++this.generation;
      this.slot = {
        generation,
        leaseKey,
        playableKey,
        sourceId: source.id,
        state: 'resolving_store',
        targetVerifiedBytes: options.targetBytes ?? DEFAULT_TARGET_BYTES,
        verifiedBytesAtStart: 0,
        startedAt: Date.now(),
      };

      try {
        this.slot.state = 'adding_torrent';
        const result = await this.driver.warmSource(
          source,
          this.slot.targetVerifiedBytes,
          options.speculativeExpiresAt
        );
        if (this.slot?.generation !== generation) {
          await this.driver.pauseSource(source.id);
          return this.getState()!;
        }
        this.slot = { ...this.slot, state: 'warming', range: result };
        if (this.driver.isRangeVerified) {
          if (
            (await this.driver.isRangeVerified(source.id, result.firstPiece, result.lastPiece)) &&
            this.slot?.generation === generation &&
            this.slot.state === 'warming'
          ) {
            this.slot = { ...this.slot, state: 'ready' };
          } else {
            this.scheduleReadinessCheck(generation, source.id, result);
          }
        }
        return this.getState()!;
      } catch (error) {
        if (this.slot?.generation === generation) {
          this.cancelReadinessCheck();
          this.slot = { ...this.slot, state: 'failed' };
        }
        throw error;
      }
    });
  }

  async pause(leaseKey: string, expectedGeneration?: number): Promise<boolean> {
    return this.withTransition(async () => {
      if (!this.slot || this.slot.leaseKey !== leaseKey) return false;
      if (expectedGeneration !== undefined && this.slot.generation !== expectedGeneration) {
        return false;
      }
      const paused = this.driver.isPlaybackActive(this.slot.sourceId)
        ? false
        : await this.driver.pauseSource(this.slot.sourceId);
      if (paused) {
        this.cancelReadinessCheck();
        this.slot = { ...this.slot, state: 'paused' };
      }
      return paused;
    });
  }

  /** Promote the exact source currently selected for this playable. */
  async promote(source: MovieSource, playableKey: string): Promise<boolean> {
    return this.withTransition(async () => {
      if (this.slot && this.slot.playableKey === playableKey && this.slot.sourceId !== source.id) {
        return false;
      }
      const promoted = await this.driver.promoteSource(source);
      if (promoted && this.slot?.sourceId === source.id) {
        this.cancelReadinessCheck();
        this.slot = null;
      }
      return promoted;
    });
  }

  close(): void {
    this.cancelReadinessCheck();
    const slot = this.slot;
    this.slot = null;
    if (slot) void this.driver.pauseSource(slot.sourceId);
  }

  private async withTransition<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.transition;
    let release!: () => void;
    this.transition = new Promise<void>(resolve => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  private scheduleReadinessCheck(
    generation: number,
    sourceId: number,
    range: Pick<WarmupResult, 'firstPiece' | 'lastPiece'>
  ): void {
    this.cancelReadinessCheck();
    const check = async (): Promise<void> => {
      if (
        !this.slot ||
        this.slot.generation !== generation ||
        this.slot.state !== 'warming' ||
        !this.driver.isRangeVerified
      ) {
        return;
      }
      try {
        if (
          (await this.driver.isRangeVerified(sourceId, range.firstPiece, range.lastPiece)) &&
          this.slot?.generation === generation &&
          this.slot.state === 'warming'
        ) {
          this.slot = { ...this.slot, state: 'ready' };
          this.readinessTimer = null;
          return;
        }
      } catch {
        // A transient progress read should leave the slot warming and retry.
      }
      this.readinessTimer = setTimeout(() => void check(), 250);
    };
    void check();
  }

  private cancelReadinessCheck(): void {
    if (this.readinessTimer) clearTimeout(this.readinessTimer);
    this.readinessTimer = null;
  }
}

export const PRELOAD_WARM_TARGET_BYTES = DEFAULT_TARGET_BYTES;
