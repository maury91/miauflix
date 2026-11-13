import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { UserRole } from '@entities/user.entity';
import { HttpError } from '@errors/http.error';
import { authGuard } from '@middleware/auth.middleware';

import type { RouteDeps } from './common.types';

const sourceIdSchema = z.object({
  sourceId: z
    .string()
    .regex(/^[1-9]\d*$/)
    .transform(Number)
    .pipe(z.number().int().positive().safe()),
});

export const createStorageRoutes = (
  deps: Pick<RouteDeps, 'rateLimitGuard' | 'storageInventoryService'>
) => {
  const { rateLimitGuard } = deps;

  return new Hono()
    .get('/', rateLimitGuard(10), authGuard(UserRole.ADMIN), async c =>
      c.json(await deps.storageInventoryService.getInventory())
    )
    .delete(
      '/:sourceId',
      rateLimitGuard(5),
      authGuard(UserRole.ADMIN),
      zValidator('param', sourceIdSchema),
      async c => {
        const { sourceId } = c.req.valid('param');
        switch (await deps.storageInventoryService.remove(sourceId)) {
          case 'removed':
            return c.json({ success: true });
          case 'not_found':
            throw new HttpError(404, 'Storage not found');
          case 'active_playback':
            throw new HttpError(409, 'This download is currently being watched');
          case 'cleanup_failed':
            throw new HttpError(500, 'Could not remove the downloaded files');
        }
      }
    );
};
