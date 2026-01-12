import './instrumentation';
import 'reflect-metadata';

import { serve } from '@hono/node-server';
import { logger } from '@logger';

import { Database } from '@database/database';
import { AuthError, InvalidTokenError, LoginError, RoleError } from '@errors/auth.errors';
import { AuthService } from '@services/auth/auth.service';
import { CacheService } from '@services/cache/cache.service';
import { DownloadService } from '@services/download/download.service';
import { EncryptionService } from '@services/encryption/encryption.service';
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
import { TMDBApi } from '@services/tmdb/tmdb.api';
import { TraktService } from '@services/trakt/trakt.service';

import { validateConfiguration } from './configuration';
import { ENV } from './constants';
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

  await validateConfiguration({
    // If --only-config is used, it implies --config as well
    forceReconfigure: forceReconfigure || configOnly,
    configOnly,
  });

  const encryptionService = new EncryptionService();
  const db = new Database(encryptionService);
  await db.initialize();

  const cacheService = new CacheService();
  const statsService = new StatsService();
  const requestService = new RequestService(statsService);
  const tmdbApi = new TMDBApi(cacheService.cache, statsService);
  const vpnDetectionService = new VpnDetectionService();
  const auditLogService = new AuditLogService(db);
  const authService = new AuthService(db, auditLogService);
  const traktService = new TraktService(db, authService);
  const mediaService = new MediaService(db, tmdbApi);
  const scheduler = new Scheduler();
  const listService = new ListService(db, tmdbApi, mediaService);
  const listSynchronizer = new ListSynchronizer(listService);
  const storageService = new StorageService(db);
  const downloadService = new DownloadService(storageService, requestService);
  const contentDirectoryService = new ContentDirectoryService(
    cacheService.cache,
    downloadService,
    requestService,
    statsService
  );
  const magnetService = new SourceMetadataFileService(
    downloadService,
    requestService,
    statsService
  );
  const sourceService = new SourceService(
    db,
    vpnDetectionService,
    contentDirectoryService,
    magnetService,
    requestService
  );
  const streamService = new StreamService(db, sourceService, downloadService, mediaService);

  await authService.configureUsers();

  vpnDetectionService.on('connect', () => {
    logger.debug('App', 'VPN connected');
  });
  vpnDetectionService.on('disconnect', () => {
    logger.debug('App', 'VPN disconnected');
  });

  // Check if background tasks should be disabled
  const disableBackgroundTasks = ENV('DISABLE_BACKGROUND_TASKS');

  if (disableBackgroundTasks) {
    logger.info('App', 'Background tasks disabled - running in on-demand mode only');
  } else {
    logger.info('App', 'Starting background tasks...');

    scheduler.scheduleTask(
      'refreshLists',
      60 * 60, // 1 hour
      bind(listSynchronizer, 'synchronize')
    );

    scheduler.scheduleTask(
      'syncMovies',
      1.5 * 60 * 60, // 1.5 hour
      bind(mediaService, 'syncMovies')
    );

    scheduler.scheduleTask(
      'syncIncompleteSeasons',
      1, // 1 second
      bind(mediaService, 'syncIncompleteSeasons')
    );

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
    const taskNames = scheduler.listTasks();
    for (const taskName of taskNames) {
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

  // Compose all routes using createRoutes
  const app = createRoutes({
    authService,
    auditLogService,
    mediaService,
    sourceService,
    listService,
    tmdbApi,
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

    if (err instanceof AuthError || err instanceof InvalidTokenError) {
      return c.json(
        {
          error: 'Authentication required',
          message: err.message,
        },
        401
      );
    }

    if (err instanceof LoginError) {
      return c.json(
        {
          error: 'Invalid credentials',
          message: err.message,
        },
        401
      );
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

    // For other errors, return 500
    return c.json(
      {
        success: false,
        message: err.message || 'Internal Server Error',
        status: 500,
      },
      500
    );
  });

  const port = ENV('PORT');
  const server = serve({
    fetch: app.fetch,
    port,
  });

  server.on('error', err => {
    logger.error('App', `Server error: ${err}`);
  });

  server.on('listening', () => {
    logger.info('App', `Server is listening on http://localhost:${port}`);
  });
} catch (error) {
  logger.error('App', `Error during application startup: `, error);
  process.exit(1);
}
