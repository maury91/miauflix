import type { Api } from './api.util';

const FiveMinutes = 5 * 60 * 1000;
const TwentyFourHours = 24 * 60 * 60 * 1000;

interface TimeBucket {
  time: number;
  count: number;
}

/**
 * Groups an array of timestamps into buckets of a given size (ms),
 * starting from 24h ago to now, for use in status reporting.
 * Returns sorted array of { time, count }.
 */
export function groupTimestampsByInterval(
  timestamps: number[],
  bucketSize = FiveMinutes,
  dataSize = TwentyFourHours
): TimeBucket[] {
  const now = Date.now();
  const start = Math.floor((now - dataSize) / bucketSize) * bucketSize;
  const buckets: Record<number, number> = {};
  for (const t of timestamps) {
    if (t < start) continue;
    const bucket = Math.floor((t - start) / bucketSize) * bucketSize + start;
    buckets[bucket] = (buckets[bucket] || 0) + 1;
  }
  return Object.entries(buckets)
    .map(([time, count]): TimeBucket => ({ time: Number(time), count }))
    .sort((a, b) => a.time - b.time);
}

/**
 * Decorator to track API request status for TMDBApi methods.
 * Updates queue, success/failure counts, and last request timestamp.
 */
export function TrackStatus() {
  return function <This extends Api>(
    _target: unknown,
    _propertyKey: string | symbol,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    descriptor.value = async function (this: This, ...args: unknown[]) {
      if (typeof this.requestQueueCount !== 'number') this.requestQueueCount = 0;
      if (!Array.isArray(this.requestSuccesses)) this.requestSuccesses = [];
      if (!Array.isArray(this.requestFailures)) this.requestFailures = [];
      this.requestQueueCount++;
      try {
        const result = await originalMethod.apply(this, args);
        this.lastRequest = Date.now();
        this.requestSuccesses.push(this.lastRequest);
        return result;
      } catch (err) {
        this.lastRequest = Date.now();
        this.requestFailures.push(this.lastRequest);
        throw err;
      } finally {
        this.requestQueueCount = Math.max(0, this.requestQueueCount - 1);
        const cutoff = Date.now() - TwentyFourHours;
        this.requestSuccesses = this.requestSuccesses.filter((t: number) => t >= cutoff);
        this.requestFailures = this.requestFailures.filter((t: number) => t >= cutoff);
      }
    };
    return descriptor;
  };
}
