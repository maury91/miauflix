import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { authGuard } from '@middleware/auth.middleware';
import { createRateLimitMiddlewareFactory } from '@middleware/rate-limit.middleware';

import type { Deps, ErrorResponse } from './common.types';
import type { SeasonResponse, ShowResponse } from './show.types';

export const createShowRoutes = ({ catalogService, mediaService, auditLogService }: Deps) => {
  const rateLimitGuard = createRateLimitMiddlewareFactory(auditLogService);

  return new Hono()
    .get(
      '/:id',
      rateLimitGuard(5), // 5 requests per second
      authGuard(),
      zValidator(
        'param',
        z.object({
          id: z.string().regex(/^\d+$/, 'TMDB Show ID must be a number'),
        })
      ),
      zValidator(
        'query',
        z.object({
          lang: z.string().min(2).max(5).optional().default('en'),
        })
      ),
      async context => {
        try {
          const { id } = context.req.valid('param');
          const { lang } = context.req.valid('query');
          const showId = parseInt(id, 10);

          // Validate show ID range
          if (showId <= 0) {
            return context.json({ error: 'Invalid show ID' } satisfies ErrorResponse, 400);
          }

          // Get the show from the database or fetch from TMDB if not available
          const show = await catalogService.getTVShowByTmdbId(showId, lang);

          if (!show) {
            return context.json({ error: 'Show not found' } satisfies ErrorResponse, 404);
          }

          // Get translated version of the show
          // Build the response object matching ShowResponse DTO
          const response: ShowResponse = {
            type: 'show',
            id: show.id,
            tmdbId: show.tmdbId,
            imdbId: show.imdbId || null,
            title: show.name, // Map 'name' to 'title'
            overview: show.overview || null,
            tagline: show.tagline || null,
            firstAirDate: show.firstAirDate || null,
            lastAirDate: null, // Not available in entity
            poster: show.poster || null,
            backdrop: show.backdrop || null,
            logo: null, // Not available in entity
            genres: show.genres,
            popularity: show.popularity || null,
            rating: show.rating || null,
            seasons: show.seasons.map(season => ({
              id: season.id,
              seasonNumber: season.seasonNumber,
              name: season.name,
              overview: season.overview,
              airDate: season.airDate || null,
              poster: season.posterPath || null,
              episodes: [], // TODO: Implement episodes
            })),
            sources: [], // TODO: Implement sources
          };

          await mediaService.markShowAsWatching(showId);

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
