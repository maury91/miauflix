import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { HttpError } from '@errors/http.error';
import { authGuard } from '@middleware/auth.middleware';
import { type PlayableRef, playableRefSchema } from '@mytypes/playable.types';
import { NOTIFICATIONS_PAGE_LIMIT } from '@services/notifications/notification.service';

import type { RouteDeps } from './common.types';

const notificationIdSchema = z.object({ id: z.coerce.number().int().positive() });
const notificationListSchema = z.object({
  status: z.enum(['unread', 'read']).default('unread'),
  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(NOTIFICATIONS_PAGE_LIMIT).default(20),
});
const availabilityRequestSchema = z.object({ playable: playableRefSchema }).strict();

export const createNotificationRoutes = ({
  rateLimitGuard,
  mediaService,
  notificationService,
}: Pick<RouteDeps, 'mediaService' | 'notificationService' | 'rateLimitGuard'>) => {
  /** Only titles the catalog knows can be waited on. */
  const exists = async (playable: PlayableRef): Promise<boolean> => {
    if (playable.kind === 'movie')
      return !!(await mediaService.getMovieByMediaId(playable.mediaId));
    const season = await mediaService.getSeason(playable.showMediaId, playable.seasonNumber);
    return !!season?.episodes.some(episode => episode.episodeNumber === playable.episodeNumber);
  };

  return (
    new Hono()
      .get('/', authGuard(), zValidator('query', notificationListSchema), async c => {
        const { user } = c.get('sessionInfo');
        return c.json(await notificationService.list(user.id, c.req.valid('query')));
      })
      .get('/unread-count', authGuard(), async c => {
        const { user } = c.get('sessionInfo');
        return c.json(await notificationService.counts(user.id));
      })
      .post('/read-all', authGuard(), async c => {
        const { user } = c.get('sessionInfo');
        return c.json({ read: await notificationService.markAllRead(user.id) });
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
          if (!(await exists(playable))) throw new HttpError(404, 'Title not found');
          const result = await notificationService.requestAvailability(user.id, playable);
          if (result === 'limited')
            throw new HttpError(429, 'Too many pending notification requests');
          return c.json({ requested: true }, 201);
        }
      )
  );
};
