export class RateLimiter {
  private requestTimestamps: number[] = [];

  constructor(private readonly limit: number) {}

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private calculateDelay(): number {
    const now = Date.now();

    this.requestTimestamps = this.requestTimestamps.filter(
      (timestamp) => now - timestamp < 1000,
    );

    if (this.requestTimestamps.length < this.limit) {
      return 0;
    }

    const oldestRequest = this.requestTimestamps[0];
    const timeUntilSlotFrees = oldestRequest + 1000 - now;

    return Math.max(0, timeUntilSlotFrees);
  }

  async throttle(): Promise<void> {
    const delayMs = this.calculateDelay();

    if (delayMs > 0) {
      await this.sleep(delayMs);
    }

    this.requestTimestamps.push(Date.now());
  }
}
