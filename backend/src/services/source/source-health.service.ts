/** How long a failed source is avoided before it may be tried again. */
export const FAILED_SOURCE_MEMORY_MS = 30 * 60_000;

/**
 * Observed source health. Tracker seeder counts can claim a healthy swarm that delivers
 * nothing, and a torrent can turn out to hold no video at all, so playback reports sources
 * that actually failed; selection then avoids them. In memory: a restart simply gives every
 * source another chance.
 */
export class SourceHealthService {
  private readonly failedUntil = new Map<number, number>();
  private readonly listeners = new Set<(sourceId: number) => void>();

  constructor(private readonly memoryMs = FAILED_SOURCE_MEMORY_MS) {}

  /** Record a failure; listeners hear about each source once per failure period. */
  markFailed(sourceId: number, now = Date.now()): void {
    const alreadyFailed = this.hasFailed(sourceId, now);
    this.failedUntil.set(sourceId, now + this.memoryMs);
    if (!alreadyFailed) for (const listener of this.listeners) listener(sourceId);
  }

  hasFailed(sourceId: number, now = Date.now()): boolean {
    const until = this.failedUntil.get(sourceId);
    if (until === undefined) return false;
    if (until > now) return true;
    this.failedUntil.delete(sourceId);
    return false;
  }

  /** Subscribe to newly failed sources; returns the unsubscribe function. */
  onFailed(listener: (sourceId: number) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
