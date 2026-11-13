import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { authGuard } from '@middleware/auth.middleware';
import type { MediaRatingResponse } from '@mytypes/ratings.types';

import type { RouteDeps } from './common.types';

const mediaType = z.enum(['movie', 'tv']);
const mediaId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

/** Authenticated account ratings; account identity always comes from the session. */
export const createRatingRoutes = ({
  rateLimitGuard,
  mediaRatingService,
}: Pick<RouteDeps, 'mediaRatingService' | 'rateLimitGuard'>) => {
  return new Hono()
    .get(
      '/',
      authGuard(),
      rateLimitGuard(10),
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
        const rating = await mediaRatingService.get(c.get('sessionInfo').user.id, media);
        return c.json({ ...media, rating } satisfies MediaRatingResponse);
      }
    )
    .put(
      '/',
      authGuard(),
      rateLimitGuard(30),
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
        await mediaRatingService.set(c.get('sessionInfo').user.id, media, rating);
        return c.json({ ...media, rating } satisfies MediaRatingResponse);
      }
    );
};
