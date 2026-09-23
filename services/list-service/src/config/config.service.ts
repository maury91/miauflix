import { ServiceConfiguration } from '@miauflix/service-configuration';
import type { ServiceConfigSchema } from '@miauflix/service-contracts';

import { createListConfigSchema } from './schema';

/** List-specific configuration facade over the shared configuration runtime. */
export class ListConfigService extends ServiceConfiguration {
  constructor() {
    super({
      schema: createListConfigSchema(),
      notWiredMessage: 'Trakt provider is not wired yet',
    });
  }

  get schema(): ServiceConfigSchema {
    return this.getSchema();
  }
}
