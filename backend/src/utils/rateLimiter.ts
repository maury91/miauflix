import { logger } from '@logger';

import { sleep } from './time';

// Optionally identify this limiter for debugging
export class RateLimiter {
  private requestTimestamps: number[] = [];
  private readonly name: string;
  private readonly intervalMs: number;

  constructor(
    private readonly limit: number,
    name?: string
  ) {
    this.name = name || 'unnamed';
    this.intervalMs = this.limit < 1 ? Math.round(1000 / this.limit) : 1000;
  }

  /**
   * Filters out old timestamps based on the current rate limit
   * @returns Filtered timestamps array
   */
  private filterOldTimestamps(): void {
    const cutoffTime = Date.now() - this.intervalMs + 1;
    this.requestTimestamps = this.requestTimestamps.filter(timestamp => timestamp > cutoffTime);
  }

  /**
   * Calculates the delay in milliseconds until the next request can be made
   * @returns The delay in milliseconds
   */
  public getDelay(): number {
    const now = Date.now();

    this.filterOldTimestamps();
    if (this.limit < 1) {
      // For fractional rates (e.g., 0.2 req/sec = 1 req every 5 seconds)
      if (this.requestTimestamps.length > 0) {
        // When calculating the next available slot, we need to consider all previous requests
        // Each request "blocks" a slot for a full interval
        // For example, with a rate limit of 0.2 req/sec:
        // - Request 1 at t=0s blocks until t=5s
        // - Request 2 (throttled) at t=0s, waits until t=5s, then blocks until t=10s
        // - Request 3 at t=2.5s should wait until t=10s (5s after Request 2 completes)

        const lastTimestamp = this.requestTimestamps[this.requestTimestamps.length - 1];

        logger.debug(
          'RateLimiter',
          `[${this.name}] Request limit reached: ${this.requestTimestamps.length} >= ${this.limit}, lastTimestamp=${new Date(lastTimestamp).toISOString()}, intervalMs=${this.intervalMs}, now=${new Date(now).toISOString()}`
        );
        // The delay is the time until the last slot ends
        return Math.max(0, lastTimestamp + this.intervalMs - now);
      }
    } else {
      // For standard rates (e.g., 5 req/sec)
      if (this.requestTimestamps.length >= this.limit) {
        // We need to wait until the oldest request expires
        const oldestRequest = Math.min(...this.requestTimestamps);
        logger.debug(
          'RateLimiter',
          `[${this.name}] Request limit reached: ${this.requestTimestamps.length} >= ${this.limit}, oldestRequest=${new Date(oldestRequest).toISOString()}, now=${new Date(now).toISOString()}`
        );
        return oldestRequest + this.intervalMs - now;
      }
    }

    return 0;
  }

  /**
   * Throttles the request by waiting if necessary
   */
  async throttle(): Promise<void> {
    const now = Date.now();
    const delayMs = this.getDelay();

    logger.debug(
      'RateLimiter',
      `[${this.name}] throttle() called at ${new Date(now).toISOString()} | delayMs=${delayMs} | queue=[${this.requestTimestamps.join(', ')}] | limit=${this.limit}`
    );

    this.requestTimestamps.push(now + delayMs);

    logger.debug(
      'RateLimiter',
      `[${this.name}] Delaying for ${delayMs}ms (until ${new Date(now + delayMs).toISOString()})`
    );
    if (delayMs > 0) {
      await sleep(delayMs);
      logger.debug(
        'RateLimiter',
        `[${this.name}] Delay finished at ${new Date(Date.now()).toISOString()}`
      );
    }
  }

  /**
   * Checks if the request should be rejected without waiting
   * @returns true if the request should be rejected, false otherwise
   */
  shouldReject(): boolean {
    if (this.getDelay() > 0) {
      return true;
    }

    this.requestTimestamps.push(Date.now());
    return false;
  }
}
