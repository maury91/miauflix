import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import z from 'zod';

import { createAuditLogMiddleware } from '@middleware/audit-log.middleware';
import { authGuard, createAuthMiddleware } from '@middleware/auth.middleware';
import { createRateLimitMiddlewareFactory } from '@middleware/rate-limit.middleware';
import type { AuthService } from '@services/auth/auth.service';
import type { ListService } from '@services/media/list.service';
import type { MediaService } from '@services/media/media.service';
import type { AuditLogService } from '@services/security/audit-log.service';
import type { VpnDetectionService } from '@services/security/vpn.service';
import type { SourceService } from '@services/source';
import type { MagnetService } from '@services/source';
import type { TrackerService } from '@services/source/tracker.service';
import type { TMDBApi } from '@services/tmdb/tmdb.api';
import type { TraktService } from '@services/trakt/trakt.service';

import { createAuthRoutes } from './auth.routes';
import { createMovieRoutes } from './movie.routes';
import { createTraktRoutes } from './trakt.routes';

export function createRoutes(deps: {
  authService: AuthService;
  auditLogService: AuditLogService;
  mediaService: MediaService;
  sourceService: SourceService;
  listService: ListService;
  tmdbApi: TMDBApi;
  vpnDetectionService: VpnDetectionService;
  trackerService: TrackerService;
  magnetService: MagnetService;
  traktService: TraktService;
}) {
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
        trackers: deps.trackerService.status(),
        magnetResolvers: deps.magnetService.status(),
      });
    })
    .route('/auth', createAuthRoutes(deps.authService, deps.auditLogService))
    .route(
      '/movies',
      createMovieRoutes(deps.mediaService, deps.sourceService, deps.auditLogService)
    )
    .route('/trakt', createTraktRoutes(deps.traktService, deps.auditLogService))
    .get('/lists', rateLimitGuard(5), authGuard(), async c => {
      const lists = await deps.listService.getLists();
      return c.json(
        lists.map(list => ({
          name: list.name,
          slug: list.slug,
          description: list.description,
          url: `/list/${list.slug}`,
        }))
      );
    })
    .get(
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

        const list = await deps.listService.getListContent(slug, lang);
        return c.json({
          results: list,
          total: list.length,
        });
      }
    );
}

export type RoutesApp = ReturnType<typeof createRoutes>;
