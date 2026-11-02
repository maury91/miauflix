import type { ProviderView } from '@miauflix/service-contracts';

import type { ProviderRow, Store } from '../db/store';
import type { HttpClient } from '../http/http-client';
import { MASK, type Registry } from './registry';

export class AdminError extends Error {
  constructor(
    readonly code: 'not_found' | 'bad_request',
    message: string
  ) {
    super(message);
  }
}
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
        Object.entries(settings).map(([name, value]) => [
          name,
          schema.find(s => s.name === name)?.type === 'password' && value ? MASK : value,
        ])
      ),
      health: {
        state: !row.enabled
          ? 'disabled'
          : cooling
            ? 'cooldown'
            : row.failures > 0
              ? 'degraded'
              : 'ok',
        cooldownUntil: cooling ? new Date(row.cooldown_until!).toISOString() : null,
        lastError: row.last_error,
        lastSuccessAt: row.last_success_at ? new Date(row.last_success_at).toISOString() : null,
      },
      usage: {
        today: this.store.usage(row.id),
        dailyBudget: instance?.rate.dailyBudget ?? null,
        perMinute: instance?.rate.perMinute ?? 0,
      },
    };
  }
  list(): ProviderView[] {
    return this.store.providers().map(row => this.view(row));
  }
  update(
    id: string,
    patch: { enabled?: boolean; priority?: number; settings?: Record<string, string | boolean> }
  ): ProviderView {
    const row = this.store.provider(id);
    if (!row) throw new AdminError('not_found', `Unknown provider ${id}`);
    if (
      patch.priority !== undefined &&
      (!Number.isInteger(patch.priority) || patch.priority < 1 || patch.priority > 999)
    )
      throw new AdminError('bad_request', 'Priority must be an integer from 1 to 999');
    let settings: Record<string, string | boolean> | undefined;
    if (patch.settings) {
      const schema = this.registry.settingsSchema(row);
      settings = { ...this.store.settings(row) };
      for (const [name, value] of Object.entries(patch.settings)) {
        const setting = schema.find(s => s.name === name);
        if (!setting) throw new AdminError('bad_request', `Unknown setting ${name}`);
        if (typeof value !== 'string' && typeof value !== 'boolean')
          throw new AdminError('bad_request', `Invalid value for ${name}`);
        if (setting.type === 'password' && value === MASK) continue;
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
    if (patch.enabled !== undefined) this.store.setEnabled(id, patch.enabled);
    if (patch.priority !== undefined) this.store.setPriorities([[id, patch.priority]]);
    if (settings) this.store.setSettings(id, settings);
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
    const instance = this.registry.instance(row);
    if (!instance) return { success: false, message: 'This provider type is not supported yet' };
    try {
      return await instance.test({ signal, http: this.http });
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message.slice(0, 300) : 'Test failed',
      };
    }
  }
}
