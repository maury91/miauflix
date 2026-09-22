import { ServiceConfiguration } from '@miauflix/service-configuration';
import type { ConfigurationProbe } from '@miauflix/service-configuration';
import type { ServiceConfigSchema } from '@miauflix/service-contracts';

import { createListConfigSchema } from './schema';

export type ListConfigProber = ConfigurationProbe;

/** List-specific configuration facade over the shared configuration runtime. */
export class ListConfigService extends ServiceConfiguration {
  constructor(
    dataDir: string,
    env: Record<string, string | undefined>,
    configFilePath: string,
    keyFilePath: string,
    defaultApiUrl: string
  ) {
    super({
      schema: createListConfigSchema(defaultApiUrl),
      prefix: 'LIST',
      dataDir,
      env,
      configFilePath,
      keyFilePath,
      notWiredMessage: 'List provider is not wired yet',
    });
  }

  get values(): Record<string, string> {
    return this.resolvedValues();
  }

  get ready(): boolean {
    return this.missingVars().length === 0;
  }

  get schema(): ServiceConfigSchema {
    return this.getSchema();
  }
}
