import type { ProviderSetting } from '@miauflix/service-contracts';

import type { SourcesConfigService } from '../config/config.service';
import type { ProviderRow, Store } from '../db/store';
import { EztvProvider } from './native/eztv';
import { TherarbgProvider } from './native/therarbg';
import { YtsProvider } from './native/yts';
import type { Provider } from './types';

export interface ProviderDefinition {
  native?: string;
  cardigann?: string;
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
  private native: Map<string, Provider>;
  constructor(
    readonly store: Store,
    private config: SourcesConfigService
  ) {
    this.native = new Map(
      [new TherarbgProvider(config), new YtsProvider(config), new EztvProvider()].map(p => [
        p.id,
        p,
      ])
    );
  }
  definition(row: ProviderRow): ProviderDefinition {
    return JSON.parse(row.definition) as ProviderDefinition;
  }
  /** Manifest defaults overlaid with what the admin configured. */
  settings(row: ProviderRow): Record<string, string | boolean> {
    return { ...this.definition(row).settings, ...this.store.settings(row) };
  }
  settingsSchema(row: ProviderRow): ProviderSetting[] {
    const definition = this.definition(row);
    const schema = [...budgetSettings];
    if (definition.native === 'eztv')
      schema.push({
        name: 'baseUrl',
        type: 'text',
        label: 'Base URL',
        default: 'https://eztvx.to',
      });
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
  /** Runnable instance for a row regardless of its enabled flag, or null when unsupported. */
  instance(row: ProviderRow): Provider | null {
    const definition = this.definition(row);
    const settings = this.settings(row);
    const base =
      definition.native === 'eztv'
        ? new EztvProvider(settings)
        : this.native.get(definition.native ?? '');
    if (!base) return null;
    return Object.assign(Object.create(base) as Provider, {
      id: row.id,
      name: row.name,
      rate: {
        ...base.rate,
        dailyBudget:
          Number(settings.dailyBudget) ||
          definition.defaults?.dailyBudget ||
          base.rate.dailyBudget ||
          this.config.number('SOURCES_DEFAULT_DAILY_BUDGET'),
        perMinute:
          Number(settings.perMinute) || definition.defaults?.perMinute || base.rate.perMinute,
      },
    });
  }
  async providers(): Promise<Provider[]> {
    return this.store
      .providers()
      .filter(r => r.enabled)
      .flatMap(row => this.instance(row) ?? []);
  }
}
