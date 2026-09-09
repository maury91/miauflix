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
 * plane attaches on the first successful configuration probe ("green flag"), which
 * can come from the main app's push or from local env/file configuration
 * (standalone mode). Workers are broker-optional and retried in the background.
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

const shutdown = (signal: string) => {
  logger.info(SCOPE, `Received ${signal}, shutting down...`);
  server.stop(true);
  db.close();
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', error => {
  logger.error(SCOPE, 'Uncaught exception', error);
});
process.on('unhandledRejection', reason => {
  logger.error(SCOPE, 'Unhandled rejection', reason);
});
