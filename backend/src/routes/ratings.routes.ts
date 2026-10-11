import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { authGuard } from '@middleware/auth.middleware';
import { createRateLimitMiddlewareFactory } from '@middleware/rate-limit.middleware';

import type { Deps } from './common.types';
import type { MediaRatingResponse } from './ratings.types';

const mediaType = z.enum(['movie', 'tv']);
const mediaId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

/** Authenticated account ratings; account identity always comes from the session. */
export const createRatingRoutes = ({
  mediaRatingRepository,
  auditLogService,
  configurationService,
}: Pick<Deps, 'auditLogService' | 'configurationService' | 'mediaRatingRepository'>) => {
  const rateLimit = createRateLimitMiddlewareFactory(auditLogService, configurationService);
  return new Hono()
    .get(
      '/',
      authGuard(),
      rateLimit(10),
      zValidator(
        'query',
        z
          .object({
            mediaType,
            mediaId: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER),
          })
          .strict()
      ),
      async c => {
        const media = c.req.valid('query');
        const rating = await mediaRatingRepository.get(c.get('sessionInfo').user.id, media);
        return c.json({ ...media, rating } satisfies MediaRatingResponse);
      }
    )
    .put(
      '/',
      authGuard(),
      rateLimit(30),
      zValidator(
        'json',
        z
          .object({
            mediaType,
            mediaId,
            rating: z.enum(['dislike', 'like', 'love']).nullable(),
          })
          .strict()
      ),
      async c => {
        const { rating, ...media } = c.req.valid('json');
        await mediaRatingRepository.set(c.get('sessionInfo').user.id, media, rating);
        return c.json({ ...media, rating } satisfies MediaRatingResponse);
      }
    );
};
