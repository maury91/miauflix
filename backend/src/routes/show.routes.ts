import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { authGuard } from '@middleware/auth.middleware';
import { createRateLimitMiddlewareFactory } from '@middleware/rate-limit.middleware';

import type { Deps, ErrorResponse } from './common.types';
import type { SeasonResponse, ShowResponse } from './show.types';

export const createShowRoutes = ({ auditLogService, mediaService, configurationService }: Deps) => {
  const rateLimitGuard = createRateLimitMiddlewareFactory(auditLogService, configurationService);

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

          // Ensure fresh catalog data (the media-catalog service enforces freshness)
          // and mirror it into the local index.
          const result = await mediaService.getTVShowByMediaId(showId, lang);

          if (!result) {
            return context.json({ error: 'Show not found' } satisfies ErrorResponse, 404);
          }
          const { local: show, detail } = result;

          // Build the response object matching ShowResponse DTO
          const response: ShowResponse = {
            type: 'show',
            id: show.id,
            mediaId: detail.mediaId,
            imdbId: detail.imdbId,
            title: detail.name, // Map 'name' to 'title'
            overview: detail.overview || null,
            tagline: detail.tagline || null,
            firstAirDate: detail.firstAirDate || null,
            lastAirDate: null, // Not provided by the catalog contract
            poster: detail.poster || null,
            backdrop: detail.backdrop || null,
            logo: detail.logo || null,
            genres: detail.genres.map(genre => genre.name),
            popularity: detail.popularity,
            rating: detail.rating,
            seasons: detail.seasons.map(season => ({
              id: season.mediaId,
              seasonNumber: season.seasonNumber,
              name: season.name,
              overview: season.overview,
              airDate: season.airDate,
              poster: season.poster,
              episodes: [], // Episodes are hydrated per season
            })),
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
          const showId = Number(context.req.valid('param').id);
          const result = await mediaService.getTVShowByMediaId(showId, 'en');
          if (!result) {
            return context.json({ error: 'Show not found' } satisfies ErrorResponse, 404);
          }
          return context.json(
            result.detail.seasons.map(season => ({
              id: season.mediaId,
              seasonNumber: season.seasonNumber,
              name: season.name,
              overview: season.overview || null,
              airDate: season.airDate,
              poster: season.poster,
              episodes: [],
            })) satisfies SeasonResponse[]
          );
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
          const { id, season } = context.req.valid('param');
          const hydrated = await mediaService.getSeason(Number(id), Number(season), 'en');
          if (!hydrated) {
            return context.json({ error: 'Season not found' } satisfies ErrorResponse, 404);
          }
          return context.json({
            id: hydrated.id,
            seasonNumber: hydrated.seasonNumber,
            name: hydrated.name,
            overview: hydrated.overview || null,
            airDate: hydrated.airDate || null,
            poster: hydrated.posterPath || null,
            episodes: (hydrated.episodes ?? []).map(episode => ({
              id: episode.id,
              episodeNumber: episode.episodeNumber,
              title: episode.name,
              overview: episode.overview || null,
              airDate: episode.airDate,
              still: episode.stillPath || null,
            })),
          } satisfies SeasonResponse);
        } catch (error: unknown) {
          console.error('Failed to get show season:', error);
          return context.json({ error: 'Internal server error' } satisfies ErrorResponse, 500);
        }
      }
    );
};
