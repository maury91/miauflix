import type { MovieSource } from '@entities/movie-source.entity';
import type { IntentLeaseKey, MediaIntentRef, PreloadIntentRequest } from '@routes/playable.types';
import { playableKey } from '@routes/playable.types';
import type {
  PreloadPreparationSnapshot,
  PreloadPreparationSource,
  PreloadPreparationState,
  PreloadWarmupSnapshot,
  PreloadWarmupState,
} from '@routes/preload.types';

import type { PlayablePreparationService } from './playable-preparation.service';
import type { TorrentWarmupController } from './torrent-warmup.controller';

const LEASE_TTL_MS = 15_000;
const SOURCE_METADATA_CACHE_LIMIT = 256;
type PreparationLevel = 'sources' | 'warm';

interface PreparationDetails {
  source: PreloadPreparationSource | null;
  warmup: PreloadWarmupSnapshot;
}

type PreparationEntry =
  | {
      state: 'complete';
      level: PreparationLevel;
      playable: Exclude<MediaIntentRef, { kind: 'show' }>;
      outcome: Exclude<PreloadPreparationState, 'checking' | 'unknown'>;
      details: PreparationDetails;
    }
  | {
      state: 'pending';
      level: PreparationLevel;
      controller: AbortController;
      timer: ReturnType<typeof setTimeout>;
      playable: Exclude<MediaIntentRef, { kind: 'show' }>;
      details: PreparationDetails;
    };

export interface PreloadLease {
  key: IntentLeaseKey;
  userId: string;
  sessionId: string;
  clientId: string;
  sequence: number;
  view: PreloadIntentRequest['view'];
  focused: MediaIntentRef | null;
  reachable: PreloadIntentRequest['reachable'];
  expiresAt: number;
  createdAt: number;
}

export interface PreloadIntentResult {
  accepted: boolean;
  acceptedSequence: number;
  expiresAt: Date;
  preparation: PreloadPreparationSnapshot | null;
}

/**
 * Owns transient navigation interest. The lease is deliberately in-memory:
 * losing it is safe because catalog/source metadata is durable and payload
 * warming is required to stop when the lease expires.
 */
export class PreloadIntentService {
  private readonly changeListeners = new Set<
    (event: {
      userId: string;
      sessionId: string;
      clientId: string;
      preparation: PreloadPreparationSnapshot | null;
    }) => void
  >();
  private readonly leases = new Map<IntentLeaseKey, PreloadLease>();
  private readonly preparations = new Map<string, PreparationEntry>();
  private readonly sourceMetadataCache = new Map<string, PreloadPreparationSource>();
  private readonly cleanupTimer: ReturnType<typeof setInterval>;
  private readonly onWarmupChange = (slot: { playableKey: string } | null): void => {
    if (slot) {
      this.emitPreparationChangeForKey(slot.playableKey);
      return;
    }
    // Promotion or shutdown can remove the slot entirely. Re-evaluate every
    // focused lease so clients see readiness disappear with the source.
    for (const lease of this.leases.values()) {
      if (lease.focused && lease.focused.kind !== 'show') {
        this.emitChange(lease, this.snapshotForLease(lease));
      }
    }
  };

  constructor(
    private readonly preparation?: PlayablePreparationService,
    private readonly warmup?: TorrentWarmupController
  ) {
    this.cleanupTimer = setInterval(() => this.expire(), 1_000);
    if (typeof this.cleanupTimer === 'object' && 'unref' in this.cleanupTimer) {
      this.cleanupTimer.unref();
    }
    this.warmup?.onChange?.(this.onWarmupChange);
  }

  onChange(
    listener: (event: {
      userId: string;
      sessionId: string;
      clientId: string;
      preparation: PreloadPreparationSnapshot | null;
    }) => void
  ): void {
    this.changeListeners.add(listener);
  }

  offChange(
    listener: (event: {
      userId: string;
      sessionId: string;
      clientId: string;
      preparation: PreloadPreparationSnapshot | null;
    }) => void
  ): void {
    this.changeListeners.delete(listener);
  }

  update(
    userId: string,
    sessionId: string,
    clientId: string,
    intent: PreloadIntentRequest,
    now = Date.now()
  ): PreloadIntentResult {
    this.expire(now);
    const key = this.key(userId, sessionId, clientId);
    const previous = this.leases.get(key);
    const expiresAt = new Date(now + LEASE_TTL_MS);

    if (previous && intent.sequence <= previous.sequence) {
      return {
        accepted: false,
        acceptedSequence: previous.sequence,
        expiresAt: new Date(previous.expiresAt),
        preparation: this.snapshotForLease(previous),
      };
    }

    this.leases.set(key, {
      key,
      userId,
      sessionId,
      clientId,
      sequence: intent.sequence,
      view: intent.view,
      focused: intent.focused,
      reachable: this.dedupeReachable(intent.reachable),
      expiresAt: expiresAt.getTime(),
      createdAt: previous?.createdAt ?? now,
    });
    const requestedLevel = this.levelForView(intent.view);
    const previousPreparation =
      previous?.focused && previous.focused.kind !== 'show'
        ? this.preparations.get(playableKey(previous.focused))
        : undefined;
    this.reconcile(now);
    const previousFocused = previous?.focused;
    const currentFocused = intent.focused;
    const samePlayable =
      previousFocused &&
      previousFocused.kind !== 'show' &&
      currentFocused &&
      currentFocused.kind !== 'show' &&
      playableKey(previousFocused) === playableKey(currentFocused);
    const previousOutcome =
      previousPreparation?.state === 'complete' &&
      samePlayable &&
      this.levelRank(previousPreparation.level) >= this.levelRank(requestedLevel) &&
      (previousPreparation.outcome === 'no_source' || previousPreparation.outcome === 'error')
        ? this.snapshotForEntry(previousPreparation)
        : null;

    return {
      accepted: true,
      acceptedSequence: intent.sequence,
      expiresAt,
      preparation: previousOutcome ?? this.snapshotForLease(this.leases.get(key)),
    };
  }

  remove(
    userId: string,
    sessionId: string,
    clientId: string,
    sequence?: number,
    now = Date.now()
  ): boolean {
    this.expire(now);
    const key = this.key(userId, sessionId, clientId);
    const lease = this.leases.get(key);
    if (lease && (sequence === undefined || lease.sequence !== sequence)) return false;
    const removed = this.leases.delete(key);
    this.reconcile(now);
    if (removed) this.emitChange(lease, null);
    return removed;
  }

  getActive(now = Date.now()): PreloadLease[] {
    this.expire(now);
    return [...this.leases.values()].map(lease => ({
      ...lease,
      reachable: lease.reachable.map(candidate => ({ ...candidate })),
    }));
  }

  close(): void {
    clearInterval(this.cleanupTimer);
    for (const preparation of this.preparations.values()) {
      if (preparation.state === 'pending') {
        clearTimeout(preparation.timer);
        preparation.controller.abort();
      }
    }
    this.warmup?.offChange?.(this.onWarmupChange);
    this.warmup?.close();
    this.preparations.clear();
    this.sourceMetadataCache.clear();
    this.leases.clear();
  }

  private key(userId: string, sessionId: string, clientId: string): IntentLeaseKey {
    return `${userId}:${sessionId}:${clientId}`;
  }

  private expire(now = Date.now()): void {
    let expired = false;
    for (const [key, lease] of this.leases) {
      if (lease.expiresAt <= now) {
        this.leases.delete(key);
        this.emitChange(lease, null);
        expired = true;
      }
    }
    if (expired) this.reconcile(now);
  }

  /**
   * Match preparation work to the highest level requested by each focused playable’s leases.
   * Cancel obsolete work, pause unwanted payloads, and retain selected source metadata on downgrade.
   * Schedule new preparation immediately for the player or after 350 ms otherwise; preparation
   * rejections become error snapshots while preserving any selected source.
   */
  private reconcile(now: number): void {
    const wanted = new Map<
      string,
      { playable: Exclude<MediaIntentRef, { kind: 'show' }>; view: PreloadIntentRequest['view'] }
    >();
    for (const lease of this.leases.values()) {
      if (!lease.focused || lease.focused.kind === 'show') continue;
      const key = playableKey(lease.focused);
      const existing = wanted.get(key);
      if (
        !existing ||
        this.levelRank(this.levelForView(lease.view)) >
          this.levelRank(this.levelForView(existing.view))
      ) {
        wanted.set(key, { playable: lease.focused, view: lease.view });
      }
    }

    for (const [key, preparation] of this.preparations) {
      if (!wanted.has(key)) {
        if (preparation.state === 'pending') {
          clearTimeout(preparation.timer);
          preparation.controller.abort();
        }
        void this.warmup?.pause(key);
        this.preparations.delete(key);
      }
    }

    const slot = this.warmup?.getState();
    if (slot) {
      const target = wanted.get(slot.playableKey);
      if (!target || this.levelForView(target.view) !== 'warm') {
        void this.warmup?.pause(slot.leaseKey);
      }
    }

    if (!this.preparation) return;
    for (const [key, target] of wanted) {
      const level = this.levelForView(target.view);
      const existing = this.preparations.get(key);
      const isDowngrade = existing && this.levelRank(existing.level) > this.levelRank(level);
      const details: PreparationDetails = existing
        ? {
            source: existing.details.source,
            warmup: isDowngrade ? emptyWarmup() : existing.details.warmup,
          }
        : {
            source: this.sourceMetadataCache.get(key) ?? null,
            warmup: emptyWarmup(),
          };
      // A completed warm preparation remains the selected source when a lease
      // downgrades to browse, but its speculative payload is no longer wanted.
      if (existing) {
        if (
          existing.state === 'complete' &&
          existing.outcome === 'source_found' &&
          this.levelRank(existing.level) === this.levelRank(level)
        ) {
          continue;
        }
        if (
          existing.state === 'complete' &&
          existing.outcome === 'source_found' &&
          this.levelRank(existing.level) > this.levelRank(level)
        ) {
          this.preparations.set(key, {
            ...existing,
            level,
            details: { ...details, warmup: emptyWarmup() },
          });
          continue;
        }
        if (
          existing.state === 'pending' &&
          this.levelRank(existing.level) === this.levelRank(level)
        ) {
          continue;
        }
        if (existing.state === 'pending') {
          clearTimeout(existing.timer);
          existing.controller.abort();
        }
        this.preparations.delete(key);
      }
      const controller = new AbortController();
      const timer = setTimeout(
        () => {
          void this.preparation
            ?.prepare(target.playable, {
              through: level,
              // Keep speculative preparation compatible with the default player
              // policy so Watch can promote the same selected source.
              preferences: { quality: 'auto', allowHevc: false },
              // Details preparation is speculative. Keep the explicit Watch
              // request in the interactive lane so it can overtake this work.
              workClass: 'background',
              ownerKey: key,
              signal: controller.signal,
              onSourceSelected: source => {
                const current = this.preparations.get(key);
                if (current?.state === 'pending' && current.controller === controller) {
                  const sourceSnapshot = this.sourceSnapshot(source);
                  this.rememberSource(key, sourceSnapshot);
                  this.preparations.set(key, {
                    ...current,
                    details: {
                      source: sourceSnapshot,
                      warmup: level === 'warm' ? emptyWarmup('warming') : emptyWarmup(),
                    },
                  });
                  this.emitPreparationChangeForKey(key);
                }
              },
            })
            .then(result => {
              const current = this.preparations.get(key);
              if (current?.state === 'pending' && current.controller === controller) {
                const source = result?.source ? this.sourceSnapshot(result.source) : null;
                if (source) this.rememberSource(key, source);
                else this.sourceMetadataCache.delete(key);
                this.preparations.set(key, {
                  state: 'complete',
                  level,
                  playable: target.playable,
                  outcome: result?.source ? 'source_found' : 'no_source',
                  details: {
                    source,
                    warmup: result?.warmup ?? emptyWarmup(),
                  },
                });
                this.emitPreparationChangeForKey(key);
              }
            })
            .catch(() => {
              const current = this.preparations.get(key);
              if (current?.state === 'pending' && current.controller === controller) {
                this.preparations.set(key, {
                  state: 'complete',
                  level,
                  playable: target.playable,
                  outcome: 'error',
                  details: {
                    source: current.details.source,
                    warmup: emptyWarmup(),
                  },
                });
                this.emitPreparationChangeForKey(key);
              }
            });
        },
        target.view === 'player' ? 0 : 350
      );
      this.preparations.set(key, {
        state: 'pending',
        level,
        controller,
        timer,
        playable: target.playable,
        details,
      });
    }
    void now;
  }

  /**
   * Return the focused playable’s preparation, or null for a show or absent focus.
   * Use cached source metadata while checking, or report unknown when preparation is unavailable.
   */
  private snapshotForLease(lease?: PreloadLease): PreloadPreparationSnapshot | null {
    if (!lease?.focused || lease.focused.kind === 'show') return null;
    if (!this.preparation) {
      return {
        playable: lease.focused,
        state: 'unknown',
        source: this.sourceMetadataCache.get(playableKey(lease.focused)) ?? null,
        warmup: emptyWarmup(),
      };
    }
    return (
      this.snapshotForEntry(this.preparations.get(playableKey(lease.focused))) ?? {
        playable: lease.focused,
        state: 'checking',
        source: this.sourceMetadataCache.get(playableKey(lease.focused)) ?? null,
        warmup: emptyWarmup(),
      }
    );
  }

  /** Return a preparation snapshot with live warmup data, or null when no entry exists. */
  private snapshotForEntry(entry?: PreparationEntry): PreloadPreparationSnapshot | null {
    if (!entry) return null;
    if (entry.state === 'pending') {
      return {
        playable: entry.playable,
        state: entry.details.source ? 'source_found' : 'checking',
        source: entry.details.source,
        warmup: this.snapshotWarmup(entry),
      };
    }
    return {
      playable: entry.playable,
      state: entry.outcome,
      source: entry.details.source,
      warmup: this.snapshotWarmup(entry),
    };
  }

  /**
   * Use the current slot’s progress when its playable and selected source match a warm request.
   * Otherwise retain the saved warmup state, except that a completed ready snapshot is reset
   * when no matching live slot remains.
   */
  private snapshotWarmup(entry: PreparationEntry): PreloadWarmupSnapshot {
    const slot = this.warmup?.getState();
    const source = entry.details.source;
    if (
      entry.level === 'warm' &&
      slot &&
      slot.playableKey === playableKey(entry.playable) &&
      (!source || slot.sourceId === source.id)
    ) {
      const state: PreloadWarmupState =
        slot.state === 'ready'
          ? 'ready'
          : slot.state === 'paused'
            ? 'paused'
            : slot.state === 'failed'
              ? 'failed'
              : slot.state === 'warming' ||
                  slot.state === 'adding_torrent' ||
                  slot.state === 'resolving_store'
                ? 'warming'
                : 'not_requested';
      return {
        state,
        progress: slot.progress,
        verifiedBytes: slot.verifiedBytes,
        targetBytes: slot.targetVerifiedBytes,
      };
    }
    if (entry.state === 'complete' && entry.details.warmup.state === 'ready') {
      return emptyWarmup();
    }
    return entry.details.warmup;
  }

  private levelForView(view: PreloadIntentRequest['view']): PreparationLevel {
    return view === 'details' || view === 'player' ? 'warm' : 'sources';
  }

  private levelRank(level: PreparationLevel): number {
    return level === 'warm' ? 2 : 1;
  }

  private sourceSnapshot(source: MovieSource): PreloadPreparationSource {
    return {
      id: source.id,
      quality: source.quality ?? null,
      sourceType: source.sourceType ?? null,
    };
  }

  private rememberSource(key: string, source: PreloadPreparationSource): void {
    this.sourceMetadataCache.delete(key);
    this.sourceMetadataCache.set(key, source);
    while (this.sourceMetadataCache.size > SOURCE_METADATA_CACHE_LIMIT) {
      const oldest = this.sourceMetadataCache.keys().next().value;
      if (oldest === undefined) return;
      this.sourceMetadataCache.delete(oldest);
    }
  }

  private emitChange(
    lease: PreloadLease | undefined,
    preparation: PreloadPreparationSnapshot | null
  ): void {
    if (!lease) return;
    const event = {
      userId: lease.userId,
      sessionId: lease.sessionId,
      clientId: lease.clientId,
      preparation,
    };
    for (const listener of this.changeListeners) listener(event);
  }

  private emitPreparationChangeForKey(key: string): void {
    for (const lease of this.leases.values()) {
      if (lease.focused && lease.focused.kind !== 'show' && playableKey(lease.focused) === key) {
        this.emitChange(lease, this.snapshotForLease(lease));
      }
    }
  }

  private dedupeReachable(reachable: PreloadIntentRequest['reachable']) {
    const unique = new Map<string, PreloadIntentRequest['reachable'][number]>();
    for (const candidate of reachable) {
      const showKey =
        candidate.target.kind === 'show'
          ? `s:${candidate.target.mediaId}`
          : playableKey(candidate.target);
      if (!unique.has(showKey)) unique.set(showKey, candidate);
    }
    return [...unique.values()];
  }
}

export const PRELOAD_LEASE_TTL_MS = LEASE_TTL_MS;

/** Create a warmup state without claiming measured progress or byte counts. */
function emptyWarmup(state: PreloadWarmupState = 'not_requested'): PreloadWarmupSnapshot {
  return { state };
}
