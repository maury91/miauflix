interface Entry {
  /** Failures in the current window. */
  failures: number;
  /** Attempts that started and have not finished. */
  pending: number;
  windowStart: number;
}

/**
 * Failed logins per account, on top of the per-IP rate limit, so guessing one account's password
 * from many addresses is capped too. After `maxFailures` failures within `windowMs` the account
 * refuses logins (even with the right password) until the window started by the first failure
 * ends. A successful login clears the count. Kept in memory: a restart forgets it.
 *
 * An attempt is reserved by `begin` before the password is checked, so concurrent requests can't
 * all pass the check before any failure is counted: failures plus attempts in flight never exceed
 * `maxFailures`. Every `begin` that returns 0 must be followed by `fail`, `succeed` or `release`.
 *
 * At most `maxEntries` accounts are tracked, and only expired entries make room: an account's
 * block is never dropped for a new email. While every slot holds an active entry, logins for
 * accounts not tracked yet are refused until the oldest window ends, so filling the map can delay
 * other accounts' logins but never lifts a block.
 */
export class LoginThrottle {
  /** Ordered by `windowStart`: an entry whose window restarts moves to the end. */
  private readonly entries = new Map<string, Entry>();

  constructor(
    private readonly maxFailures = 10,
    private readonly windowMs = 15 * 60 * 1000,
    private readonly now: () => number = Date.now,
    private readonly maxEntries = 10_000
  ) {}

  /** Reserves an attempt for `email` and returns 0, or returns the seconds until it may try again. */
  begin(email: string): number {
    const key = this.key(email);
    const entry = this.current(key) ?? this.insert(key);
    if (!entry) return this.secondsUntilFree();
    if (entry.failures >= this.maxFailures) return this.secondsLeft(entry);
    // Attempts in flight could each still fail: wait for them before allowing more.
    if (entry.failures + entry.pending >= this.maxFailures) return 1;
    entry.pending++;
    return 0;
  }

  /** The reserved attempt failed the password check. */
  fail(email: string): void {
    const key = this.key(email);
    // `begin` reserved this attempt, so its entry exists unless its window ran out meanwhile
    const entry = this.current(key) ?? this.start(key);
    entry.pending = Math.max(0, entry.pending - 1);
    if (entry.failures === 0) this.restartWindow(key, entry);
    entry.failures++;
  }

  /** The reserved attempt logged in: the account's failures are forgotten. */
  succeed(email: string): void {
    const key = this.key(email);
    const entry = this.entries.get(key);
    if (!entry) return;
    entry.failures = 0;
    entry.pending = Math.max(0, entry.pending - 1);
    this.dropIfIdle(key, entry);
  }

  /** The reserved attempt ended without a verdict (for example, an error). */
  release(email: string): void {
    const key = this.key(email);
    const entry = this.entries.get(key);
    if (!entry) return;
    entry.pending = Math.max(0, entry.pending - 1);
    this.dropIfIdle(key, entry);
  }

  private key(email: string): string {
    return email.trim().toLowerCase();
  }

  /** The entry for `key`, with its failures reset once the window has ended. */
  private current(key: string): Entry | undefined {
    const entry = this.entries.get(key);
    if (entry && this.expired(entry)) {
      entry.failures = 0;
      if (this.dropIfIdle(key, entry)) return undefined;
      this.restartWindow(key, entry);
    }
    return entry;
  }

  /**
   * Adds an entry if there is room, making it only from expired entries. The map is ordered by
   * window start, so they are all at its front and nothing past the first active one is looked at.
   */
  private insert(key: string): Entry | undefined {
    for (const [oldest, entry] of this.entries) {
      if (this.entries.size < this.maxEntries || !this.expired(entry)) break;
      this.entries.delete(oldest);
      // An attempt still in flight keeps its account tracked, in a new window
      if (entry.pending > 0) {
        entry.failures = 0;
        entry.windowStart = this.now();
        this.entries.set(oldest, entry);
      }
    }
    return this.entries.size < this.maxEntries ? this.start(key) : undefined;
  }

  private start(key: string): Entry {
    const entry = { failures: 0, pending: 0, windowStart: this.now() };
    this.entries.set(key, entry);
    return entry;
  }

  private restartWindow(key: string, entry: Entry): void {
    entry.windowStart = this.now();
    this.entries.delete(key);
    this.entries.set(key, entry);
  }

  private expired(entry: Entry): boolean {
    return entry.windowStart + this.windowMs <= this.now();
  }

  private secondsLeft(entry: Entry): number {
    return Math.max(1, Math.ceil((entry.windowStart + this.windowMs - this.now()) / 1000));
  }

  /** Seconds until the oldest entry expires and frees a slot. */
  private secondsUntilFree(): number {
    const oldest = this.entries.values().next().value;
    return oldest ? this.secondsLeft(oldest) : 1;
  }

  private dropIfIdle(key: string, entry: Entry): boolean {
    if (entry.failures > 0 || entry.pending > 0) return false;
    this.entries.delete(key);
    return true;
  }
}
