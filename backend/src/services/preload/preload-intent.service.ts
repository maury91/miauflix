import type { IntentLeaseKey, MediaIntentRef, PreloadIntentRequest } from '@routes/playable.types';
import { playableKey } from '@routes/playable.types';

import type { PlayablePreparationService } from './playable-preparation.service';
import type { TorrentWarmupController } from './torrent-warmup.controller';

const LEASE_TTL_MS = 15_000;
type PreparationLevel = 'metadata' | 'warm';

type PreparationEntry =
  | {
      state: 'pending';
      level: PreparationLevel;
      controller: AbortController;
      timer: ReturnType<typeof setTimeout>;
    }
  | { state: 'complete'; level: PreparationLevel };

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
}

/**
 * Owns transient navigation interest. The lease is deliberately in-memory:
 * losing it is safe because catalog/source metadata is durable and payload
 * warming is required to stop when the lease expires.
 */
export class PreloadIntentService {
  private readonly leases = new Map<IntentLeaseKey, PreloadLease>();
  private readonly preparations = new Map<string, PreparationEntry>();
  private readonly cleanupTimer: ReturnType<typeof setInterval>;

  constructor(
    private readonly preparation?: PlayablePreparationService,
    private readonly warmup?: TorrentWarmupController
  ) {
    this.cleanupTimer = setInterval(() => this.expire(), 1_000);
    if (typeof this.cleanupTimer === 'object' && 'unref' in this.cleanupTimer) {
      this.cleanupTimer.unref();
    }
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
    this.reconcile(now);

    return { accepted: true, acceptedSequence: intent.sequence, expiresAt };
  }

  remove(userId: string, sessionId: string, clientId: string, now = Date.now()): boolean {
    this.expire(now);
    const removed = this.leases.delete(this.key(userId, sessionId, clientId));
    this.reconcile(now);
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
    this.warmup?.close();
    this.preparations.clear();
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
        expired = true;
      }
    }
    if (expired) this.reconcile(now);
  }

  private reconcile(now: number): void {
    const wanted = new Map<
      string,
      { playable: Exclude<MediaIntentRef, { kind: 'show' }>; view: PreloadIntentRequest['view'] }
    >();
    for (const lease of this.leases.values()) {
      if (!lease.focused || lease.focused.kind === 'show') continue;
      const key = playableKey(lease.focused);
      if (!wanted.has(key)) wanted.set(key, { playable: lease.focused, view: lease.view });
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
    if (slot && !wanted.has(slot.playableKey)) void this.warmup?.pause(slot.leaseKey);

    if (!this.preparation) return;
    for (const [key, target] of wanted) {
      const level = this.levelForView(target.view);
      const existing = this.preparations.get(key);
      if (existing) {
        if (this.levelRank(existing.level) >= this.levelRank(level)) continue;
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
              preferences: { quality: 'auto', allowHevc: true },
              workClass: level === 'warm' ? 'interactive' : 'background',
              ownerKey: key,
              signal: controller.signal,
            })
            .then(() => {
              const current = this.preparations.get(key);
              if (current?.state === 'pending' && current.controller === controller) {
                this.preparations.set(key, { state: 'complete', level });
              }
            })
            .catch(() => {
              const current = this.preparations.get(key);
              if (current?.state === 'pending' && current.controller === controller) {
                this.preparations.delete(key);
              }
            });
        },
        target.view === 'player' ? 0 : 350
      );
      this.preparations.set(key, { state: 'pending', level, controller, timer });
    }
    void now;
  }

  private levelForView(view: PreloadIntentRequest['view']): PreparationLevel {
    return view === 'details' || view === 'player' ? 'warm' : 'metadata';
  }

  private levelRank(level: PreparationLevel): number {
    return level === 'warm' ? 2 : 1;
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
