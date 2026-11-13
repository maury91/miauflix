import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { HttpError } from '@errors/http.error';
import { authGuard } from '@middleware/auth.middleware';

import type { RouteDeps } from './common.types';
import type { SeasonResponse, ShowResponse } from './show.types';

export const createShowRoutes = ({
  rateLimitGuard,
  mediaService,
  sourceAvailabilityService,
}: RouteDeps) => {
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
      async c => {
        const { id } = c.req.valid('param');
        const { lang } = c.req.valid('query');
        const showId = parseInt(id, 10);

        // Validate show ID range
        if (showId <= 0) {
          throw new HttpError(400, 'Invalid show ID');
        }

        // Ensure fresh catalog data (the media-catalog service enforces freshness)
        // and mirror it into the local index.
        const result = await mediaService.getTVShowByMediaId(showId, lang);

        if (!result) {
          throw new HttpError(404, 'Show not found');
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
          backdropFocus: detail.backdropFocus,
          logo: detail.logo || null,
          heroLogo: detail.heroLogo || null,
          artworkRevision: detail.artworkRevision,
          cardLogoStatus: detail.cardLogoStatus,
          heroLogoStatus: detail.heroLogoStatus,
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

        return c.json(response satisfies ShowResponse);
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
      async c => {
        const showId = Number(c.req.valid('param').id);
        const result = await mediaService.getTVShowByMediaId(showId, 'en');
        if (!result) {
          throw new HttpError(404, 'Show not found');
        }
        return c.json(
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
      async c => {
        const { id, season } = c.req.valid('param');
        const hydrated = await mediaService.getSeason(Number(id), Number(season), 'en');
        if (!hydrated) {
          throw new HttpError(404, 'Season not found');
        }
        const availability = await sourceAvailabilityService.forEpisodes(
          (hydrated.episodes ?? []).map(episode => episode.id)
        );
        return c.json({
          id: hydrated.mediaId,
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
            sourceAvailability: availability.get(episode.id) ?? 'pending',
          })),
        } satisfies SeasonResponse);
      }
    );
};
