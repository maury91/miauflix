import { ServiceConfiguration } from '@miauflix/service-configuration';

import { createMediaLoadConfigSchema } from './schema';

export class MediaLoadConfigService extends ServiceConfiguration {
  constructor() {
    super({
      schema: createMediaLoadConfigSchema(),
      notWiredMessage: 'Media load configuration has not been applied',
    });
  }

  /** The value applied by the backend (an empty one included), or the schema default. */
  value(key: string): string {
    const applied = this.values;
    if (key in applied) return applied[key];
    return String(
      this.getSchema()
        .groups.flatMap(group => group.variables)
        .find(variable => variable.key === key)?.defaultValue ?? ''
    );
  }

  /** Every key's schema default. */
  defaults(): Record<string, string> {
    return Object.fromEntries(
      this.getSchema()
        .groups.flatMap(group => group.variables)
        .map(variable => [variable.key, variable.defaultValue ?? ''])
    );
  }

  /** A comma-separated setting as a list, without empty entries. */
  list(key: string): string[] {
    return this.value(key)
      .split(',')
      .map(item => item.trim())
      .filter(Boolean);
  }
}
