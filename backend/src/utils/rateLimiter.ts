export class RateLimiter {
  private requestTimestamps: number[] = [];

  constructor(private readonly limit: number) {}

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Calculates the interval in milliseconds based on the rate limit
   * @returns The interval in milliseconds
   */
  private getIntervalMs(): number {
    return this.limit < 1 ? Math.round(1000 / this.limit) : 1000;
  }

  /**
   * Filters out old timestamps based on the current rate limit
   * @param now Current timestamp
   * @returns Filtered timestamps array
   */
  private filterOldTimestamps(now: number): number[] {
    const intervalMs = this.getIntervalMs();
    return this.requestTimestamps.filter(timestamp => now - timestamp < intervalMs);
  }

  private calculateDelay(): number {
    const now = Date.now();

    this.requestTimestamps = this.filterOldTimestamps(now);
    if (this.requestTimestamps.length === Math.max(this.limit, 1)) {
      return 0;
    }

    const intervalMs = this.getIntervalMs();
    const oldestRequest = this.requestTimestamps[0];
    const timeUntilSlotFrees = oldestRequest + intervalMs - now;

    return Math.max(0, timeUntilSlotFrees);
  }

  /**
   * Throttles the request by waiting if necessary
   */
  async throttle(): Promise<void> {
    const delayMs = this.calculateDelay();

    if (delayMs > 0) {
      await this.sleep(delayMs);
    }

    this.requestTimestamps.push(Date.now());
  }

  /**
   * Checks if the request should be rejected without waiting
   * @returns true if the request should be rejected, false otherwise
   */
  shouldReject(): boolean {
    const now = Date.now();

    // Filter out old timestamps
    this.requestTimestamps = this.filterOldTimestamps(now);

    const result =
      this.limit < 1
        ? // For fractional limits (e.g., 0.2 requests per second = 1 request every 5 seconds)
          this.requestTimestamps.length > 0
        : // For regular limits (e.g., 5 requests per second)
          this.requestTimestamps.length >= this.limit;
    this.requestTimestamps.push(Date.now());
    return result;
  }
}
