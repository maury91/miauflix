import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { authGuard } from '@middleware/auth.middleware';
import { createRateLimitMiddlewareFactory } from '@middleware/rate-limit.middleware';
import type { TranslatedTVShow } from '@services/media/media.types';

import type { Deps, ErrorResponse } from './common.types';
import type { SeasonResponse, ShowResponse } from './show.types';

export const createShowRoutes = ({ mediaService, auditLogService }: Deps) => {
  const rateLimitGuard = createRateLimitMiddlewareFactory(auditLogService);

  return new Hono()
    .get(
      '/:id',
      rateLimitGuard(5), // 5 requests per second
      authGuard(),
      zValidator(
        'param',
        z.object({
          id: z.string().regex(/^\d+$/, 'Show ID must be a number'),
        })
      ),
      async context => {
        try {
          const { id } = context.req.valid('param');
          const showId = parseInt(id, 10);

          // Validate show ID range
          if (showId <= 0) {
            return context.json({ error: 'Invalid show ID' } satisfies ErrorResponse, 400);
          }

          // Get the show from the database or fetch from TMDB if not available
          const show = await mediaService.getTVShowByTmdbId(showId);

          if (!show) {
            return context.json({ error: 'Show not found' } satisfies ErrorResponse, 404);
          }

          // Get translated version of the show
          const [translatedShow] = await mediaService.mediasWithLanguage([show], 'en');

          // Cast to TranslatedTVShow since we know it's a TV show
          const showData = translatedShow as TranslatedTVShow;

          // Build the response object matching ShowResponse DTO
          const response: ShowResponse = {
            type: 'show',
            id: showData.id,
            tmdbId: showData.tmdbId,
            imdbId: showData.imdbId || null,
            title: showData.name, // Map 'name' to 'title'
            overview: showData.overview || null,
            tagline: showData.tagline || null,
            firstAirDate: showData.firstAirDate || null,
            lastAirDate: null, // Not available in entity
            poster: showData.poster || null,
            backdrop: showData.backdrop || null,
            logo: null, // Not available in entity
            genres: showData.genres,
            popularity: showData.popularity || null,
            rating: showData.rating || null,
            seasons: [], // TODO: Implement seasons
            sources: [], // TODO: Implement sources
          };

          return context.json(response satisfies ShowResponse);
        } catch (error: unknown) {
          console.error('Failed to get show:', error);
          return context.json({ error: 'Internal server error' } satisfies ErrorResponse, 500);
        }
      }
    )
    .get(
      '/:id/seasons',
      rateLimitGuard(5),
      authGuard(),
      zValidator(
        'param',
        z.object({
          id: z.string().regex(/^\d+$/, 'Show ID must be a number'),
        })
      ),
      async context => {
        try {
          // TODO: Implement seasons endpoint
          // For now, return empty array
          return context.json([]);
        } catch (error: unknown) {
          console.error('Failed to get show seasons:', error);
          return context.json({ error: 'Internal server error' } satisfies ErrorResponse, 500);
        }
      }
    )
    .get(
      '/:id/seasons/:season',
      rateLimitGuard(5),
      authGuard(),
      zValidator(
        'param',
        z.object({
          id: z.string().regex(/^\d+$/, 'Show ID must be a number'),
          season: z.string().regex(/^\d+$/, 'Season must be a number'),
        })
      ),
      async context => {
        try {
          // TODO: Implement season endpoint
          // For now, return empty object
          return context.json({} as SeasonResponse);
        } catch (error: unknown) {
          console.error('Failed to get show season:', error);
          return context.json({ error: 'Internal server error' } satisfies ErrorResponse, 500);
        }
      }
    );
};
