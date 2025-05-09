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
  dataSize = TwentyFourHours,
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
  return function (
    _target: unknown,
    _propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value;
    descriptor.value = async function (...args: unknown[]) {
      // Type assertion for 'this' to satisfy TypeScript
      const self = this as {
        requestQueueCount: number;
        requestSuccesses: number[];
        requestFailures: number[];
        lastRequest: number | null;
      };

      if (typeof self.requestQueueCount !== "number")
        self.requestQueueCount = 0;
      if (!Array.isArray(self.requestSuccesses)) self.requestSuccesses = [];
      if (!Array.isArray(self.requestFailures)) self.requestFailures = [];
      self.requestQueueCount++;
      try {
        const result = await originalMethod.apply(this, args);
        self.lastRequest = Date.now();
        self.requestSuccesses.push(self.lastRequest);
        return result;
      } catch (err) {
        self.lastRequest = Date.now();
        self.requestFailures.push(self.lastRequest);
        throw err;
      } finally {
        self.requestQueueCount = Math.max(0, self.requestQueueCount - 1);
        const cutoff = Date.now() - TwentyFourHours;
        self.requestSuccesses = self.requestSuccesses.filter(
          (t: number) => t >= cutoff,
        );
        self.requestFailures = self.requestFailures.filter(
          (t: number) => t >= cutoff,
        );
      }
    };
    return descriptor;
  };
}
