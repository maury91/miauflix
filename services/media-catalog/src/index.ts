import { CatalogRuntime } from './catalog/bootstrap';
import { CatalogConfigService } from './config/config.service';
import { CatalogDatabase } from './db/database';
import { registerConfigurationRoutes } from './http/handlers/configuration';
import { registerMediaRoutes } from './http/handlers/media';
import { registerSystemRoutes } from './http/handlers/system';
import { Router } from './http/router';
import { loadEnv } from './env';
import { logger } from './logger';
import type { ServiceContext } from './service-context';

const SCOPE = 'MediaCatalog';

/**
 * Boot sequence. The HTTP server binds immediately so /health, /status and
 * /configuration* are reachable in every lifecycle state — the main app configures
 * this service through them, possibly before anything else is up. The catalog data
 * plane attaches after a successful main-app configuration apply or a local
 * env/file configuration reload (standalone mode). Workers are broker-optional and
 * retried in the background.
 */

const env = loadEnv();
const db = new CatalogDatabase(env.dataDir);
const config = new CatalogConfigService(env.dataDir);

const context: ServiceContext = {
  env,
  config,
  db,
  catalog: null,
};

// Self-activation: without the main app, the service can become ready from its own
// env / last-known-good configuration (standalone mode).
const runtime = new CatalogRuntime(context, config);
void runtime.tryActivate();

const router = new Router();
registerSystemRoutes(router, context);
registerConfigurationRoutes(router, context);
registerMediaRoutes(router, context);

const server = Bun.serve({
  hostname: env.host,
  port: env.port,
  fetch: req => router.handle(req),
});

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
