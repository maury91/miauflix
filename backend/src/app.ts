import 'reflect-metadata';

import { logger } from '@logger';

import { Database } from '@database/database';
import { MigrationService } from '@database/migrations/migration.service';
import { handleError } from '@middleware/error-handler.middleware';
import type { ServiceInstanceStatus } from '@mytypes/configuration';
import { MediaRatingRepository } from '@repositories/media-rating.repository';
import { RecentSearchRepository } from '@repositories/recent-search.repository';
import { AuthService } from '@services/auth/auth.service';
import { QrLoginService } from '@services/auth/qr-login.service';
import { registerBackgroundJobHandlers } from '@services/background-job/background-job.handlers';
import { BackgroundJobService } from '@services/background-job/background-job.service';
import { BackgroundJobWorker } from '@services/background-job/background-job.worker';
import { ServiceScheduleCoordinator } from '@services/background-job/service-schedule.coordinator';
import { CacheService } from '@services/cache/cache.service';
import { CatalogClientService } from '@services/catalog/catalog-client.service';
import { ConfigurationService } from '@services/configuration/configuration.service';
import { ListClientService } from '@services/list/list-client.service';
import { EpisodeNumberingService } from '@services/media/episode-numbering.service';
import { ListService } from '@services/media/list.service';
import { MediaService } from '@services/media/media.service';
import { MediaLoadClientService } from '@services/media-load/media-load-client.service';
import { createStorageHandoff } from '@services/media-load/storage-handoff';
import { NotificationService } from '@services/notifications/notification.service';
import { AudioPlaybackService } from '@services/playback/audio-playback.service';
import { PlaybackPiecesService } from '@services/playback/playback-pieces.service';
import { PlaybackSessionService } from '@services/playback/playback-session.service';
import { PlaybackTargetService } from '@services/playback/playback-target.service';
import { StreamService } from '@services/playback/stream.service';
import { PlayablePreparationService } from '@services/preload/playable-preparation.service';
import { PreloadIntentService } from '@services/preload/preload-intent.service';
import { SourceWarmupController } from '@services/preload/source-warmup.controller';
import { ProfileService } from '@services/profile/profile.service';
import { ProgressService } from '@services/progress/progress.service';
import { MediaRatingService } from '@services/ratings/media-rating.service';
import { RealtimeGateway } from '@services/realtime/realtime.gateway';
import { RealtimeSearchChannel } from '@services/realtime/realtime.search';
import { RequestService } from '@services/request/request.service';
import { SearchService } from '@services/search/search.service';
import { AuditLogService } from '@services/security/audit-log.service';
import { createSecurityCleanup } from '@services/security/security-cleanup';
import { SourceMetadataFileService, SourceService } from '@services/source';
import { SourceAvailabilityService } from '@services/source/source-availability.service';
import { SourceHealthService } from '@services/source/source-health.service';
import { SourcesClientService } from '@services/sources-client/sources-client.service';
import { StatsService } from '@services/stats/stats.service';
import { StorageInventoryService } from '@services/storage/storage-inventory.service';
import { SourceSubtitlesService } from '@services/subtitles/source-subtitles.service';
import { SubtitlesService } from '@services/subtitles/subtitles.service';
import { TvPairingService } from '@services/tv-pairing/tv-pairing.service';

import { initializeInstrumentation } from './instrumentation';
import { createRoutes } from './routes';

// Enhanced error handling
process.on('unhandledRejection', reason => {
  // Through the logger, which redacts source identifiers from the reason.
  logger.error('App', 'Unhandled Rejection', reason);
  // Don't exit, keep the server running
});

process.on('uncaughtException', error => {
  logger.error('App', 'Uncaught Exception, exiting', error);
  // After an uncaught exception the process state is unknown (half-finished writes, broken
  // invariants, leaked locks). Exit and let Docker's restart policy start a clean process; the
  // database is safe to stop at any point (SQLite WAL). Queued audit events (≤1 s) are lost.
  process.exit(1);
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

  // Remote services
  const catalogClient = new CatalogClientService(configurationService);
  await catalogClient.initialize();
  const listClient = new ListClientService(configurationService);
  await listClient.initialize();
  const sourcesClientService = new SourcesClientService(configurationService);
  await sourcesClientService.initialize();
  const mediaLoadClient = new MediaLoadClientService(configurationService);
  await mediaLoadClient.initialize();

  // Initialize DB
  const db = new Database(configurationService);
  await db.initialize();
  // Data migrations finish before any service reads the data; a failure stops startup.
  await new MigrationService(db).run();
  // media-load reports ready once it holds the storage recorded here before it ran the engine.
  mediaLoadClient.setStorageHandoff(createStorageHandoff(db));

  // Create ( and initialize ) all the services
  const cacheService = new CacheService(configurationService);
  const statsService = new StatsService();
  const requestService = new RequestService(statsService, configurationService);
  const tvPairingService = new TvPairingService(configurationService);
  const auditLogService = new AuditLogService(db, configurationService);
  const authService = new AuthService(db, auditLogService, configurationService);
  const qrLoginService = new QrLoginService(db, configurationService);
  const profileService = new ProfileService(db, configurationService);
  const progressService = new ProgressService(
    db,
    listClient,
    new EpisodeNumberingService(db, catalogClient)
  );
  const notificationService = new NotificationService(db);
  const mediaService = new MediaService(db, catalogClient);
  const backgroundJobs = new BackgroundJobService(configurationService);
  const backgroundWorker = new BackgroundJobWorker(backgroundJobs);
  const listService = new ListService(db, catalogClient, listClient, backgroundJobs);
  const sourceHealthService = new SourceHealthService();
  const sourceAvailabilityService = new SourceAvailabilityService(db, notificationService);
  // Every file list that becomes known decides whether its source is real.
  mediaLoadClient.onLayout((sourceId, layout) => {
    sourceAvailabilityService.recordFiles(sourceId, layout.files).catch(error => {
      logger.warn('App', `Unable to record the file list of source ${sourceId}`, error);
    });
  });
  const magnetService = new SourceMetadataFileService(
    mediaLoadClient,
    statsService,
    configurationService,
    { sourcesClient: sourcesClientService }
  );
  const sourceService = new SourceService({
    db,
    peers: mediaLoadClient,
    sourcesClient: sourcesClientService,
    magnetService,
    config: configurationService,
    backgroundJobs,
    notifications: notificationService,
    availability: sourceAvailabilityService,
  });
  const playbackTargetService = new PlaybackTargetService(
    db,
    mediaLoadClient,
    sourceHealthService,
    sourceAvailabilityService
  );
  const streamService = new StreamService(db, sourceService, mediaService, playbackTargetService);
  const audioPlaybackService = new AudioPlaybackService(
    mediaLoadClient,
    configurationService,
    db.getMediaProbeRepository()
  );
  const sourceSubtitlesService = new SourceSubtitlesService(mediaLoadClient);
  const sourceWarmupController = new SourceWarmupController(
    mediaLoadClient,
    async (target, playableKey, subtitleLanguage, signal) => {
      await Promise.allSettled([
        audioPlaybackService.inspect(target, {}, true, signal),
        sourceSubtitlesService.discover(target, true, signal),
        (async () => {
          const movieId = /^m:(\d+)$/.exec(playableKey)?.[1];
          if (!movieId) return;
          const movie = await mediaService.getLocalMovieByMediaId(Number(movieId));
          await subtitlesService.warmSearch(movie?.imdbId, subtitleLanguage ?? 'en');
        })(),
      ]);
    }
  );
  const playablePreparationService = new PlayablePreparationService({
    mediaService,
    sourceService,
    warmup: sourceWarmupController,
    storage: mediaLoadClient,
    targets: playbackTargetService,
    sourceHealth: sourceHealthService,
  });
  const preloadIntentService = new PreloadIntentService(
    playablePreparationService,
    sourceWarmupController,
    db.getProgressRepository()
  );
  const playbackSessionService = new PlaybackSessionService({
    db,
    preparation: playablePreparationService,
    config: configurationService,
    warmup: sourceWarmupController,
    storage: mediaLoadClient,
    audioPlaybackService,
    sourceHealth: sourceHealthService,
    downloads: mediaLoadClient,
    progress: db.getProgressRepository(),
    playedSources: db.getContentSourceRepository(),
  });
  const playbackPiecesService = new PlaybackPiecesService(
    playbackSessionService,
    mediaLoadClient,
    db.getContentSourceRepository()
  );
  const realtimeGateway = new RealtimeGateway({
    authService,
    config: configurationService,
    preload: preloadIntentService,
    progress: progressService,
    catalog: catalogClient,
    playback: playbackSessionService,
    search: new RealtimeSearchChannel(
      new SearchService(catalogClient, new RecentSearchRepository(db))
    ),
    availability: sourceAvailabilityService,
    pieces: playbackPiecesService,
  });
  const subtitlesService = new SubtitlesService({
    config: configurationService,
    requestService,
    playbackSessionService,
    streamService,
    sourceSubtitles: sourceSubtitlesService,
  });

  const serverService = {
    testable: false as const,
    _status: {
      status: 'initializing',
      details: 'Waiting for HTTP server to start',
      startedAt: Date.now(),
    } as ServiceInstanceStatus,
    getStatus(): ServiceInstanceStatus {
      return serverService._status;
    },
    reload: async () => {
      serverService._status = { status: 'ready' };
    },
  };
  configurationService.registerService('SERVER', serverService);
  configurationService.registerService('CATALOG', catalogClient);
  configurationService.registerService('LIST', listClient);
  configurationService.registerService('SOURCES', sourcesClientService);
  configurationService.registerService('MEDIA_LOAD', mediaLoadClient);

  // Run the configuration setup, if the environment is interactive the setup will guide the user into configuring all the unconfigured services
  // if it is not, it will still be possible through the frontend
  await configurationService.runSetup({
    forceReconfigure: forceReconfigure || configOnly,
    configOnly,
  });
  configurationService.registerService('QUEUE', backgroundJobs);
  // Create initial admin ( if it does not exist, also we do not create if the server runs in the mode that allows creating it from the frontend )
  await authService.configureUsers();

  const disableBackgroundTasks = configurationService.get('DISABLE_BACKGROUND_TASKS');
  const scheduleCoordinator = new ServiceScheduleCoordinator({
    jobs: backgroundJobs,
    config: configurationService,
    catalog: catalogClient,
    lists: listService,
    listClient,
  });
  if (disableBackgroundTasks) {
    logger.info('App', 'Background tasks disabled - running in on-demand mode only');
  } else {
    logger.info('App', 'Starting background tasks...');

    registerBackgroundJobHandlers({
      backgroundJobs,
      cacheService,
      listService,
      listClient,
      magnetService,
      mediaService,
      notificationService,
      sourceService,
      mediaLoadClient,
      progressService,
      playbackTargets: playbackTargetService,
      securityCleanup: createSecurityCleanup({
        'audit logs': () => auditLogService.cleanupOldLogs(),
        'QR login requests': () => qrLoginService.cleanup(),
        'expired refresh tokens': () => db.getRefreshTokenRepository().deleteExpired(),
        'expired streaming keys': () => db.getStreamingKeyRepository().deleteExpired(),
      }),
      worker: backgroundWorker,
    });

    backgroundWorker.start();
  }
  scheduleCoordinator.start(!disableBackgroundTasks);

  const httpServer: { current?: ReturnType<typeof Bun.serve> } = {};
  let shutdownPromise: Promise<void> | undefined;

  // Graceful shutdown handlers. Stop accepting new work first, then drain
  // existing HTTP handlers before closing the services they depend on.
  const gracefulShutdown = (signal: string): Promise<void> => {
    if (shutdownPromise) return shutdownPromise;
    shutdownPromise = (async () => {
      logger.info('App', `Received ${signal}, shutting down gracefully...`);

      let drained = Promise.resolve();
      if (httpServer.current) {
        // Stops listening at once; resolves when the in-flight requests have finished.
        drained = httpServer.current.stop();
      }
      realtimeGateway.close();
      playbackPiecesService.close();
      tvPairingService.stop();
      await scheduleCoordinator.stop();
      catalogClient.stop();
      listClient.stop();
      sourceService.stop();
      sourcesClientService.stop();
      await backgroundWorker.stop();
      preloadIntentService.close();
      backgroundJobs.close();

      // Do not leave a request holding the database open indefinitely.
      await Promise.race([drained, new Promise<void>(resolve => setTimeout(resolve, 5_000))]);

      sourceSubtitlesService.close();
      await audioPlaybackService.close();
      // After the drain: open streams read through it.
      mediaLoadClient.stop();
      await auditLogService.close();
      await db.close();
      process.exit(0);
    })();
    return shutdownPromise;
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  const app = createRoutes({
    mediaRatingService: new MediaRatingService(new MediaRatingRepository(db)),
    storageInventoryService: new StorageInventoryService({
      contentSources: db.getContentSourceRepository(),
      mediaLoadClient,
    }),
    authService,
    auditLogService,
    catalogClient,
    configurationService,
    mediaService,
    sourceService,
    sourceAvailabilityService,
    listService,
    listClient,
    sourcesClientService,
    magnetService,
    qrLoginService,
    profileService,
    mediaLoadClient,
    streamService,
    requestService,
    statsService,
    preloadIntentService,
    playbackSessionService,
    audioPlaybackService,
    progressService,
    notificationService,
    subtitlesService,
    tvPairingService,
  });

  app.onError(handleError);

  const port = configurationService.getOrThrow('PORT');
  httpServer.current = Bun.serve({
    port,
    // Bun closes a connection after this many idle seconds (default 10). A stream can wait
    // longer than that for its first pieces, so allow the maximum.
    idleTimeout: 255,
    fetch: (request, server) =>
      realtimeGateway.handles(request)
        ? realtimeGateway.upgrade(request, server)
        : app.fetch(request, server),
    websocket: realtimeGateway.websocket,
  });
  logger.info('App', `Server is listening on http://localhost:${port}`);
  serverService._status = { status: 'ready' };
  tvPairingService.start();
} catch (error) {
  logger.error('App', `Error during application startup: `, error);
  process.exit(1);
}
