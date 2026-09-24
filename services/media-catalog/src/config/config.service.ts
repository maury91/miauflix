import { ServiceConfiguration } from '@miauflix/service-configuration';

import { CATALOG_CONFIG_SCHEMA } from './schema';

/** Catalog runtime configuration is supplied and owned by the backend. */
export class CatalogConfigService extends ServiceConfiguration {
  constructor() {
    super({
      schema: CATALOG_CONFIG_SCHEMA,
      notWiredMessage: 'Catalog provider is not wired yet',
    });
  }
}
