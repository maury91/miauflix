interface CacheEntry<T> {
  data: T;
  expiresAt: number; // timestamp
}

export class InMemoryCache<T> {
  private readonly cache = new Map<string, CacheEntry<T>>();
  private cleanupInterval: NodeJS.Timeout | null = null;

  /**
   * Initialize cache with automatic cleanup
   */
  constructor(private readonly cleanupIntervalMs: number = 5 * 60 * 1000) {
    this.setupCleanup();
  }

  /**
   * Get cache entry with TTL validation
   */
  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check TTL
    if (entry.expiresAt <= Date.now()) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  /**
   * Set cache entry with expiration timestamp
   */
  set(key: string, data: T, expiresAt: number): void {
    this.cache.set(key, {
      data,
      expiresAt,
    });
  }

  /**
   * Set cache entry with TTL in milliseconds
   */
  setWithTTL(key: string, data: T, ttlMs: number): void {
    this.set(key, data, Date.now() + ttlMs);
  }

  /**
   * Check if key exists and is not expired
   */
  has(key: string): boolean {
    return this.get(key) !== null;
  }

  /**
   * Delete specific cache entry
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clean up all expired entries
   */
  cleanup(): number {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt <= now) {
        this.cache.delete(key);
        cleanedCount++;
      }
    }

    return cleanedCount;
  }

  /**
   * Get cache size for monitoring
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Get all keys (useful for debugging)
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Setup periodic cleanup
   */
  private setupCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, this.cleanupIntervalMs);
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.clear();
  }
}
