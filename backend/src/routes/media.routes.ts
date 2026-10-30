import { zValidator } from '@hono/zod-validator';
import { isContractError } from '@miauflix/contract';
import { MAX_BATCH_ITEMS } from '@miauflix/service-contracts';
import { Hono } from 'hono';
import { z } from 'zod';

import { authGuard } from '@middleware/auth.middleware';
import { createRateLimitMiddlewareFactory } from '@middleware/rate-limit.middleware';

import type { Deps } from './common.types';

const mediaTypeSchema = z.enum(['movie', 'tv']);
const backdropFocusBackgroundRequestSchema = z.object({
  items: z
    .array(z.object({ mediaType: mediaTypeSchema, mediaId: z.number().int().positive() }))
    .max(MAX_BATCH_ITEMS),
});

const paramsSchema = z.object({
  mediaType: mediaTypeSchema,
  mediaId: z.string().regex(/^\d+$/u),
});

/**
 * Creates authenticated, rate-limited immediate and background backdrop-focus routes.
 * The handlers reject invalid payloads and forward catalog and response validation errors
 * to Hono's error handling.
 */
export const createMediaRoutes = ({
  auditLogService,
  catalogClient,
  configurationService,
}: Pick<Deps, 'auditLogService' | 'catalogClient' | 'configurationService'>) => {
  const rateLimitGuard = createRateLimitMiddlewareFactory(auditLogService, configurationService);
  return new Hono()
    .post(
      '/backdrop-focus/background',
      rateLimitGuard(30),
      authGuard(),
      zValidator('json', backdropFocusBackgroundRequestSchema),
      async context => {
        const accepted = await catalogClient.queueBackdropFocus(context.req.valid('json').items);
        return context.json({ accepted }, 202);
      }
    )
    .post(
      '/:mediaType/:mediaId/backdrop-focus',
      rateLimitGuard(5),
      authGuard(),
      zValidator('param', paramsSchema),
      async context => {
        const { mediaType, mediaId: rawMediaId } = context.req.valid('param');
        const mediaId = Number(rawMediaId);
        if (!Number.isSafeInteger(mediaId) || mediaId <= 0)
          return context.json({ error: 'Invalid media ID' }, 400);
        try {
          const backdropFocus = await catalogClient.ensureBackdropFocus(mediaType, mediaId);
          return context.json({ backdropFocus });
        } catch (error) {
          if (isContractError(error, 'not_found'))
            return context.json({ error: 'Title not found' }, 404);
          if (isContractError(error, 'no_backdrop'))
            return context.json({ error: 'The title has no backdrop' }, 422);
          throw error;
        }
      }
    );
};
