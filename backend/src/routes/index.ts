import { serveStatic } from '@hono/node-server/serve-static';
import { otel } from '@hono/otel';
import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { ENV } from '@constants';
import { createAuditLogMiddleware } from '@middleware/audit-log.middleware';
import { createAuthMiddleware } from '@middleware/auth.middleware';
import { createRateLimitMiddlewareFactory } from '@middleware/rate-limit.middleware';
import { traceContextMiddleware } from '@middleware/trace-context.middleware';

import { createAuthRoutes } from './auth.routes';
import type { Deps } from './common.types';
import { createListRoutes } from './list.routes';
import { createMovieRoutes } from './movie.routes';
import { createProgressRoutes } from './progress.routes';
import { createShowRoutes } from './show.routes';
import { createStreamRoutes } from './stream.routes';
import { createTraktRoutes } from './trakt.routes';

function createApiRoutes(deps: Deps) {
  const rateLimitGuard = createRateLimitMiddlewareFactory(deps.auditLogService);

  return new Hono()
    .use(
      otel({
        augmentSpan: true,
      })
    )
    .use(traceContextMiddleware)
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

export function createRoutes(deps: Deps) {
  const frontendDir = ENV('FRONTEND_DIR');
  const corsOrigin = ENV('CORS_ORIGIN');
  const origins = corsOrigin.map((origin: string) => origin.trim()).filter(Boolean);

  const app = new Hono()
    .use(
      cors({
        origin: origins,
        allowHeaders: ['Content-Type', 'Authorization'],
        allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        credentials: origins.length !== 1 || origins[0] !== '*',
      })
    )
    .route('/api', createApiRoutes(deps));

  // Optionally serve the frontend as static files from FRONTEND_DIR
  // This allows running a single container that serves both API and SPA
  if (frontendDir) {
    app.get('/assets/*', serveStatic({ root: frontendDir }));
    app.get('/favicon.png', serveStatic({ root: frontendDir }));
    app.get('/robots.txt', serveStatic({ root: frontendDir }));
    // SPA fallback - after all API routes
    app.get('*', serveStatic({ root: frontendDir, rewriteRequestPath: () => '/index.html' }));
  }

  return app;
}

export type RoutesApp = ReturnType<typeof createRoutes>;
