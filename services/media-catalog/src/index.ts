import { serve } from '@miauflix/contract';

import { CatalogRuntime } from './catalog/bootstrap';
import { CatalogConfigService } from './config/config.service';
import { CatalogDatabase } from './db/database';
import { loadEnv } from './env';
import { logger } from './logger';
import { createCatalogService } from './service';
import type { ServiceContext } from './service-context';

const SCOPE = 'MediaCatalog';

/**
 * Boot sequence. The server binds immediately so /health and the management
 * control plane (`/_c`) are reachable in every lifecycle state — the main app configures
 * this service through them, possibly before anything else is up. The catalog data
 * plane attaches after a successful main-app configuration apply or a local
 * env/file configuration reload (standalone mode). Workers are broker-optional and
 * retried in the background.
 */

const env = loadEnv();
const db = new CatalogDatabase(env.dataDir);
const config = new CatalogConfigService();

const context: ServiceContext = {
  env,
  config,
  db,
  catalog: null,
};

const runtime = new CatalogRuntime(context, config);

const service = createCatalogService(context);
const server = await serve(service, { hostname: env.host, port: env.port });

logger.info(SCOPE, `Media catalog service listening on http://${env.host}:${env.port}`);

let shutdownPromise: Promise<void> | undefined;
let exitCode = 0;
const shutdown = (signal: string, code = 0): Promise<void> => {
  exitCode = Math.max(exitCode, code);
  shutdownPromise ??= (async () => {
    logger.info(SCOPE, `Received ${signal}, shutting down...`);
    try {
      await server.stop();
      await runtime.stop();
      db.close();
    } catch (error) {
      exitCode = 1;
      logger.error(SCOPE, 'Shutdown failed', error);
    }
    process.exit(exitCode);
  })();
  return shutdownPromise;
};

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('uncaughtException', error => {
  logger.error(SCOPE, 'Uncaught exception', error);
  void shutdown('uncaughtException', 1);
});
process.on('unhandledRejection', reason => {
  logger.error(SCOPE, 'Unhandled rejection', reason);
});
