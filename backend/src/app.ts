import 'reflect-metadata';

import { serve } from '@hono/node-server';
import { zValidator } from '@hono/zod-validator';
import { logger } from '@logger';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import z from 'zod';

import { Database } from '@database/database';
import { createAuditLogMiddleware } from '@middleware/audit-log.middleware';
import { authGuard, createAuthMiddleware } from '@middleware/auth.middleware';
import { createRateLimitMiddlewareFactory } from '@middleware/rate-limit.middleware';
import { createAuthRoutes } from '@routes/auth.routes';
import { AuthService } from '@services/auth/auth.service';
import { ListService } from '@services/media/list.service';
import { ListSynchronizer } from '@services/media/list.syncronizer';
import { MediaService } from '@services/media/media.service';
import { Scheduler } from '@services/scheduler';
import { AuditLogService } from '@services/security/audit-log.service';
import { VpnDetectionService } from '@services/security/vpn.service';
import { MagnetService, SourceService } from '@services/source';
import { TrackerService } from '@services/source/tracker.service';
import { WebTorrentService } from '@services/source/webtorrent.service';
import { TMDBApi } from '@services/tmdb/tmdb.api';
import { buildCache } from '@utils/caching';

import { validateConfiguration } from './configuration';
import { ENV } from './constants';

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
  await validateConfiguration();

  const db = new Database();
  await db.initialize();

  const cache = buildCache();
  const tmdbApi = new TMDBApi(cache);
  const vpnDetectionService = new VpnDetectionService();
  const auditLogService = new AuditLogService(db);
  const authService = new AuthService(db, auditLogService);
  const mediaService = new MediaService(db, tmdbApi);
  const scheduler = new Scheduler();
  const listService = new ListService(db, tmdbApi, mediaService);
  const listSynchronizer = new ListSynchronizer(listService);
  const trackerService = new TrackerService(cache);
  const webtorrentService = new WebTorrentService();
  const magnetService = new MagnetService(webtorrentService);
  const sourceService = new SourceService(db, vpnDetectionService, trackerService, magnetService);

  await authService.configureUsers();

  vpnDetectionService.on('connect', () => {
    logger.debug('App', 'VPN connected');
  });
  vpnDetectionService.on('disconnect', () => {
    logger.debug('App', 'VPN disconnected');
  });

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
    'torrentFileSearch',
    0.2, // 0.2 second (slightly slower than source search to prioritize finding new sources first)
    bind(sourceService, 'searchTorrentFilesForSources')
  );

  const app = new Hono();

  app.onError(async (err, c) => {
    logger.error('App', 'An error occured:', err);

    return c.json(
      {
        success: false,
        message: err.message || 'Internal Server Error',
        status: 500,
      },
      500
    );
  });

  app.use(
    cors({
      origin: ENV('CORS_ORIGIN'),
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization'],
      exposeHeaders: ['Content-Range', 'X-Content-Range'],
      credentials: true,
      maxAge: 86400, // 24 hours
    })
  );

  const rateLimitGuard = createRateLimitMiddlewareFactory(auditLogService);

  app.use(createAuthMiddleware(authService));
  app.use(createAuditLogMiddleware(auditLogService));

  app.get('/health', rateLimitGuard(10), c => {
    return c.json({
      status: 'ok',
    });
  });

  app.get('/status', rateLimitGuard(10), c => {
    return c.json({
      tmdb: tmdbApi.status(),
      vpn: vpnDetectionService.status(),
      trackers: trackerService.status(),
      magnetResolvers: magnetService.getServiceStatistics(),
    });
  });

  app.route('/auth', createAuthRoutes(authService, auditLogService));

  app.get('/lists', rateLimitGuard(5), authGuard(), async c => {
    const lists = await listService.getLists();
    return c.json(
      lists.map(list => ({
        name: list.name,
        slug: list.slug,
        description: list.description,
        url: `/list/${list.slug}`,
      }))
    );
  });

  app.get(
    '/list/:slug',
    rateLimitGuard(10),
    authGuard(),
    zValidator(
      'query',
      z.object({
        lang: z.string().min(2).max(5).optional(),
      })
    ),
    zValidator(
      'param',
      z.object({
        slug: z.string().min(2).max(100),
      })
    ),
    async c => {
      const slug = c.req.valid('param').slug;
      const lang = c.req.valid('query').lang;

      const list = await listService.getListContent(slug, lang);
      return c.json({
        results: list,
        total: list.length,
      });
    }
  );

  const port = ENV.number('PORT');
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
