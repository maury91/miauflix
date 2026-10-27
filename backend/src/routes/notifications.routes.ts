import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { authGuard } from '@middleware/auth.middleware';

import type { Deps } from './common.types';
import { playableRefSchema } from './playable.types';

const notificationIdSchema = z.object({ id: z.coerce.number().int().positive() });
const availabilityRequestSchema = z.object({ playable: playableRefSchema }).strict();

export const createNotificationRoutes = ({
  notificationService,
}: Pick<Deps, 'notificationService'>) =>
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
    .post('/availability', authGuard(), zValidator('json', availabilityRequestSchema), async c => {
      const { user } = c.get('sessionInfo');
      await notificationService.requestAvailability(user.id, c.req.valid('json').playable);
      return c.json({ requested: true }, 201);
    });
