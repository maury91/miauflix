interface Window {
  count: number;
  resetAt: number;
}

/** Fixed-window counter per key (a client IP): `take` is false once a key used up its window. */
export class RateLimiter {
  private readonly windows = new Map<string, Window>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number
  ) {}

  take(key: string): boolean {
    const now = this.now();
    const window = this.windows.get(key);
    if (!window || window.resetAt <= now) {
      this.windows.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    window.count += 1;
    return window.count <= this.limit;
  }

  /** Drop the windows that ended, so idle clients don't pile up. */
  sweep(): void {
    const now = this.now();
    for (const [key, window] of this.windows) {
      if (window.resetAt <= now) this.windows.delete(key);
    }
  }
}
