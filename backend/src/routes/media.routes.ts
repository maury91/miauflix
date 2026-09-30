import { zValidator } from '@hono/zod-validator';
import { backdropFocusResponseSchema, mediaTypeSchema } from '@miauflix/service-contracts';
import { Hono } from 'hono';
import { z } from 'zod';

import { authGuard } from '@middleware/auth.middleware';
import { createRateLimitMiddlewareFactory } from '@middleware/rate-limit.middleware';

import type { Deps } from './common.types';

const paramsSchema = z.object({
  mediaType: mediaTypeSchema,
  mediaId: z.string().regex(/^\d+$/u),
});

export const createMediaRoutes = ({
  auditLogService,
  catalogClient,
  configurationService,
}: Pick<Deps, 'auditLogService' | 'catalogClient' | 'configurationService'>) => {
  const rateLimitGuard = createRateLimitMiddlewareFactory(auditLogService, configurationService);
  return new Hono().post(
    '/:mediaType/:mediaId/backdrop-focus',
    rateLimitGuard(5),
    authGuard(),
    zValidator('param', paramsSchema),
    async context => {
      const { mediaType, mediaId: rawMediaId } = context.req.valid('param');
      const mediaId = Number(rawMediaId);
      if (!Number.isSafeInteger(mediaId) || mediaId <= 0)
        return context.json({ error: 'Invalid media ID' }, 400);
      const backdropFocus = await catalogClient.ensureBackdropFocus(mediaType, mediaId);
      return context.json(backdropFocusResponseSchema.parse({ backdropFocus }));
    }
  );
};
