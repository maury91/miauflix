import type { ServiceConfigSchema } from '@miauwatch/contract';
import { ServiceConfiguration } from '@miauwatch/service-configuration';

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
