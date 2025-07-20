import { Hono } from 'hono';

import { createAuditLogMiddleware } from '@middleware/audit-log.middleware';
import { createAuthMiddleware } from '@middleware/auth.middleware';
import { createRateLimitMiddlewareFactory } from '@middleware/rate-limit.middleware';

import { createAuthRoutes } from './auth.routes';
import type { Deps } from './common.types';
import { createListRoutes } from './list.routes';
import { createMovieRoutes } from './movie.routes';
import { createProgressRoutes } from './progress.routes';
import { createShowRoutes } from './show.routes';
import { createStreamRoutes } from './stream.routes';
import { createTraktRoutes } from './trakt.routes';

export function createRoutes(deps: Deps) {
  const rateLimitGuard = createRateLimitMiddlewareFactory(deps.auditLogService);

  return new Hono()
    .use(createAuthMiddleware(deps.authService))
    .use(createAuditLogMiddleware(deps.auditLogService))
    .get('/health', rateLimitGuard(10), c => {
      return c.json({ status: 'ok' });
    })
    .get('/status', rateLimitGuard(10), c => {
      return c.json({
        tmdb: deps.tmdbApi.status(),
        vpn: deps.vpnDetectionService.status(),
        contentDirectories: deps.contentDirectoryService.status(),
        magnetResolvers: deps.magnetService.status(),
      });
    })
    .route('/auth', createAuthRoutes(deps))
    .route('/movies', createMovieRoutes(deps))
    .route('/shows', createShowRoutes(deps))
    .route('/stream', createStreamRoutes(deps))
    .route('/trakt', createTraktRoutes(deps))
    .route('/progress', createProgressRoutes(deps))
    .route('/', createListRoutes(deps));
}

export type RoutesApp = ReturnType<typeof createRoutes>;
