import type { Database } from 'bun:sqlite';

import type { ProviderPage } from '../providers/types';
export interface ProviderRow {
  id: string;
  kind: 'cardigann' | 'torznab' | 'http';
  repository_id: string | null;
  name: string;
  version: string | null;
  definition: string;
  enabled: number;
  priority: number;
  settings: string | null;
  failures: number;
  cooldown_until: number | null;
  last_error: string | null;
  last_success_at: number | null;
  last_used_at: number | null;
}
export interface RepositoryRow {
  id: string;
  url: string;
  name: string | null;
  built_in: number;
  etag: string | null;
  last_fetched_at: number | null;
  last_error: string | null;
}
export class BudgetExceeded extends Error {}
const ANIME_CACHE = 'anime:mappings';
export class Store {
  constructor(
    readonly db: Database,
    readonly seal: (s: string) => string,
    readonly open: (s: string) => string,
    readonly now = Date.now
  ) {}
  providers(): ProviderRow[] {
    return this.db.query<ProviderRow, []>('SELECT * FROM providers ORDER BY priority,id').all();
  }
  settings(row: ProviderRow): Record<string, string | boolean> | null {
    if (!row.settings) return {};
    try {
      const value: unknown = JSON.parse(this.open(row.settings));
      if (
        !value ||
        typeof value !== 'object' ||
        Array.isArray(value) ||
        Object.values(value).some(v => typeof v !== 'string' && typeof v !== 'boolean')
      )
        throw new Error('Invalid settings');
      return value as Record<string, string | boolean>;
    } catch {
      // Keep the ciphertext for recovery; never run this provider with fallback defaults.
      console.warn(`Sources: settings unavailable for provider ${row.id}`);
      return null;
    }
  }
  provider(id: string): ProviderRow | undefined {
    return this.providers().find(p => p.id === id);
  }
  repositories(): RepositoryRow[] {
    return this.db
      .query<RepositoryRow, []>('SELECT * FROM repositories ORDER BY built_in DESC,rowid')
      .all();
  }
  repository(id: string): RepositoryRow | undefined {
    return this.repositories().find(r => r.id === id);
  }
  ensureLocalRepository(): void {
    this.db
      .query(
        "INSERT OR IGNORE INTO repositories (id,url,name,built_in) VALUES ('local:user','local:user','My providers',0)"
      )
      .run();
  }
  insertRepository(id: string, url: string, name: string | null): void {
    this.db
      .query('INSERT INTO repositories (id,url,name,built_in) VALUES (?,?,?,0)')
      .run(id, url, name);
  }
  deleteRepository(id: string): void {
    this.db.transaction(() => {
      this.db.query('DELETE FROM providers WHERE repository_id=?').run(id);
      this.db.query('DELETE FROM repositories WHERE id=?').run(id);
    })();
  }
  markRepositoryFetched(id: string, error: string | null): void {
    this.db
      .query('UPDATE repositories SET last_fetched_at=?,last_error=? WHERE id=?')
      .run(this.now(), error, id);
  }
  insertProvider(row: {
    id: string;
    kind: ProviderRow['kind'];
    repositoryId: string;
    name: string;
    version: string | null;
    definition: unknown;
    enabled: boolean;
    priority: number;
  }): void {
    this.db
      .query(
        'INSERT INTO providers (id,kind,repository_id,name,version,definition,enabled,priority) VALUES (?,?,?,?,?,?,?,?)'
      )
      .run(
        row.id,
        row.kind,
        row.repositoryId,
        row.name,
        row.version,
        JSON.stringify(row.definition),
        row.enabled ? 1 : 0,
        row.priority
      );
  }
  updateProviderDefinition(
    id: string,
    row: { name: string; version: string; kind: ProviderRow['kind']; definition: unknown }
  ): void {
    this.db
      .query('UPDATE providers SET name=?,version=?,kind=?,definition=? WHERE id=?')
      .run(row.name, row.version, row.kind, JSON.stringify(row.definition), id);
  }
  deleteProvider(id: string): void {
    this.db.query('DELETE FROM providers WHERE id=?').run(id);
  }
  setEnabled(id: string, enabled: boolean): void {
    this.db.query('UPDATE providers SET enabled=? WHERE id=?').run(enabled ? 1 : 0, id);
  }
  setPriorities(priorities: [id: string, priority: number][]): void {
    this.db.transaction(() => {
      for (const [id, priority] of priorities)
        this.db.query('UPDATE providers SET priority=? WHERE id=?').run(priority, id);
    })();
  }
  setSettings(id: string, settings: Record<string, string | boolean>): void {
    this.db
      .query('UPDATE providers SET settings=? WHERE id=?')
      .run(Object.keys(settings).length ? this.seal(JSON.stringify(settings)) : null, id);
  }
  usage(id: string): number {
    return (
      this.db
        .query<
          { requests: number },
          [string, string]
        >('SELECT requests FROM provider_usage WHERE provider_id=? AND day=?')
        .get(id, this.day())?.requests ?? 0
    );
  }
  day(): string {
    return new Date(this.now()).toISOString().slice(0, 10);
  }
  reserve(id: string, budget: number | null, purpose: 'interactive' | 'background'): void {
    if (
      budget !== null &&
      this.usage(id) >= Math.floor(budget * (purpose === 'background' ? 0.8 : 1))
    )
      throw new BudgetExceeded();
    this.recordRequest(id);
  }
  recordRequest(id: string): void {
    this.db
      .query(
        'INSERT INTO provider_usage VALUES (?,?,1) ON CONFLICT(provider_id,day) DO UPDATE SET requests=requests+1'
      )
      .run(id, this.day());
    this.db.query('UPDATE providers SET last_used_at=? WHERE id=?').run(this.now(), id);
  }
  failure(id: string, error: unknown): void {
    const row = this.providers().find(p => p.id === id);
    if (!row) return;
    const failures = row.failures + 1;
    const retry = (error as { retryAfter?: string | null })?.retryAfter;
    const parsed = retry ? Number(retry) : NaN;
    const maxRetryAt = this.now() + 24 * 3600_000;
    const retryAt = Math.min(
      retry ? (Number.isFinite(parsed) ? this.now() + parsed * 1000 : Date.parse(retry)) : 0,
      maxRetryAt
    );
    const cooldown = Math.max(
      Number.isFinite(retryAt) ? retryAt : 0,
      failures >= 3 ? this.now() + Math.min(6 * 3600_000, 900_000 * 2 ** (failures - 3)) : 0
    );
    this.db
      .query('UPDATE providers SET failures=?,cooldown_until=?,last_error=? WHERE id=?')
      .run(
        failures,
        cooldown || null,
        error instanceof Error ? error.message.slice(0, 300) : 'Provider failed',
        id
      );
  }
  success(id: string): void {
    this.db
      .query(
        'UPDATE providers SET failures=0,cooldown_until=NULL,last_error=NULL,last_success_at=? WHERE id=?'
      )
      .run(this.now(), id);
  }
  cache(id: string, key: string): ProviderPage | null {
    const row = this.db
      .query<
        { payload: string },
        [string, string, number]
      >('SELECT payload FROM query_cache WHERE provider_id=? AND query_key=? AND expires_at>?')
      .get(id, key, this.now());
    if (!row) return null;
    try {
      return JSON.parse(this.open(row.payload));
    } catch {
      return null; // Corrupt or undecryptable entries are misses.
    }
  }
  putCache(id: string, key: string, rows: ProviderPage, ttl: number): void {
    this.db
      .query(
        'INSERT INTO query_cache VALUES (?,?,?,?) ON CONFLICT(provider_id,query_key) DO UPDATE SET payload=excluded.payload,expires_at=excluded.expires_at'
      )
      .run(id, key, this.seal(JSON.stringify(rows)), this.now() + ttl);
  }
  /** Public anime mapping data, kept in the query cache under its own key space. */
  animeCache<T>(key: string): T | null {
    return this.cache(ANIME_CACHE, key) as T | null;
  }
  putAnimeCache(key: string, value: unknown, ttl: number): void {
    this.putCache(ANIME_CACHE, key, value as ProviderPage, ttl);
  }
  memory(key: string, id: string): { searched_at: number; result_count: number } | null {
    return this.db
      .query<
        { searched_at: number; result_count: number },
        [string, string]
      >('SELECT searched_at,result_count FROM search_memory WHERE media_key=? AND provider_id=?')
      .get(key, id);
  }
  remember(key: string, id: string, count: number): void {
    this.db
      .query(
        'INSERT INTO search_memory VALUES (?,?,?,?) ON CONFLICT(media_key,provider_id) DO UPDATE SET searched_at=excluded.searched_at,result_count=excluded.result_count'
      )
      .run(key, id, this.now(), count);
  }
  prune(): void {
    this.db.query('DELETE FROM query_cache WHERE expires_at<=?').run(this.now());
    this.db
      .query('DELETE FROM provider_usage WHERE day<?')
      .run(new Date(this.now() - 7 * 86400_000).toISOString().slice(0, 10));
  }
}
