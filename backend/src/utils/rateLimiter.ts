import { sleep } from './time';

export class RateLimiter {
  private requestTimestamps: number[] = [];

  constructor(private readonly limit: number) {}

  /**
   * Calculates the interval in milliseconds based on the rate limit
   * @returns The interval in milliseconds
   */
  private getIntervalMs(): number {
    return this.limit < 1 ? Math.round(1000 / this.limit) : 1000;
  }

  /**
   * Filters out old timestamps based on the current rate limit
   * @returns Filtered timestamps array
   */
  private filterOldTimestamps(): void {
    const intervalMs = this.getIntervalMs() + 1;
    const cutoffTime = Date.now() - intervalMs;
    this.requestTimestamps = this.requestTimestamps.filter(timestamp => timestamp > cutoffTime);
  }

  /**
   * Calculates the delay in milliseconds until the next request can be made
   * @returns The delay in milliseconds
   */
  private calculateDelay(): number {
    const now = Date.now();

    this.filterOldTimestamps();
    if (this.limit < 1) {
      // For fractional rates (e.g., 0.2 req/sec = 1 req every 5 seconds)
      if (this.requestTimestamps.length > 0) {
        const intervalMs = this.getIntervalMs();

        // When calculating the next available slot, we need to consider all previous requests
        // Each request "blocks" a slot for a full interval
        // For example, with a rate limit of 0.2 req/sec:
        // - Request 1 at t=0s blocks until t=5s
        // - Request 2 (throttled) at t=0s, waits until t=5s, then blocks until t=10s
        // - Request 3 at t=2.5s should wait until t=10s (5s after Request 2 completes)

        const lastTimestamp = this.requestTimestamps[this.requestTimestamps.length - 1];

        // The delay is the time until the last slot ends
        return Math.max(0, lastTimestamp + intervalMs - now);
      }
    } else {
      // For standard rates (e.g., 5 req/sec)
      if (this.requestTimestamps.length >= this.limit) {
        // We need to wait until the oldest request expires
        const intervalMs = this.getIntervalMs();
        const oldestRequest = Math.min(...this.requestTimestamps);
        return oldestRequest + intervalMs - now;
      }
    }

    return 0;
  }

  /**
   * Throttles the request by waiting if necessary
   */
  async throttle(): Promise<void> {
    const delayMs = this.calculateDelay();

    this.requestTimestamps.push(Date.now() + delayMs);

    if (delayMs > 0) {
      await sleep(delayMs);
    }
  }

  /**
   * Checks if the request should be rejected without waiting
   * @returns true if the request should be rejected, false otherwise
   */
  shouldReject(): boolean {
    if (this.calculateDelay() > 0) {
      return true;
    }

    this.requestTimestamps.push(Date.now());
    return false;
  }
}
