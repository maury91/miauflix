const SWEEP_EVERY_MS = 60_000;

interface Bucket {
  tokens: number;
  updatedAt: number;
}

/**
 * One token bucket per key: up to `capacity` at once, refilled at `refillPerSecond`. Full
 * buckets hold nothing a fresh one wouldn't, so they are swept away now and then and the map
 * only holds keys that were active recently.
 */
export class KeyedTokenBucket {
  private readonly buckets = new Map<string, Bucket>();
  private lastSweep: number;

  constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number,
    private readonly now: () => number = Date.now
  ) {
    this.lastSweep = now();
  }

  get size(): number {
    return this.buckets.size;
  }

  /** Takes `cost` tokens from `key`'s bucket; false (taking nothing) when it has too few. */
  take(key: string, cost = 1): boolean {
    const now = this.now();
    if (now - this.lastSweep >= SWEEP_EVERY_MS) this.sweep(now);
    const bucket = this.buckets.get(key) ?? { tokens: this.capacity, updatedAt: now };
    this.refill(bucket, now);
    this.buckets.set(key, bucket);
    if (bucket.tokens < cost) return false;
    bucket.tokens -= cost;
    return true;
  }

  private refill(bucket: Bucket, now: number): void {
    const elapsed = Math.max(0, now - bucket.updatedAt) / 1000;
    bucket.tokens = Math.min(this.capacity, bucket.tokens + elapsed * this.refillPerSecond);
    bucket.updatedAt = now;
  }

  private sweep(now: number): void {
    this.lastSweep = now;
    for (const [key, bucket] of this.buckets) {
      this.refill(bucket, now);
      if (bucket.tokens >= this.capacity) this.buckets.delete(key);
    }
  }
}
