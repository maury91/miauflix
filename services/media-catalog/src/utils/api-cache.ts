import { eq, lte } from 'drizzle-orm';

import type { CatalogDatabase } from '../db/database';
import { apiCache } from '../db/schema';

/**
 * TTL cache for raw provider responses, backed by the `api_cache` table so cached
 * entries (image base URL, genre lists, details responses...) survive restarts.
 * Replaces the backend's `@Cacheable` + CacheService pair for this service.
 */
export class ApiCache {
  private readonly staleRetentionMs = 7 * 24 * 60 * 60 * 1000;

  constructor(private readonly db: CatalogDatabase) {}

  private lookup<T>(key: string): CacheLookup<T> {
    const row = this.db.db.select().from(apiCache).where(eq(apiCache.key, key)).get();
    if (!row || row.staleUntil <= Date.now()) return { state: 'missing' };
    const value = JSON.parse(row.value) as T;
    return row.expiresAt > Date.now()
      ? { state: 'fresh', value, expiresAt: row.expiresAt }
      : { state: 'stale', value, expiresAt: row.expiresAt };
  }

  get<T>(key: string): T | undefined {
    const cached = this.lookup<T>(key);
    return cached.state === 'missing' ? undefined : cached.value;
  }

  set(key: string, value: unknown, ttlMs: number): void {
    const now = Date.now();
    this.db.db
      .insert(apiCache)
      .values({
        key,
        value: JSON.stringify(value),
        expiresAt: now + ttlMs,
        staleUntil: now + ttlMs + this.staleRetentionMs,
      })
      .onConflictDoUpdate({
        target: apiCache.key,
        set: {
          value: JSON.stringify(value),
          expiresAt: now + ttlMs,
          staleUntil: now + ttlMs + this.staleRetentionMs,
        },
      })
      .run();
  }

  /** Cache-or-fetch helper. */
  async wrap<T>(key: string, ttlMs: number, fetch: () => Promise<T>): Promise<T> {
    const cached = this.lookup<T>(key);
    if (cached.state === 'fresh') return cached.value;
    try {
      const value = await fetch();
      this.set(key, value, ttlMs);
      return value;
    } catch (error) {
      // We allow stale values to be returned when we have an error
      // loading a fresh one
      if (cached.state === 'stale') return cached.value;
      throw error;
    }
  }

  cleanup(): void {
    this.db.db.delete(apiCache).where(lte(apiCache.staleUntil, Date.now())).run();
  }
}

export type CacheLookup<T> =
  | { state: 'fresh'; value: T; expiresAt: number }
  | { state: 'stale'; value: T; expiresAt: number }
  | { state: 'missing' };
