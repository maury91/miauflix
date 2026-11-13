import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { UserRole } from '@entities/user.entity';
import { authGuard } from '@middleware/auth.middleware';
import { createRateLimitMiddlewareFactory } from '@middleware/rate-limit.middleware';
import { isVideoFile } from '@services/source/video-files';

import type { Deps } from './common.types';
import type { StorageInventoryResponse, StorageItemView } from './storage.types';

const sourceIdSchema = z.object({
  sourceId: z
    .string()
    .regex(/^[1-9]\d*$/)
    .transform(Number)
    .pipe(z.number().int().positive().safe()),
});

export const createStorageRoutes = (
  deps: Pick<
    Deps,
    'auditLogService' | 'configurationService' | 'contentSourceRepository' | 'mediaLoadClient'
  >
) => {
  const rateLimitGuard = createRateLimitMiddlewareFactory(
    deps.auditLogService,
    deps.configurationService
  );

  return new Hono()
    .get('/', rateLimitGuard(10), authGuard(UserRole.ADMIN), async c => {
      const inventory = await deps.mediaLoadClient.getInventory();
      const sources = new Map(
        (
          await deps.contentSourceRepository.findWithMovies(
            inventory.items.map(item => item.sourceId)
          )
        ).map(source => [source.id, source])
      );
      const items = inventory.items.map((storage): StorageItemView => {
        const source = sources.get(storage.sourceId);
        return {
          sourceId: storage.sourceId,
          title: source?.movies?.[0]?.movie?.title ?? `Download ${storage.sourceId}`,
          fileName: storage.requestedFiles.find(isVideoFile)?.split('/').pop() ?? null,
          quality: source?.quality ?? null,
          physicalBytes: storage.allocatedBytes,
          reservedBytes: storage.reservedBytes,
          progressPercent: storage.downloaded / 100,
          videoComplete: storage.videoComplete,
          activity: storage.activity,
          torrentLoaded: storage.torrentLoaded,
          activeStreams: storage.activeStreams,
          seedEndsAt: storage.seedEndsAt,
        };
      });
      const response: StorageInventoryResponse = {
        summary: {
          physicalBytes: inventory.physicalBytes,
          storageBudgetBytes: inventory.storageBudgetBytes,
          reservedBytes: inventory.reservedBytes,
          chargedBytes: inventory.chargedBytes,
          filesystem: inventory.filesystem,
        },
        // Largest charge first (the service's order), then by title.
        items: items.sort(
          (a, b) =>
            (b.physicalBytes ?? 0) - (a.physicalBytes ?? 0) ||
            b.reservedBytes - a.reservedBytes ||
            a.title.localeCompare(b.title)
        ),
      };
      return c.json(response);
    })
    .delete(
      '/:sourceId',
      rateLimitGuard(5),
      authGuard(UserRole.ADMIN),
      zValidator('param', sourceIdSchema),
      async c => {
        const { sourceId } = c.req.valid('param');
        const result = await deps.mediaLoadClient.removeStorageWithResult(sourceId);
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
