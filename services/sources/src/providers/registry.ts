import type { ProviderSetting } from '@miauflix/service-contracts';

import type { SourcesConfigService } from '../config/config.service';
import type { ProviderRow, Store } from '../db/store';
import type { HttpClient } from '../http/http-client';
import type { DefinitionStore } from './cardigann/definition-store';
import { CardigannProvider, settingsOf } from './cardigann/engine';
import { TorznabProvider, torznabSettings } from './torznab/torznab';
import type { Provider } from './types';

export interface ProviderDefinition {
  cardigann?: string;
  /** Key of the definition source the Cardigann definition came from; legacy rows have none. */
  source?: string;
  baseUrl?: string;
  defaults?: { dailyBudget?: number | null; perMinute?: number };
  settings?: Record<string, string | boolean>;
}
export const MASK = '••••';
const budgetSettings: ProviderSetting[] = [
  { name: 'dailyBudget', type: 'text', label: 'Daily request budget (blank for default)' },
  { name: 'perMinute', type: 'text', label: 'Requests per minute (blank for default)' },
];
export class Registry {
  private built = new Map<string, { key: string; provider: Provider }>();
  constructor(
    readonly store: Store,
    private config: SourcesConfigService,
    private http: HttpClient,
    readonly definitions: DefinitionStore
  ) {}
  definition(row: ProviderRow): ProviderDefinition {
    return JSON.parse(row.definition) as ProviderDefinition;
  }
  /** Manifest defaults overlaid with what the admin configured. */
  settings(row: ProviderRow): Record<string, string | boolean> | null {
    const saved = this.store.settings(row);
    return saved === null ? null : { ...this.definition(row).settings, ...saved };
  }
  settingsSchema(row: ProviderRow): ProviderSetting[] {
    const definition = this.definition(row);
    const schema = [...budgetSettings];
    if (row.kind === 'torznab') schema.push(...torznabSettings);
    if (row.kind === 'cardigann') {
      const cached = definition.cardigann
        ? this.definitions.cached(
            this.definitions.sourceKey(definition.cardigann, definition.source),
            definition.cardigann
          )
        : null;
      if (cached && !(cached instanceof Error)) schema.push(...settingsOf(cached));
    }
    for (const [name, value] of Object.entries(definition.settings ?? {}))
      if (!schema.some(s => s.name === name))
        schema.push({
          name,
          type:
            typeof value === 'boolean'
              ? 'checkbox'
              : /password|api_?key|token|secret/i.test(name)
                ? 'password'
                : 'text',
          label: name,
          default: value,
        });
    return schema;
  }
  /** A definition that cannot run (unsupported feature, or malformed): hidden from admins. */
  unsupportedReason(row: ProviderRow): string | null {
    if (row.kind !== 'cardigann') return null;
    const definition = this.definition(row);
    const cached = definition.cardigann
      ? this.definitions.cached(
          this.definitions.sourceKey(definition.cardigann, definition.source),
          definition.cardigann
        )
      : null;
    return cached instanceof Error ? cached.message : null;
  }
  private base(row: ProviderRow, settings: Record<string, string | boolean>): Provider | null {
    const definition = this.definition(row);
    const key = JSON.stringify([row.version, definition, settings]);
    const hit = this.built.get(row.id);
    if (row.kind === 'cardigann') {
      const cached = definition.cardigann
        ? this.definitions.cached(
            this.definitions.sourceKey(definition.cardigann, definition.source),
            definition.cardigann
          )
        : null;
      if (!cached || cached instanceof Error) return null;
      const stamp = `${key}:${this.definitions.row(this.definitions.sourceKey(definition.cardigann!, definition.source), definition.cardigann!)?.fetched_at}`;
      if (hit?.key === stamp) return hit.provider;
      const provider = new CardigannProvider(row.id, row.name, cached, settings);
      this.built.set(row.id, { key: stamp, provider });
      return provider;
    }
    if (row.kind === 'torznab' && definition.baseUrl) {
      if (hit?.key === key) return hit.provider;
      const provider = new TorznabProvider(row.id, row.name, definition.baseUrl, settings);
      this.built.set(row.id, { key, provider });
      return provider;
    }
    return null;
  }
  /** Runnable instance for a row regardless of its enabled flag, or null when unsupported. */
  instance(row: ProviderRow): Provider | null {
    const settings = this.settings(row);
    if (settings === null) return null;
    const base = this.base(row, settings);
    if (!base) return null;
    const budget = this.budget(row);
    return Object.assign(Object.create(base) as Provider, {
      id: row.id,
      name: row.name,
      rate: {
        ...base.rate,
        dailyBudget: budget.dailyBudget ?? base.rate.dailyBudget,
        perMinute: budget.perMinute ?? base.rate.perMinute,
      },
    });
  }
  /** What the admin or the definition source set for request limits; unset means the default. */
  budget(row: ProviderRow): { dailyBudget: number; perMinute: number | null } {
    const definition = this.definition(row);
    const settings = this.settings(row);
    return {
      dailyBudget:
        Number(settings?.dailyBudget) ||
        definition.defaults?.dailyBudget ||
        this.config.number('SOURCES_DEFAULT_DAILY_BUDGET'),
      perMinute: Number(settings?.perMinute) || definition.defaults?.perMinute || null,
    };
  }
  /** Fetches what a provider needs before it can run (definition, capabilities). */
  async prepare(row: ProviderRow, signal: AbortSignal): Promise<string | null> {
    const settings = this.settings(row);
    if (settings === null) return 'Provider settings are unreadable';
    const definition = this.definition(row);
    if (row.kind === 'cardigann' && definition.cardigann) {
      const result = await this.definitions.ensure(
        this.definitions.sourceKey(definition.cardigann, definition.source),
        definition.cardigann,
        signal
      );
      return result instanceof Error ? result.message : null;
    }
    if (row.kind === 'torznab') {
      const base = this.base(row, settings);
      if (base instanceof TorznabProvider) await base.prepare({ signal, http: this.http });
    }
    return null;
  }
  async providers(): Promise<Provider[]> {
    const signal = AbortSignal.timeout(10_000);
    const rows = this.store.providers().filter(r => r.enabled);
    await Promise.all(rows.map(row => this.prepare(row, signal).catch(() => null)));
    return rows.flatMap(row => this.instance(row) ?? []);
  }
}
