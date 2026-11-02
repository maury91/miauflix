import { ServiceConfiguration } from '@miauflix/service-configuration';

import { createSourcesConfigSchema } from './schema';

export class SourcesConfigService extends ServiceConfiguration {
  constructor() {
    super({
      schema: createSourcesConfigSchema(),
      notWiredMessage: 'Sources configuration has not been applied',
    });
  }
  value(key: string): string {
    return (
      this.resolve(key) ||
      String(
        this.getSchema()
          .groups.flatMap(g => g.variables)
          .find(v => v.key === key)?.defaultValue ?? ''
      )
    );
  }
  number(key: string): number {
    return Number(this.value(key));
  }
}
