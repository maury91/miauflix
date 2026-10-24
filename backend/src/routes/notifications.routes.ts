import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { authGuard } from '@middleware/auth.middleware';

import type { Deps } from './common.types';

const notificationIdSchema = z.object({ id: z.coerce.number().int().positive() });

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
    });
