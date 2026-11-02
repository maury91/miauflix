import { parse } from 'yaml';

import type { Store } from '../../db/store';
import { deriveCaps } from './capabilities';
import { parseDefinition } from './definition';
import type { DefinitionStore, IndexEntry } from './definition-store';
import { CardigannProvider } from './engine';
import { type DefinitionSource, LEGACY_SOURCE_KEY } from './sources';

/** Bump when `inspectDefinition` learns to read something new, so stored rows are redone. */
const ANALYSIS_VERSION = '2';
const SYNC_CONCURRENCY = 6;
/** Sources that give no per-file sha are re-read once a day instead. */
const UNVERSIONED_REFRESH_MS = 24 * 3600_000;
/** After a failed run, try again sooner than the normal interval. */
const RETRY_AFTER_FAILURE_MS = 5 * 60_000;

export interface IndexRow {
  source: string;
  id: string;
  sha: string | null;
  name: string | null;
  language: string | null;
  type: string | null;
  supported: number;
  reason: string | null;
  imdb: number;
  tmdb: number;
  tvdb: number;
  movies: number;
  tv: number;
  anime: number;
  flaresolverr: number;
  status: 'pending' | 'ready' | 'failed';
  checked_at: number | null;
}
export interface CatalogQuery {
  query?: string;
  /** Only this definition source (its key). */
  source?: string;
  imdb?: boolean;
  tmdb?: boolean;
  tvdb?: boolean;
  movies?: boolean;
  tv?: boolean;
  anime?: boolean;
  publicOnly?: boolean;
  supportedOnly?: boolean;
  offset: number;
  limit: number;
}
export interface SyncChange {
  added: number;
  updated: number;
  removed: number;
  failed: number;
}
export interface SourceStatus {
  key: string;
  label: string;
  total: number;
  lastSyncAt: string | null;
  lastError: string | null;
}
export interface SyncStatus {
  /** The oldest successful sync among the sources: everything is at least this fresh. */
  lastSyncAt: string | null;
  lastError: string | null;
  syncing: boolean;
  total: number;
  ready: number;
  pending: number;
  failed: number;
  lastChange: SyncChange | null;
  sources: SourceStatus[];
}

/** What a definition's text says it can do, without needing it to be installable. */
export function inspectDefinition(
  id: string,
  yaml: string
): Omit<IndexRow, 'source' | 'id' | 'sha' | 'status' | 'checked_at'> {
  const bits = (value: boolean) => (value ? 1 : 0);
  let loose: { name?: unknown; language?: unknown; type?: unknown; caps?: unknown } = {};
  try {
    loose = (parse(yaml, { maxAliasCount: 50 }) as typeof loose) ?? {};
  } catch {
    /* Reported below as unreadable. */
  }
  const base = {
    name: typeof loose.name === 'string' ? loose.name : null,
    language: typeof loose.language === 'string' ? loose.language : null,
    type: typeof loose.type === 'string' ? loose.type : null,
  };
  // A definition we cannot run (it needs an account, say) still says what its site can do, so
  // the filters describe it truthfully.
  const looseCaps = deriveCaps(
    loose.caps && typeof loose.caps === 'object'
      ? (loose.caps as Parameters<typeof deriveCaps>[0])
      : {}
  ).caps;
  const looseParams = [...looseCaps.movie, ...looseCaps.tv];
  const described = {
    imdb: bits(looseParams.includes('imdbid')),
    tmdb: bits(looseParams.includes('tmdbid')),
    tvdb: bits(looseParams.includes('tvdbid')),
    movies: bits(looseCaps.movie.length > 0),
    tv: bits(looseCaps.tv.length > 0),
    anime: bits(looseCaps.anime.length > 0),
    flaresolverr: 0,
  };
  try {
    const definition = parseDefinition(yaml);
    const provider = new CardigannProvider(id, definition.name, definition);
    const params = [...provider.caps.movie, ...provider.caps.tv];
    return {
      ...base,
      name: definition.name,
      supported: 1,
      reason: null,
      imdb: bits(params.includes('imdbid')),
      tmdb: bits(params.includes('tmdbid')),
      tvdb: bits(params.includes('tvdbid')),
      movies: bits(provider.caps.movie.length > 0),
      tv: bits(provider.caps.tv.length > 0),
      anime: bits(provider.caps.anime.length > 0),
      flaresolverr: bits(provider.requiresFlareSolverr),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not read the definition';
    return {
      ...base,
      ...described,
      supported: 0,
      reason:
        base.type && base.type !== 'public'
          ? `Needs an account (${base.type} tracker)`
          : message.replace(/^Unsupported Cardigann feature: /, 'Not supported: '),
    };
  }
}

/**
 * A local copy of what the configured definition sources contain, kept current by comparing each
 * file's upstream sha: only new or changed definitions are downloaded again.
 */
export class DefinitionIndex {
  private running: Promise<SyncChange> | null = null;

  constructor(
    private store: Store,
    private definitions: DefinitionStore,
    private now: () => number = Date.now
  ) {}

  private meta(key: string): string | null {
    return (
      this.store.db
        .query<{ value: string }, [string]>('SELECT value FROM cardigann_sync WHERE key=?')
        .get(key)?.value ?? null
    );
  }
  private setMeta(key: string, value: string | null): void {
    if (value === null) this.store.db.query('DELETE FROM cardigann_sync WHERE key=?').run(key);
    else
      this.store.db
        .query(
          'INSERT INTO cardigann_sync (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value'
        )
        .run(key, value);
  }
  private installed(): Set<string> {
    const keys = new Set<string>();
    for (const row of this.store.providers()) {
      const definition = JSON.parse(row.definition) as { cardigann?: string; source?: string };
      if (definition.cardigann)
        keys.add(`${definition.source ?? LEGACY_SOURCE_KEY}|${definition.cardigann}`);
    }
    return keys;
  }

  status(): SyncStatus {
    const counts = this.store.db
      .query<
        { status: string; n: number },
        []
      >('SELECT status, COUNT(*) AS n FROM cardigann_index GROUP BY status')
      .all();
    const count = (status: string) => counts.find(row => row.status === status)?.n ?? 0;
    const totals = new Map(
      this.store.db
        .query<{ source: string; n: number }, []>(
          'SELECT source, COUNT(*) AS n FROM cardigann_index GROUP BY source'
        )
        .all()
        .map(row => [row.source, row.n])
    );
    const sources: SourceStatus[] = this.definitions.sources().map(source => {
      const synced = this.meta(`${source.key}|last_sync_at`);
      return {
        key: source.key,
        label: source.label,
        total: totals.get(source.key) ?? 0,
        lastSyncAt: synced ? new Date(Number(synced)).toISOString() : null,
        lastError: this.meta(`${source.key}|last_error`),
      };
    });
    const stamps = sources.map(source => source.lastSyncAt);
    const change = this.meta('last_change');
    const configuredTotal = sources.reduce((sum, source) => sum + source.total, 0);
    return {
      lastSyncAt: stamps.length && stamps.every(Boolean) ? (stamps.sort()[0] as string) : null,
      lastError: sources.find(source => source.lastError)?.lastError ?? null,
      syncing: this.running !== null,
      total: configuredTotal,
      ready: count('ready'),
      pending: count('pending'),
      failed: count('failed'),
      lastChange: change ? (JSON.parse(change) as SyncChange) : null,
      sources,
    };
  }

  /** Whether a scheduled run is due, given the configured interval. */
  due(intervalMinutes: number): boolean {
    if (this.running || !this.definitions.sources().length) return false;
    const attempt = Number(this.meta('last_attempt_at') ?? 0);
    const failing = this.definitions
      .sources()
      .some(source => this.meta(`${source.key}|last_error`));
    const wait = failing
      ? Math.min(RETRY_AFTER_FAILURE_MS, intervalMinutes * 60_000)
      : intervalMinutes * 60_000;
    return this.now() - attempt >= wait;
  }

  /** Starts a run unless one is already going; both callers share the same result. */
  sync(signal: AbortSignal): Promise<SyncChange> {
    this.running ??= this.run(signal).finally(() => {
      this.running = null;
    });
    return this.running;
  }

  /**
   * When the way definitions are read changes, what is stored about them is read again from the
   * definitions already cached: no download is needed.
   */
  private reinspect(): void {
    if (this.meta('analysis_version') === ANALYSIS_VERSION) return;
    const rows = this.store.db
      .query<
        { source: string; id: string; yaml: string },
        []
      >("SELECT d.source, d.id, d.yaml FROM cardigann_definitions d JOIN cardigann_index i ON i.source=d.source AND i.id=d.id WHERE i.status='ready'")
      .all();
    for (const row of rows) {
      const info = inspectDefinition(row.id, row.yaml);
      this.store.db
        .query(
          'UPDATE cardigann_index SET name=?,language=?,type=?,supported=?,reason=?,imdb=?,tmdb=?,tvdb=?,movies=?,tv=?,anime=?,flaresolverr=? WHERE source=? AND id=?'
        )
        .run(
          info.name,
          info.language,
          info.type,
          info.supported,
          info.reason,
          info.imdb,
          info.tmdb,
          info.tvdb,
          info.movies,
          info.tv,
          info.anime,
          info.flaresolverr,
          row.source,
          row.id
        );
    }
    this.setMeta('analysis_version', ANALYSIS_VERSION);
  }

  private async run(signal: AbortSignal): Promise<SyncChange> {
    const total: SyncChange = { added: 0, updated: 0, removed: 0, failed: 0 };
    this.reinspect();
    this.setMeta('last_attempt_at', String(this.now()));
    const configured = this.definitions.sources();
    // Indexers of a source that is no longer configured stop being offered.
    const keep = new Set(configured.map(source => source.key));
    for (const row of this.store.db
      .query<{ source: string }, []>('SELECT DISTINCT source FROM cardigann_index')
      .all())
      if (!keep.has(row.source))
        this.store.db.query('DELETE FROM cardigann_index WHERE source=?').run(row.source);
    let changed = false;
    for (const source of configured) {
      signal.throwIfAborted();
      try {
        const change = await this.runSource(source, signal);
        for (const key of Object.keys(total) as (keyof SyncChange)[])
          total[key] += change.change[key];
        changed ||= change.changed;
        this.setMeta(`${source.key}|last_sync_at`, String(this.now()));
        this.setMeta(`${source.key}|last_error`, null);
      } catch (error) {
        signal.throwIfAborted();
        this.setMeta(
          `${source.key}|last_error`,
          error instanceof Error ? error.message.slice(0, 300) : 'Sync failed'
        );
      }
    }
    if (changed) this.setMeta('last_change', JSON.stringify(total));
    return total;
  }

  private async runSource(
    source: DefinitionSource,
    signal: AbortSignal
  ): Promise<{ change: SyncChange; changed: boolean }> {
    const change: SyncChange = { added: 0, updated: 0, removed: 0, failed: 0 };
    const listing = await this.definitions.list(source, signal);
    const known = new Map(
      this.store.db
        .query<IndexRow, [string]>('SELECT * FROM cardigann_index WHERE source=?')
        .all(source.key)
        .map(row => [row.id, row])
    );
    const upstream = new Set(listing.entries.map(entry => entry.id));
    const unhealthy = [...known.values()].some(row => row.status !== 'ready');
    const treeKey = `${source.key}|tree_sha`;
    if (
      listing.sha &&
      listing.sha === this.meta(treeKey) &&
      !unhealthy &&
      known.size === upstream.size
    )
      return { change, changed: false };

    const installed = this.installed();
    for (const [id] of known)
      if (!upstream.has(id)) {
        this.store.db
          .query('DELETE FROM cardigann_index WHERE source=? AND id=?')
          .run(source.key, id);
        if (!installed.has(`${source.key}|${id}`)) this.definitions.forget(source.key, id);
        change.removed++;
      }
    const todo: IndexEntry[] = [];
    for (const entry of listing.entries) {
      const row = known.get(entry.id);
      if (!row) {
        this.store.db
          .query("INSERT INTO cardigann_index (source,id,sha,status) VALUES (?,?,?,'pending')")
          .run(source.key, entry.id, entry.sha);
        todo.push(entry);
      } else if (
        row.status !== 'ready' ||
        (entry.sha
          ? row.sha !== entry.sha
          : (row.checked_at ?? 0) + UNVERSIONED_REFRESH_MS <= this.now())
      )
        todo.push(entry);
    }

    let next = 0;
    const worker = async () => {
      for (let i = next++; i < todo.length; i = next++) {
        signal.throwIfAborted();
        const entry = todo[i];
        const existed = known.get(entry.id)?.status === 'ready';
        try {
          const yaml = await this.definitions.download(source, entry.id, signal, entry.sha);
          const info = inspectDefinition(entry.id, yaml);
          this.store.db
            .query(
              `INSERT INTO cardigann_index (source,id,sha,name,language,type,supported,reason,imdb,tmdb,tvdb,movies,tv,anime,flaresolverr,status,checked_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'ready',?)
               ON CONFLICT(source,id) DO UPDATE SET sha=excluded.sha,name=excluded.name,language=excluded.language,type=excluded.type,supported=excluded.supported,reason=excluded.reason,imdb=excluded.imdb,tmdb=excluded.tmdb,tvdb=excluded.tvdb,movies=excluded.movies,tv=excluded.tv,anime=excluded.anime,flaresolverr=excluded.flaresolverr,status='ready',checked_at=excluded.checked_at`
            )
            .run(
              source.key,
              entry.id,
              entry.sha,
              info.name,
              info.language,
              info.type,
              info.supported,
              info.reason,
              info.imdb,
              info.tmdb,
              info.tvdb,
              info.movies,
              info.tv,
              info.anime,
              info.flaresolverr,
              this.now()
            );
          if (existed) change.updated++;
          else change.added++;
        } catch {
          signal.throwIfAborted();
          // Keep whatever was known about an indexer that fails to refresh; only a row that was
          // never read becomes "failed" so the next run retries it.
          this.store.db
            .query(
              "UPDATE cardigann_index SET status='failed' WHERE source=? AND id=? AND name IS NULL"
            )
            .run(source.key, entry.id);
          change.failed++;
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(SYNC_CONCURRENCY, todo.length) }, worker));
    this.setMeta(treeKey, change.failed ? null : listing.sha);
    return { change, changed: true };
  }

  /** One page of the catalog with the caller's filters applied. */
  catalog(query: CatalogQuery): { rows: IndexRow[]; total: number } {
    const where: string[] = [];
    const params: (string | number)[] = [];
    const text = query.query?.trim().toLowerCase();
    if (text) {
      where.push("(LOWER(id) LIKE ? ESCAPE '\\' OR LOWER(COALESCE(name,'')) LIKE ? ESCAPE '\\')");
      const like = `%${text.replace(/[\\%_]/g, '\\$&')}%`;
      params.push(like, like);
    }
    if (query.source) {
      where.push('source=?');
      params.push(query.source);
    }
    for (const flag of ['imdb', 'tmdb', 'tvdb', 'movies', 'tv', 'anime'] as const)
      if (query[flag]) where.push(`${flag}=1`);
    if (query.publicOnly) where.push("type='public'");
    if (query.supportedOnly) where.push('supported=1');
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total =
      this.store.db
        .query<
          { n: number },
          (string | number)[]
        >(`SELECT COUNT(*) AS n FROM cardigann_index ${clause}`)
        .get(...params)?.n ?? 0;
    const rows = query.limit
      ? this.store.db
          .query<
            IndexRow,
            (string | number)[]
          >(`SELECT * FROM cardigann_index ${clause} ORDER BY LOWER(COALESCE(name,id)), source, id LIMIT ? OFFSET ?`)
          .all(...params, query.limit, query.offset)
      : [];
    return { rows, total };
  }
}
