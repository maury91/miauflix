import 'reflect-metadata';

import { serve } from '@hono/node-server';
import { logger } from '@logger';

import { Database } from '@database/database';
import { AuthError, InvalidTokenError, LoginError, RoleError } from '@errors/auth.errors';
import { ServiceNotConfiguredError } from '@errors/service-not-configured.error';
import type { ServiceInstanceStatus } from '@mytypes/configuration';
import { AuthService } from '@services/auth/auth.service';
import { CacheService } from '@services/cache/cache.service';
import { ConfigurationService } from '@services/configuration/configuration.service';
import { ContentCatalogService } from '@services/content-catalog/content-catalog.service';
import { TMDBApi } from '@services/content-catalog/tmdb/tmdb.api';
import { TmdbService } from '@services/content-catalog/tmdb/tmdb.service';
import { TraktService } from '@services/content-catalog/trakt/trakt.service';
import { DownloadService } from '@services/download/download.service';
import { ListService } from '@services/media/list.service';
import { ListSynchronizer } from '@services/media/list.syncronizer';
import { MediaService } from '@services/media/media.service';
import { RequestService } from '@services/request/request.service';
import { Scheduler } from '@services/scheduler';
import { AuditLogService } from '@services/security/audit-log.service';
import { VpnDetectionService } from '@services/security/vpn.service';
import { SourceMetadataFileService, SourceService } from '@services/source';
import { ContentDirectoryService } from '@services/source-metadata/content-directory.service';
import { StatsService } from '@services/stats/stats.service';
import { StorageService } from '@services/storage/storage.service';
import { StreamService } from '@services/stream/stream.service';

import { initializeInstrumentation } from './instrumentation';
import { createRoutes } from './routes';

type Methods<T> = {
  [K in keyof T]: T[K] extends (...args: unknown[]) => void ? T[K] : never;
};

const bind =
  <T extends object, K extends keyof Methods<T>>(
    instance: T,
    method: K,
    ...args: Parameters<Methods<T>[K]>
  ) =>
  () => {
    return (instance[method] as Methods<T>[K])(...args);
  };

// Enhanced error handling
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise);
  console.error('Reason:', reason);
  // Don't exit, keep the server running
});

process.on('uncaughtException', error => {
  console.error('Uncaught Exception:', error);
  // Don't exit, keep the server running
});

try {
  const args = process.argv.slice(2);
  const forceReconfigure = args.includes('--config');
  const configOnly = args.includes('--only-config');

  // Create and initialize the configuration service, it is used by all the other services for configuring themeself
  const configurationService = new ConfigurationService();
  await configurationService.init();
  // OTEL
  initializeInstrumentation(configurationService);

  // Initialize DB
  const db = new Database(configurationService);
  await db.initialize();

  // Create ( and initialize ) all the services
  const cacheService = new CacheService(configurationService);
  const statsService = new StatsService();
  const requestService = new RequestService(statsService, configurationService);
  const tmdbApi = new TMDBApi(cacheService.cache, statsService, configurationService);
  const tmdbService = new TmdbService(db, tmdbApi, configurationService);
  const vpnDetectionService = new VpnDetectionService(configurationService);
  const auditLogService = new AuditLogService(db, configurationService);
  const authService = new AuthService(db, auditLogService, configurationService);
  const traktService = new TraktService(db, authService, configurationService);
  const catalogService = new ContentCatalogService(tmdbService, traktService);
  const mediaService = new MediaService(db, tmdbService);
  const scheduler = new Scheduler(configurationService);
  const listService = new ListService(db, tmdbService, mediaService);
  const listSynchronizer = new ListSynchronizer(listService);
  const storageService = new StorageService(db, configurationService);
  const downloadService = new DownloadService(storageService, requestService, configurationService);
  const contentDirectoryService = new ContentDirectoryService(
    cacheService.cache,
    downloadService,
    requestService,
    statsService,
    configurationService
  );
  const magnetService = new SourceMetadataFileService(
    downloadService,
    requestService,
    statsService,
    configurationService
  );
  const sourceService = new SourceService(
    db,
    vpnDetectionService,
    contentDirectoryService,
    magnetService,
    requestService,
    configurationService
  );
  const streamService = new StreamService(db, sourceService, downloadService, mediaService);
  const serverService = {
    _status: {
      status: 'initializing',
      details: 'Waiting for HTTP server to start',
      startedAt: Date.now(),
    } as ServiceInstanceStatus,
    getStatus(): ServiceInstanceStatus {
      return serverService._status;
    },
    reload: async () => {},
  };
  configurationService.registerService('SERVER', serverService);

  // Run the configuration setup, if the environment is interactive the setup will guide the user into configuring all the unconfigured services
  // if it is not, it will still be possible through the frontend
  await configurationService.runSetup({
    forceReconfigure: forceReconfigure || configOnly,
    configOnly,
  });
  // Create initial admin ( if it does not exist, also we do not create if the server runs in the mode that allows creating it from the frontend )
  await authService.configureUsers();

  // FixMe: Just log the status of the VPN, we will do something more serious later
  vpnDetectionService.on('connect', () => {
    logger.debug('App', 'VPN connected');
  });
  vpnDetectionService.on('disconnect', () => {
    logger.debug('App', 'VPN disconnected');
  });

  const disableBackgroundTasks = configurationService.get('DISABLE_BACKGROUND_TASKS');
  if (disableBackgroundTasks) {
    logger.info('App', 'Background tasks disabled - running in on-demand mode only');
  } else {
    logger.info('App', 'Starting background tasks...');

    scheduler.scheduleTask(
      'refreshLists',
      60 * 60, // 1 hour
      bind(listSynchronizer, 'synchronize')
    );

    scheduler.scheduleTasks(catalogService.getSyncTasks());

    scheduler.scheduleTask(
      'movieSourceSearch',
      0.1, // 0.1 second
      bind(sourceService, 'searchSourcesForMovies')
    );

    scheduler.scheduleTask(
      'dataFileSearch',
      0.2, // 0.2 second (slightly slower than source search to prioritize finding new sources first)
      bind(sourceService, 'syncMissingSourceFiles')
    );

    scheduler.scheduleTask(
      'updateSourcesStats',
      2, // 2 seconds
      bind(sourceService, 'syncStatsForSources')
    );

    scheduler.scheduleTask(
      'cacheCleanup',
      6 * 60 * 60, // 6 hours
      bind(cacheService, 'cleanup')
    );
  }

  // Graceful shutdown handlers
  const gracefulShutdown = async (signal: string) => {
    logger.info('App', `Received ${signal}, shutting down gracefully...`);

    // Stop all scheduled tasks
    for (const taskName of scheduler.listTasks()) {
      try {
        scheduler.cancelTask(taskName);
        logger.debug('App', `Cancelled task: ${taskName}`);
      } catch (error) {
        logger.warn('App', `Failed to cancel task ${taskName}:`, error);
      }
    }

    await db.close();

    // Give some time for ongoing operations to complete
    setTimeout(() => {
      process.exit(0);
    }, 5000);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  const app = createRoutes({
    authService,
    auditLogService,
    catalogService,
    configurationService,
    mediaService,
    scheduler,
    sourceService,
    listService,
    vpnDetectionService,
    contentDirectoryService,
    magnetService,
    traktService,
    downloadService,
    streamService,
    requestService,
    statsService,
  });

  // Error handling middleware - must be added first
  app.onError((err, c) => {
    logger.error('App', `An error occured: ${err.name}: ${err.message}`);

    if (err instanceof ServiceNotConfiguredError) {
      return c.json(
        {
          error: `Service '${err.service}' is not configured`,
          needsConfiguration: true,
          service: err.service,
        },
        503
      );
    }
    if (err instanceof AuthError || err instanceof InvalidTokenError) {
      return c.json({ error: 'Authentication required', message: err.message }, 401);
    }
    if (err instanceof LoginError) {
      return c.json({ error: 'Invalid credentials', message: err.message }, 401);
    }
    if (err instanceof RoleError) {
      return c.json(
        {
          error: 'Insufficient permissions',
          message: err.message,
        },
        403
      );
    }

    return c.json(
      {
        success: false,
        message: err.message || 'Internal Server Error',
        status: 500,
      },
      500
    );
  });

  const port = configurationService.getOrThrow('PORT');
  const server = serve({ fetch: app.fetch, port });
  server.on('error', err => {
    logger.error('App', `Server error: ${err}`);
    serverService._status = { status: 'error', errorMessage: err.message, error: err };
  });
  server.on('listening', () => {
    logger.info('App', `Server is listening on http://localhost:${port}`);
    serverService._status = { status: 'ready' };
  });
} catch (error) {
  logger.error('App', `Error during application startup: `, error);
  process.exit(1);
}
