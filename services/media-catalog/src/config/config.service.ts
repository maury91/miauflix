import { join } from 'node:path';

import { ServiceConfiguration } from '@miauflix/service-configuration';

import { logger } from '../logger';
import { CATALOG_CONFIG_SCHEMA } from './schema';

/** Catalog-specific wiring around the shared service configuration runtime. */
export class CatalogConfigService extends ServiceConfiguration {
  constructor(
    dataDir: string,
    env: Record<string, string | undefined> = process.env,
    configFilePath = env.CATALOG_CONFIG_FILE ?? join(dataDir, 'config.json'),
    keyFilePath = env.CATALOG_KEY_FILE ?? join(dataDir, '.catalog-key')
  ) {
    super({
      schema: CATALOG_CONFIG_SCHEMA,
      prefix: 'CATALOG',
      dataDir,
      env,
      configFilePath,
      keyFilePath,
      notWiredMessage: 'Catalog provider is not wired yet',
      onLoadError: message =>
        logger.error('CatalogConfig', `Could not load owned configuration: ${message}`),
    });
  }
}
