import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { UserRole } from '@entities/user.entity';
import { authGuard } from '@middleware/auth.middleware';
import { createRateLimitMiddlewareFactory } from '@middleware/rate-limit.middleware';

import type { Deps } from './common.types';

const sourceIdSchema = z.object({
  sourceId: z
    .string()
    .regex(/^[1-9]\d*$/)
    .transform(Number)
    .pipe(z.number().int().positive().safe()),
});

export const createStorageRoutes = (
  deps: Pick<Deps, 'auditLogService' | 'configurationService' | 'storageInventoryService'>
) => {
  const rateLimitGuard = createRateLimitMiddlewareFactory(
    deps.auditLogService,
    deps.configurationService
  );

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
            return c.json({ error: 'Storage not found' }, 404);
          case 'active_playback':
            return c.json({ error: 'This download is currently being watched' }, 409);
          case 'cleanup_failed':
            return c.json({ error: 'Could not remove the downloaded files' }, 500);
        }
      }
    );
};
