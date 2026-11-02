import { createHash } from 'node:crypto';

import type { RepositoryView } from '@miauflix/service-contracts';

import type { RepositoryRow, Store } from '../db/store';
import type { HttpClient } from '../http/http-client';
import { AdminError } from '../providers/admin';
import type { ProviderDefinition } from '../providers/registry';
import { type ManifestEntry, manifestSchema } from './manifest';

export const BUILTIN_REPOSITORY = 'builtin:miauflix';
const MAX_MANIFEST_BYTES = 256 * 1024;
const REFRESH_AFTER_MS = 24 * 3600_000;
const definitionOf = (entry: ManifestEntry): ProviderDefinition => ({
  ...(entry.native ? { native: entry.native } : {}),
  ...(entry.cardigann ? { cardigann: entry.cardigann } : {}),
  ...(entry.baseUrl ? { baseUrl: entry.baseUrl } : {}),
  defaults: {
    dailyBudget: entry.defaults.dailyBudget,
    ...(entry.defaults.perMinute ? { perMinute: entry.defaults.perMinute } : {}),
  },
  ...(entry.settings ? { settings: entry.settings } : {}),
});

export class RepositoryService {
  constructor(
    private store: Store,
    private http: HttpClient,
    private onChange: () => void,
    private now: () => number = Date.now
  ) {}
  view(row: RepositoryRow): RepositoryView {
    return {
      id: row.id,
      url: row.url,
      name: row.name,
      builtIn: !!row.built_in,
      lastFetchedAt: row.last_fetched_at ? new Date(row.last_fetched_at).toISOString() : null,
      lastError: row.last_error,
      providerCount: this.store.providers().filter(p => p.repository_id === row.id).length,
    };
  }
  list(): RepositoryView[] {
    return this.store.repositories().map(r => this.view(r));
  }
  private async fetchManifest(url: string, signal: AbortSignal): Promise<ManifestEntry[]> {
    let response: Response;
    try {
      response = await this.http.request(url, {
        signal,
        timeoutMs: 10_000,
        maxBytes: MAX_MANIFEST_BYTES,
        redirect: 'follow',
        blockInternal: true,
        headers: { accept: 'application/json' },
      });
    } catch (error) {
      throw new AdminError(
        'bad_request',
        `Could not fetch repository: ${error instanceof Error ? error.message : 'request failed'}`
      );
    }
    if (!response.ok)
      throw new AdminError('bad_request', `Repository returned HTTP ${response.status}`);
    let json: unknown;
    try {
      json = JSON.parse(await response.text());
    } catch {
      throw new AdminError('bad_request', 'Repository is not valid JSON');
    }
    const parsed = manifestSchema.safeParse(json);
    if (!parsed.success)
      throw new AdminError(
        'bad_request',
        `Invalid repository manifest: ${parsed.error.issues[0]?.path.join('.')} ${parsed.error.issues[0]?.message}`
      );
    const ids = parsed.data.map(e => e.id);
    if (new Set(ids).size !== ids.length)
      throw new AdminError('bad_request', 'Repository contains duplicate provider ids');
    return parsed.data;
  }
  /** Returns conflict messages for ids owned elsewhere. */
  private apply(repositoryId: string, entries: ManifestEntry[]): string[] {
    const conflicts: string[] = [];
    const existing = new Map(this.store.providers().map(p => [p.id, p]));
    this.store.db.transaction(() => {
      for (const entry of entries) {
        const row = existing.get(entry.id);
        if (row && row.repository_id !== repositoryId) {
          conflicts.push(entry.id);
          continue;
        }
        if (!row)
          this.store.insertProvider({
            id: entry.id,
            kind: entry.kind,
            repositoryId,
            name: entry.name,
            version: entry.version,
            definition: definitionOf(entry),
            enabled: entry.defaults.enabled,
            priority: entry.defaults.priority,
          });
        else if (row.version !== entry.version)
          this.store.updateProviderDefinition(entry.id, {
            name: entry.name,
            version: entry.version,
            kind: entry.kind,
            definition: definitionOf(entry),
          });
      }
      for (const row of existing.values())
        if (row.repository_id === repositoryId && !entries.some(e => e.id === row.id))
          this.store.deleteProvider(row.id);
    })();
    return conflicts;
  }
  private record(id: string, conflicts: string[]): void {
    this.store.markRepositoryFetched(
      id,
      conflicts.length
        ? `Skipped providers owned by another repository: ${conflicts.join(', ')}`
        : null
    );
  }
  async add(rawUrl: string, signal: AbortSignal): Promise<RepositoryView> {
    let url: URL;
    try {
      url = new URL(rawUrl.trim());
    } catch {
      throw new AdminError('bad_request', 'Repository URL is invalid');
    }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
      throw new AdminError('bad_request', 'Repository URL must be http(s) without credentials');
    url.hash = '';
    if (this.store.repositories().some(r => r.url === url.href))
      throw new AdminError('bad_request', 'Repository already added');
    const entries = await this.fetchManifest(url.href, signal);
    signal.throwIfAborted();
    const id = `repo:${createHash('sha256').update(url.href).digest('hex').slice(0, 12)}`;
    this.store.insertRepository(id, url.href, url.hostname);
    this.record(id, this.apply(id, entries));
    this.onChange();
    return this.view(this.store.repository(id)!);
  }
  async refresh(id: string, signal: AbortSignal): Promise<RepositoryView> {
    const row = this.store.repository(id);
    if (!row) throw new AdminError('not_found', `Unknown repository ${id}`);
    if (row.built_in) return this.view(row);
    try {
      const entries = await this.fetchManifest(row.url, signal);
      signal.throwIfAborted();
      if (!this.store.repository(id)) throw new AdminError('not_found', `Unknown repository ${id}`);
      this.record(id, this.apply(id, entries));
    } catch (error) {
      this.store.markRepositoryFetched(
        id,
        error instanceof Error ? error.message.slice(0, 300) : 'Refresh failed'
      );
      throw error;
    }
    this.onChange();
    return this.view(this.store.repository(id)!);
  }
  /** Refresh every external repository that has not been fetched for a day. */
  async refreshStale(signal: AbortSignal): Promise<void> {
    for (const row of this.store.repositories())
      if (!row.built_in && (row.last_fetched_at ?? 0) + REFRESH_AFTER_MS <= this.now())
        await this.refresh(row.id, signal).catch(() => undefined);
  }
  remove(id: string): void {
    const row = this.store.repository(id);
    if (!row) throw new AdminError('not_found', `Unknown repository ${id}`);
    if (row.built_in)
      throw new AdminError('bad_request', 'Built-in repositories cannot be removed');
    this.store.deleteRepository(id);
    this.onChange();
  }
}
