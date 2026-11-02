import type { Store } from '../db/store';
import { parseSource } from './cardigann/sources';

/**
 * Providers named in `SOURCES_PRELOAD_PROVIDERS`, installed and enabled at startup so a
 * deployment (or a test environment) can come up searching without anyone using the UI.
 * Each entry is `<definition id>@<definition source URL>`, separated by spaces or commas.
 * Returns the entries it could not use.
 */
export function preloadProviders(store: Store, text: string): string[] {
  const invalid: string[] = [];
  let priority = 10;
  for (const entry of text.split(/[\s,;]+/).filter(Boolean)) {
    const at = entry.indexOf('@');
    const id = at > 0 ? entry.slice(0, at) : '';
    const source = at > 0 ? parseSource(entry.slice(at + 1)) : null;
    if (!source || !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(id)) {
      invalid.push(entry);
      continue;
    }
    const providerId = `${source.slug}-${id}`;
    if (!store.provider(providerId)) {
      store.ensureLocalRepository();
      store.insertProvider({
        id: providerId,
        kind: 'cardigann',
        repositoryId: 'local:user',
        name: id,
        version: null,
        definition: { cardigann: id, source: source.key },
        enabled: true,
        priority,
      });
    }
    priority += 10;
  }
  return invalid;
}
