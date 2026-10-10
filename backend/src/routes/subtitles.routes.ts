import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';

import { authGuard } from '@middleware/auth.middleware';
import { createRateLimitMiddlewareFactory } from '@middleware/rate-limit.middleware';
import { SubtitleAccessError } from '@services/subtitles/subtitles.service';

import type { Deps } from './common.types';
import { subtitleSearchRequestSchema } from './subtitles.types';

export const createSubtitleRoutes = ({
  auditLogService,
  configurationService,
  subtitlesService,
}: Pick<Deps, 'auditLogService' | 'configurationService' | 'subtitlesService'>) => {
  const rateLimitGuard = createRateLimitMiddlewareFactory(auditLogService, configurationService);

  return new Hono()
    .post(
      '/search',
      rateLimitGuard(0.5),
      authGuard(),
      zValidator('json', subtitleSearchRequestSchema),
      async context => {
        const session = context.get('sessionInfo');
        const { streamingKey, language, hearingImpaired, refresh } = context.req.valid('json');
        try {
          return context.json(
            await subtitlesService.search(
              streamingKey,
              session.user.id,
              language,
              hearingImpaired,
              refresh
            )
          );
        } catch (error) {
          if (error instanceof SubtitleAccessError) {
            return context.json({ error: error.message }, 403);
          }
          return context.json({ error: 'Subtitle search is unavailable' }, 502);
        }
      }
    )
    .get('/tracks/:candidateId', rateLimitGuard(1), async context => {
      const { candidateId } = context.req.param();
      if (!/^[A-Za-z0-9_-]{24}$/.test(candidateId)) {
        return context.text('Subtitle is unavailable', 404);
      }
      try {
        const body = await subtitlesService.getTrack(candidateId);
        return context.body(body, 200, {
          'content-type': 'text/vtt; charset=utf-8',
          'cache-control': 'private, no-store',
          'referrer-policy': 'no-referrer',
          'x-content-type-options': 'nosniff',
        });
      } catch (error) {
        if (error instanceof SubtitleAccessError)
          return context.text('Subtitle is unavailable', 404);
        return context.text('Subtitle could not be loaded', 502);
      }
    });
};
