import { httpInstrumentationMiddleware } from '@hono/otel';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { getConnInfo, serveStatic } from 'hono/bun';

import { createAuditLogMiddleware } from '@middleware/audit-log.middleware';
import { authGuard, createAuthMiddleware } from '@middleware/auth.middleware';
import { createCorsMiddleware } from '@middleware/cors.middleware';
import { createRateLimitMiddlewareFactory } from '@middleware/rate-limit.middleware';
import { createSecurityHeadersMiddleware } from '@middleware/security-headers.middleware';
import { traceContextMiddleware } from '@middleware/trace-context.middleware';
import { expandEquivalentOrigins, isTvAppOrigin } from '@utils/origin.util';

import { createAuthRoutes } from './auth.routes';
import type { Deps } from './common.types';
import { createConfigRoutes } from './config.routes';
import { createIntegrationRoutes } from './integrations.routes';
import { createListRoutes } from './list.routes';
import { createMediaRoutes } from './media.routes';
import { createMovieRoutes } from './movie.routes';
import { createNotificationRoutes } from './notifications.routes';
import { createPlaybackRoutes } from './playback.routes';
import { createPreloadRoutes } from './preload.routes';
import { createProfileRoutes } from './profile.routes';
import { createProgressRoutes } from './progress.routes';
import { createRatingRoutes } from './ratings.routes';
import { createShowRoutes } from './show.routes';
import { createSourcesRoutes } from './sources.routes';
import { createStorageRoutes } from './storage.routes';
import { createStreamRoutes } from './stream.routes';
import { createSubtitleRoutes } from './subtitles.routes';

/** Request bodies are small JSON; the avatar upload has its own, larger, limit. */
const MAX_API_BODY_BYTES = 256 * 1024;
const AVATAR_UPLOAD_PATH = '/api/auth/session/avatar';

function createApiRoutes(deps: Deps) {
  const limitBody = bodyLimit({
    maxSize: MAX_API_BODY_BYTES,
    onError: c => c.json({ error: 'Request body is too large' }, 413),
  });

  const rateLimitGuard = createRateLimitMiddlewareFactory(
    deps.auditLogService,
    deps.configurationService
  );

  return (
    new Hono()
      .use(httpInstrumentationMiddleware({}))
      .use((c, next) => (c.req.path === AVATAR_UPLOAD_PATH ? next() : limitBody(c, next)))
      .use(traceContextMiddleware)
      .use(
        createAuthMiddleware(
          deps.authService,
          () => deps.configurationService.get('ACCESS_TOKEN_COOKIE_NAME') ?? '__at'
        )
      )
      .use(createAuditLogMiddleware(deps.auditLogService))
      // This endpoint is not rate limited because a flood attack would mark the container as unhealthy and trigger the restart
      .get('/health', c => {
        // `service` lets the TV app tell a Miauflix server apart when it scans the network
        return c.json({ status: 'ok', service: 'miauflix' });
      })
      .get('/stats', rateLimitGuard(10), authGuard(), c => {
        return c.json(deps.statsService.report());
      })
      .get('/status', rateLimitGuard(10), c => {
        // Services that reach trackers, peers or indexers report their own VPN check as `vpn`.
        return c.json({ services: deps.configurationService.getServiceStatuses() });
      })
      .route('/auth', createAuthRoutes(deps))
      .route('/auth', createProfileRoutes(deps))
      .route('/config', createConfigRoutes(deps))
      .route('/integrations', createIntegrationRoutes(deps))
      .route('/movies', createMovieRoutes(deps))
      .route('/shows', createShowRoutes(deps))
      .route('/media', createMediaRoutes(deps))
      .route('/stream', createStreamRoutes(deps))
      .route('/ratings', createRatingRoutes(deps))
      .route('/progress', createProgressRoutes(deps))
      .route('/notifications', createNotificationRoutes(deps))
      .route('/preload', createPreloadRoutes(deps))
      .route('/playback', createPlaybackRoutes(deps))
      .route('/subtitles', createSubtitleRoutes(deps))
      .route('/storage', createStorageRoutes(deps))
      .route('/sources', createSourcesRoutes(deps))
      .route('/', createListRoutes(deps))
  );
}

/** The address of the client the request came from (not a proxy's claim of it), when known. */
function peerAddress(c: Context): string | undefined {
  try {
    return getConnInfo(c).remote.address;
  } catch {
    // Not served by Bun.serve (e.g. app.request in tests)
    return undefined;
  }
}

export function createRoutes(deps: Deps) {
  const frontendDir = deps.configurationService.get('FRONTEND_DIR');
  const frontendEnabled = deps.configurationService.get('ENABLE_FRONTEND');
  const origins = expandEquivalentOrigins(
    (deps.configurationService.get('CORS_ORIGIN') ?? [])
      .map((origin: string) => origin.trim())
      .filter(Boolean)
  );

  const app = new Hono()
    .use(createSecurityHeadersMiddleware(frontendEnabled ? frontendDir : undefined))
    .use(async (c, next) => {
      // The address a browser reached the server at is one a TV on the network can use too
      deps.tvPairingService?.noteHost(c.req.header('host'), peerAddress(c));
      await next();
    })
    .use(
      createCorsMiddleware(origins, origin =>
        isTvAppOrigin(origin, {
          allowTvApp: deps.configurationService.get('ALLOW_TV_APP'),
          allowNullOrigin: deps.configurationService.get('ALLOW_TV_APP_NULL_ORIGIN'),
        })
      )
    )
    .route('/api', createApiRoutes(deps));

  // Optionally serve the frontend as static files from FRONTEND_DIR
  // This allows running a single container that serves both API and SPA
  if (frontendEnabled && frontendDir) {
    app.get('/assets/*', serveStatic({ root: frontendDir }));
    app.get('/favicon.png', serveStatic({ root: frontendDir }));
    app.get('/favicon.ico', serveStatic({ root: frontendDir }));
    app.get('/robots.txt', serveStatic({ root: frontendDir }));
    // SPA fallback - after all API routes
    app.get('*', serveStatic({ root: frontendDir, rewriteRequestPath: () => '/index.html' }));
  }

  return app;
}

export type RoutesApp = ReturnType<typeof createRoutes>;
