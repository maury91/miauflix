import { zValidator } from '@hono/zod-validator';
import { isContractError } from '@miauflix/contract';
import { MAX_BATCH_ITEMS } from '@miauflix/service-contracts';
import { Hono } from 'hono';
import { z } from 'zod';

import { HttpError } from '@errors/http.error';
import { authGuard } from '@middleware/auth.middleware';

import type { RouteDeps } from './common.types';
import { serializeMedia } from './list.serializers';
import type { MediaBatchResponse } from './media.types';

const mediaTypeSchema = z.enum(['movie', 'tv']);
const backdropFocusBackgroundRequestSchema = z.object({
  items: z
    .array(z.object({ mediaType: mediaTypeSchema, mediaId: z.number().int().positive() }))
    .max(MAX_BATCH_ITEMS),
});

const mediaBatchRequestSchema = z.object({
  items: z
    .array(z.object({ mediaType: mediaTypeSchema, mediaId: z.number().int().positive() }))
    .min(1)
    .max(MAX_BATCH_ITEMS),
  lang: z.string().min(2).max(5).optional().default('en'),
});

const paramsSchema = z.object({
  mediaType: mediaTypeSchema,
  mediaId: z.string().regex(/^\d+$/u),
});

/**
 * Creates authenticated, rate-limited media routes: card data for many titles at once, and
 * immediate and background backdrop focus. The handlers reject invalid payloads and forward
 * catalog and response validation errors to Hono's error handling.
 */
export const createMediaRoutes = ({
  rateLimitGuard,
  catalogClient,
  listService,
}: Pick<RouteDeps, 'catalogClient' | 'listService' | 'rateLimitGuard'>) => {
  return new Hono()
    .post(
      '/batch',
      // One request covers a whole row (Continue watching), where the details routes would
      // need one per title and run into their per-address limit.
      rateLimitGuard(5),
      authGuard(),
      zValidator('json', mediaBatchRequestSchema),
      async c => {
        const { items, lang } = c.req.valid('json');
        const medias = await listService.getMediaByRefs(items, lang);
        return c.json({ results: medias.map(serializeMedia) } satisfies MediaBatchResponse);
      }
    )
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
