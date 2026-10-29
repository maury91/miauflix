import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { authGuard } from '@middleware/auth.middleware';
import { createRateLimitMiddlewareFactory } from '@middleware/rate-limit.middleware';

import type { Deps, ErrorResponse } from './common.types';
import { type PlayableRef, playableRefSchema } from './playable.types';

const notificationIdSchema = z.object({ id: z.coerce.number().int().positive() });
const availabilityRequestSchema = z.object({ playable: playableRefSchema }).strict();

export const createNotificationRoutes = ({
  auditLogService,
  configurationService,
  mediaService,
  notificationService,
}: Pick<
  Deps,
  'auditLogService' | 'configurationService' | 'mediaService' | 'notificationService'
>) => {
  const rateLimitGuard = createRateLimitMiddlewareFactory(auditLogService, configurationService);

  /** Only titles the catalog knows can be waited on. */
  const exists = async (playable: PlayableRef): Promise<boolean> => {
    if (playable.kind === 'movie')
      return !!(await mediaService.getMovieByMediaId(playable.mediaId));
    const season = await mediaService.getSeason(playable.showMediaId, playable.seasonNumber);
    return !!season?.episodes.some(episode => episode.episodeNumber === playable.episodeNumber);
  };

  return (
    new Hono()
      .get('/', authGuard(), async c => {
        const { user } = c.get('sessionInfo');
        return c.json(await notificationService.list(user.id));
      })
      .post('/:id/read', authGuard(), zValidator('param', notificationIdSchema), async c => {
        const { user } = c.get('sessionInfo');
        const { id } = c.req.valid('param');
        return c.json({ read: await notificationService.markRead(user.id, id) });
      })
      // "Notify me": hear about it once the playable gets a real source.
      .post(
        '/availability',
        rateLimitGuard(2), // 2 requests per second
        authGuard(),
        zValidator('json', availabilityRequestSchema),
        async c => {
          const { user } = c.get('sessionInfo');
          const { playable } = c.req.valid('json');
          if (!(await exists(playable)))
            return c.json({ error: 'Title not found' } satisfies ErrorResponse, 404);
          const result = await notificationService.requestAvailability(user.id, playable);
          if (result === 'limited')
            return c.json(
              { error: 'Too many pending notification requests' } satisfies ErrorResponse,
              429
            );
          return c.json({ requested: true }, 201);
        }
      )
  );
};
