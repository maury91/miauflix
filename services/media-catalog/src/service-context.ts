import type { CatalogService } from './catalog/catalog.service.ts';
import type { CatalogConfigService } from './config/config.service';
import type { CatalogDatabase } from './db/database';
import type { CardImageService } from './services/card-image.service';
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
  /** Draws and caches card images; outlives catalog replacements so its cache does too. */
  cardImages: CardImageService;
}
