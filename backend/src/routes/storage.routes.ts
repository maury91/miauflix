import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { UserRole } from '@entities/user.entity';
import { authGuard } from '@middleware/auth.middleware';
import { createRateLimitMiddlewareFactory } from '@middleware/rate-limit.middleware';

import type { Deps } from './common.types';
import type { StorageInventoryResponse } from './storage.types';

const sourceIdSchema = z.object({
  movieSourceId: z
    .string()
    .regex(/^[1-9]\d*$/)
    .transform(Number)
    .pipe(z.number().int().positive().safe()),
});

export const createStorageRoutes = (
  deps: Pick<
    Deps,
    'auditLogService' | 'configurationService' | 'downloadService' | 'storageService'
  >
) => {
  const rateLimitGuard = createRateLimitMiddlewareFactory(
    deps.auditLogService,
    deps.configurationService
  );

  return new Hono()
    .get('/', rateLimitGuard(10), authGuard(UserRole.ADMIN), async c => {
      const inventory = await deps.storageService.getInventory();
      const response: StorageInventoryResponse = {
        summary: {
          physicalBytes: inventory.physicalBytes,
          storageBudgetBytes: inventory.storageBudgetBytes,
          reservedBytes: inventory.reservedBytes,
          chargedBytes: inventory.chargedBytes,
          filesystem: inventory.filesystem,
        },
        items: inventory.items.map(storage => {
          const activity = deps.downloadService.getStorageActivity(storage);
          return {
            movieSourceId: storage.movieSourceId,
            title: storage.movieSource?.movie?.title ?? `Download ${storage.movieSourceId}`,
            fileName: storage.encryptedLayout?.video.name ?? null,
            quality: storage.movieSource?.quality ?? null,
            physicalBytes: storage.allocatedBytes,
            reservedBytes: storage.reservedBytes,
            progressPercent: storage.downloaded / 100,
            videoComplete: activity.videoComplete,
            activity: activity.activity,
            torrentLoaded: activity.torrentLoaded,
            activeStreams: storage.activeStreams,
            seedEndsAt: activity.seedEndsAt?.toISOString() ?? null,
          };
        }),
      };
      return c.json(response);
    })
    .delete(
      '/:movieSourceId',
      rateLimitGuard(5),
      authGuard(UserRole.ADMIN),
      zValidator('param', sourceIdSchema),
      async c => {
        const { movieSourceId } = c.req.valid('param');
        const result = await deps.storageService.removeStorageWithResult(movieSourceId);
        switch (result.status) {
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
