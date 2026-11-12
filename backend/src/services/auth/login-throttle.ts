/**
 * Failed logins per account, on top of the per-IP rate limit, so guessing one account's password
 * from many addresses is capped too. After `maxFailures` failures within `windowMs` the account
 * refuses logins (even with the right password) until the window started by the first failure
 * ends. A successful login clears the count. Kept in memory: a restart forgets it.
 */
export class LoginThrottle {
  private readonly failures = new Map<string, { count: number; windowStart: number }>();

  constructor(
    private readonly maxFailures = 10,
    private readonly windowMs = 15 * 60 * 1000,
    private readonly now: () => number = Date.now
  ) {}

  /** Seconds until `email` may try again, or 0 when it may now. */
  retryAfter(email: string): number {
    const entry = this.current(this.key(email));
    if (!entry || entry.count < this.maxFailures) return 0;
    return Math.ceil((entry.windowStart + this.windowMs - this.now()) / 1000);
  }

  recordFailure(email: string): void {
    const key = this.key(email);
    const entry = this.current(key);
    if (entry) entry.count++;
    else {
      this.prune();
      this.failures.set(key, { count: 1, windowStart: this.now() });
    }
  }

  recordSuccess(email: string): void {
    this.failures.delete(this.key(email));
  }

  private key(email: string): string {
    return email.trim().toLowerCase();
  }

  private current(key: string) {
    const entry = this.failures.get(key);
    if (entry && entry.windowStart + this.windowMs <= this.now()) {
      this.failures.delete(key);
      return undefined;
    }
    return entry;
  }

  /** Bounds the map when many distinct emails are tried. */
  private prune(): void {
    if (this.failures.size < 10_000) return;
    for (const key of this.failures.keys()) this.current(key);
  }
}
