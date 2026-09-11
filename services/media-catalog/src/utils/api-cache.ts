import { eq, lte } from 'drizzle-orm';

import type { CatalogDatabase } from '../db/database';
import { apiCache } from '../db/schema';

/**
 * TTL cache for raw provider responses, backed by the `api_cache` table so cached
 * entries (image base URL, genre lists, details responses...) survive restarts.
 * Replaces the backend's `@Cacheable` + CacheService pair for this service.
 */
export class ApiCache {
  constructor(private readonly db: CatalogDatabase) {}

  get<T>(key: string): T | undefined {
    const row = this.db.db.select().from(apiCache).where(eq(apiCache.key, key)).get();
    if (!row) return undefined;
    if (row.expiresAt <= Date.now()) {
      this.db.db.delete(apiCache).where(eq(apiCache.key, key)).run();
      return undefined;
    }
    return JSON.parse(row.value) as T;
  }

  set(key: string, value: unknown, ttlMs: number): void {
    this.db.db
      .insert(apiCache)
      .values({ key, value: JSON.stringify(value), expiresAt: Date.now() + ttlMs })
      .onConflictDoUpdate({
        target: apiCache.key,
        set: { value: JSON.stringify(value), expiresAt: Date.now() + ttlMs },
      })
      .run();
  }

  /** Cache-or-fetch helper. */
  async wrap<T>(key: string, ttlMs: number, fetch: () => Promise<T>): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== undefined) return cached;
    const value = await fetch();
    this.set(key, value, ttlMs);
    return value;
  }

  cleanup(): void {
    this.db.db.delete(apiCache).where(lte(apiCache.expiresAt, Date.now())).run();
  }
}
