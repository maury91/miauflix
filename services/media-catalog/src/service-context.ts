import type { CatalogService } from './catalog/catalog.service.ts';
import type { CatalogConfigService } from './config/config.service';
import type { CatalogDatabase } from './db/database';
import type { ServiceEnv } from './env';

/**
 * Shared wiring handed to the HTTP handlers. `catalog` is the data plane and is
 * null until the provider stack is wired (boot without a usable catalog keeps
 * serving /health, /status and /configuration*).
 */
export interface ServiceContext {
  env: ServiceEnv;
  config: CatalogConfigService;
  db: CatalogDatabase;
  catalog: CatalogService | null;
}
