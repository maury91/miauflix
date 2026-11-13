import { zValidator } from '@hono/zod-validator';
import { isContractError } from '@miauflix/contract';
import { MAX_BATCH_ITEMS } from '@miauflix/service-contracts';
import { Hono } from 'hono';
import { z } from 'zod';

import { HttpError } from '@errors/http.error';
import { authGuard } from '@middleware/auth.middleware';

import type { RouteDeps } from './common.types';

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
  rateLimitGuard,
  catalogClient,
}: Pick<RouteDeps, 'catalogClient' | 'rateLimitGuard'>) => {
  return new Hono()
    .post(
      '/backdrop-focus/background',
      rateLimitGuard(30),
      authGuard(),
      zValidator('json', backdropFocusBackgroundRequestSchema),
      async c => {
        const accepted = await catalogClient.queueBackdropFocus(c.req.valid('json').items);
        return c.json({ accepted }, 202);
      }
    )
    .post(
      '/:mediaType/:mediaId/backdrop-focus',
      rateLimitGuard(5),
      authGuard(),
      zValidator('param', paramsSchema),
      async c => {
        const { mediaType, mediaId: rawMediaId } = c.req.valid('param');
        const mediaId = Number(rawMediaId);
        if (!Number.isSafeInteger(mediaId) || mediaId <= 0)
          throw new HttpError(400, 'Invalid media ID');
        try {
          const backdropFocus = await catalogClient.ensureBackdropFocus(mediaType, mediaId);
          return c.json({ backdropFocus });
        } catch (error) {
          if (isContractError(error, 'not_found')) throw new HttpError(404, 'Title not found');
          if (isContractError(error, 'no_backdrop'))
            throw new HttpError(422, 'The title has no backdrop');
          throw error;
        }
      }
    );
};
