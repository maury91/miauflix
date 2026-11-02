import type {
  CardigannCatalog,
  CardigannCatalogQuery,
  CardigannDefinitionEntry,
  ProviderView,
} from '@miauflix/service-contracts';

import type { ProviderRow, Store } from '../db/store';
import type { HttpClient } from '../http/http-client';
import type { DefinitionIndex, IndexRow } from './cardigann/definition-index';
import { MASK, type Registry } from './registry';

export class AdminError extends Error {
  constructor(
    readonly code: 'not_found' | 'bad_request',
    message: string
  ) {
    super(message);
  }
}
export const LOCAL_REPOSITORY = 'local:user';
const empty = { movie: [], tv: [], anime: [] };
export class ProviderAdmin {
  private listeners = new Set<(change: { at: string }) => void>();
  constructor(
    private store: Store,
    private registry: Registry,
    private http: HttpClient,
    private now: () => number = Date.now
  ) {}
  subscribe(listener: (change: { at: string }) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  changed(): void {
    const change = { at: new Date(this.now()).toISOString() };
    for (const listener of this.listeners) listener(change);
  }
  view(row: ProviderRow): ProviderView {
    const instance = this.registry.instance(row);
    const schema = this.registry.settingsSchema(row);
    const settings = this.registry.settings(row);
    const cooling = !!row.cooldown_until && row.cooldown_until > this.now();
    return {
      id: row.id,
      name: row.name,
      description: instance?.description ?? null,
      kind: row.kind,
      repositoryId: row.repository_id,
      version: row.version,
      enabled: !!row.enabled,
      priority: row.priority,
      caps: instance
        ? {
            movie: [...instance.caps.movie],
            tv: [...instance.caps.tv],
            anime: [...instance.caps.anime],
          }
        : empty,
      requiresFlareSolverr: instance?.requiresFlareSolverr ?? false,
      settingsSchema: schema,
      settings: Object.fromEntries(
        Object.entries(settings ?? {}).map(([name, value]) => [
          name,
          schema.find(s => s.name === name)?.type === 'password' && value ? MASK : value,
        ])
      ),
      health: {
        state: !row.enabled
          ? 'disabled'
          : cooling
            ? 'cooldown'
            : settings === null || row.failures > 0
              ? 'degraded'
              : 'ok',
        cooldownUntil: cooling ? new Date(row.cooldown_until!).toISOString() : null,
        lastError:
          settings === null
            ? 'Saved settings are unreadable. Replace settings, then explicitly enable the provider.'
            : row.last_error,
        lastSuccessAt: row.last_success_at ? new Date(row.last_success_at).toISOString() : null,
      },
      usage: {
        today: this.store.usage(row.id),
        dailyBudget: this.registry.budget(row).dailyBudget,
        perMinute: instance?.rate.perMinute ?? this.registry.budget(row).perMinute ?? 0,
      },
    };
  }
  list(): ProviderView[] {
    return this.store
      .providers()
      .filter(row => !this.registry.unsupportedReason(row))
      .map(row => this.view(row));
  }
  async update(
    id: string,
    patch: { enabled?: boolean; priority?: number; settings?: Record<string, string | boolean> },
    signal: AbortSignal
  ): Promise<ProviderView> {
    const row = this.store.provider(id);
    if (!row) throw new AdminError('not_found', `Unknown provider ${id}`);
    if (
      patch.priority !== undefined &&
      (!Number.isInteger(patch.priority) || patch.priority < 1 || patch.priority > 999)
    )
      throw new AdminError('bad_request', 'Priority must be an integer from 1 to 999');
    if (patch.enabled !== undefined && typeof patch.enabled !== 'boolean')
      throw new AdminError('bad_request', 'Enabled must be a boolean');
    const saved = this.store.settings(row);
    if (saved === null && patch.enabled === true)
      throw new AdminError(
        'bad_request',
        'Replace unreadable settings before enabling the provider'
      );
    let settings: Record<string, string | boolean> | undefined;
    if (patch.settings) {
      const schema = this.registry.settingsSchema(row);
      settings = { ...saved };
      for (const [name, value] of Object.entries(patch.settings)) {
        const setting = schema.find(s => s.name === name);
        if (!setting) throw new AdminError('bad_request', `Unknown setting ${name}`);
        if (typeof value !== 'string' && typeof value !== 'boolean')
          throw new AdminError('bad_request', `Invalid value for ${name}`);
        if (setting.type === 'password' && value === MASK) {
          if (saved === null)
            throw new AdminError('bad_request', 'Unreadable credentials must be replaced');
          continue;
        }
        if (
          ['dailyBudget', 'perMinute'].includes(name) &&
          value !== '' &&
          !/^[1-9]\d{0,8}$/.test(String(value))
        )
          throw new AdminError('bad_request', `${name} must be a positive whole number`);
        if (setting.type === 'select' && setting.options && !(String(value) in setting.options))
          throw new AdminError('bad_request', `Invalid value for ${name}`);
        if (value === '') delete settings[name];
        else settings[name] = value;
      }
    }
    if (patch.enabled) {
      const problem = await this.registry
        .prepare(row, signal)
        .catch(() => 'Could not reach the source');
      const reason = problem ?? this.registry.unsupportedReason(row);
      if (reason) throw new AdminError('bad_request', `Cannot enable ${row.name}: ${reason}`);
    }
    if (patch.enabled !== undefined) this.store.setEnabled(id, patch.enabled);
    if (patch.priority !== undefined) this.store.setPriorities([[id, patch.priority]]);
    if (settings) {
      // Recovery must not silently activate defaults after losing saved restrictions.
      if (saved === null) this.store.setEnabled(id, false);
      this.store.setSettings(id, settings);
    }
    this.changed();
    return this.view(this.store.provider(id)!);
  }
  /** Listed providers come first, then the rest in their current order. */
  reorder(ids: string[]): ProviderView[] {
    const rows = this.store.providers();
    if (new Set(ids).size !== ids.length)
      throw new AdminError('bad_request', 'Duplicate provider ids');
    const unknown = ids.find(id => !rows.some(r => r.id === id));
    if (unknown) throw new AdminError('bad_request', `Unknown provider ${unknown}`);
    const ordered = [...ids, ...rows.map(r => r.id).filter(id => !ids.includes(id))];
    this.store.setPriorities(ordered.map((id, index) => [id, (index + 1) * 10]));
    this.changed();
    return this.list();
  }
  async test(id: string, signal: AbortSignal): Promise<{ success: boolean; message: string }> {
    const row = this.store.provider(id);
    if (!row) throw new AdminError('not_found', `Unknown provider ${id}`);
    const problem = await this.registry
      .prepare(row, signal)
      .catch(() => 'Could not reach the source');
    const instance = this.registry.instance(row);
    if (!instance)
      return {
        success: false,
        message:
          problem ??
          this.registry.unsupportedReason(row) ??
          'This provider type is not supported yet',
      };
    try {
      return await instance.test({ signal, http: this.http });
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message.slice(0, 300) : 'Test failed',
      };
    }
  }

  private nextPriority(): number {
    return Math.min(999, Math.max(0, ...this.store.providers().map(p => p.priority)) + 10);
  }
  /** `source|id` of every Cardigann definition a provider was installed from. */
  private installedDefinitions(): Set<string> {
    const keys = new Set<string>();
    for (const row of this.store.providers()) {
      const definition = this.registry.definition(row);
      if (definition.cardigann)
        keys.add(
          `${this.registry.definitions.sourceKey(definition.cardigann, definition.source)}|${definition.cardigann}`
        );
    }
    return keys;
  }
  private entry(row: IndexRow, installed: Set<string>): CardigannDefinitionEntry {
    return {
      id: row.id,
      source: row.source,
      sourceLabel: this.registry.definitions.source(row.source)?.label ?? row.source,
      name: row.name,
      language: row.language,
      type: row.type,
      installed: installed.has(`${row.source}|${row.id}`),
      status: row.status,
      supported: !!row.supported,
      reason: row.reason,
      supports: {
        imdb: !!row.imdb,
        tmdb: !!row.tmdb,
        tvdb: !!row.tvdb,
        movies: !!row.movies,
        tv: !!row.tv,
        anime: !!row.anime,
      },
      requiresFlareSolverr: !!row.flaresolverr,
    };
  }
  /** The synced indexer list with the caller's filters, one page at a time. */
  catalog(
    query: CardigannCatalogQuery,
    index: DefinitionIndex,
    intervalMinutes: number
  ): CardigannCatalog {
    const offset = Number(query?.offset ?? 0);
    const limit = Number(query?.limit ?? 40);
    if (
      !Number.isInteger(offset) ||
      offset < 0 ||
      !Number.isInteger(limit) ||
      limit < 0 ||
      limit > 100
    )
      throw new AdminError('bad_request', 'Ask for 0 to 100 indexers at a time');
    const { rows, total } = index.catalog({
      query: typeof query?.query === 'string' ? query.query.slice(0, 100) : undefined,
      source: typeof query?.source === 'string' ? query.source.slice(0, 300) : undefined,
      imdb: query?.imdb === true,
      tmdb: query?.tmdb === true,
      tvdb: query?.tvdb === true,
      movies: query?.movies === true,
      tv: query?.tv === true,
      anime: query?.anime === true,
      publicOnly: query?.publicOnly === true,
      supportedOnly: query?.supportedOnly === true,
      offset,
      limit,
    });
    const installed = this.installedDefinitions();
    return {
      entries: rows.map(row => this.entry(row, installed)),
      total,
      sync: { ...index.status(), intervalMinutes },
    };
  }
  async addCardigann(
    id: string,
    sourceKey: string | undefined,
    signal: AbortSignal
  ): Promise<ProviderView> {
    if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(id))
      throw new AdminError('bad_request', 'Invalid definition id');
    const source = sourceKey
      ? this.registry.definitions.source(sourceKey)
      : this.registry.definitions.sources()[0];
    if (!source) throw new AdminError('bad_request', 'Unknown definition source');
    const providerId = `${source.slug}-${id}`;
    if (this.store.provider(providerId))
      throw new AdminError('bad_request', `${id} is already available; enable it instead`);
    await this.registry.definitions.download(source, id, signal).catch(() => undefined);
    const result = await this.registry.definitions.ensure(source.key, id, signal);
    if (result instanceof Error) {
      this.registry.definitions.forget(source.key, id);
      throw new AdminError('bad_request', result.message);
    }
    // Two sources can offer the same indexer; tell the copies apart by where they came from.
    const taken = this.store.providers().some(row => row.name === result.name);
    this.store.ensureLocalRepository();
    this.store.insertProvider({
      id: providerId,
      kind: 'cardigann',
      repositoryId: LOCAL_REPOSITORY,
      name: taken ? `${result.name} (${source.label})` : result.name,
      version: null,
      definition: { cardigann: id, source: source.key },
      enabled: false,
      priority: this.nextPriority(),
    });
    this.changed();
    return this.view(this.store.provider(providerId)!);
  }
  addTorznab(input: { name: string; baseUrl: string; apiKey?: string }): ProviderView {
    const name = String(input.name ?? '').trim();
    let url: URL;
    try {
      url = new URL(String(input.baseUrl ?? '').trim());
    } catch {
      throw new AdminError('bad_request', 'The indexer URL is invalid');
    }
    if (!name || name.length > 100) throw new AdminError('bad_request', 'Give the indexer a name');
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
      throw new AdminError('bad_request', 'The indexer URL must be http(s) without credentials');
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40);
    let id = `torznab-${slug || 'indexer'}`;
    for (let n = 2; this.store.provider(id); n++) id = `torznab-${slug || 'indexer'}-${n}`;
    this.store.ensureLocalRepository();
    this.store.insertProvider({
      id,
      kind: 'torznab',
      repositoryId: LOCAL_REPOSITORY,
      name,
      version: null,
      definition: { baseUrl: url.href },
      enabled: false,
      priority: this.nextPriority(),
    });
    if (input.apiKey) this.store.setSettings(id, { apiKey: input.apiKey });
    this.changed();
    return this.view(this.store.provider(id)!);
  }
  remove(id: string): void {
    const row = this.store.provider(id);
    if (!row) throw new AdminError('not_found', `Unknown provider ${id}`);
    if (row.repository_id !== LOCAL_REPOSITORY)
      throw new AdminError('bad_request', 'Providers from a repository are removed with it');
    this.store.deleteProvider(id);
    this.changed();
  }
}
