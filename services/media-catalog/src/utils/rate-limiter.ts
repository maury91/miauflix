import { logger } from '../logger';

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Sliding-window client-side rate limiter (port of the backend's `RateLimiter`,
 * trimmed to the sliding-window usage the provider client needs).
 */
export class RateLimiter {
  private requestTimestamps: number[] = [];
  private readonly intervalMs: number;

  constructor(
    private readonly limit: number,
    private readonly name = 'rate-limiter'
  ) {
    this.intervalMs = this.limit < 1 ? Math.round(1000 / this.limit) : 1000;
  }

  private filterOldTimestamps(): void {
    const cutoff = Date.now() - this.intervalMs + 1;
    this.requestTimestamps = this.requestTimestamps.filter(timestamp => timestamp > cutoff);
  }

  getDelay(): number {
    const now = Date.now();
    this.filterOldTimestamps();
    if (this.limit < 1) {
      if (this.requestTimestamps.length > 0) {
        const last = this.requestTimestamps[this.requestTimestamps.length - 1];
        return Math.max(0, last + this.intervalMs - now);
      }
    } else if (this.requestTimestamps.length >= this.limit) {
      const oldest = Math.min(...this.requestTimestamps);
      return oldest + this.intervalMs - now;
    }
    return 0;
  }

  async throttle(): Promise<void> {
    const now = Date.now();
    const delayMs = this.getDelay();
    this.requestTimestamps.push(now + delayMs);
    if (delayMs > 0) {
      logger.debug(
        'RateLimiter',
        `[${this.name}] throttling request by ${delayMs}ms (${this.requestTimestamps.length} in window)`
      );
      await sleep(delayMs);
    }
  }
}
