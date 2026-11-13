import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { HttpError } from '@errors/http.error';
import { authGuard } from '@middleware/auth.middleware';

import type { RouteDeps } from './common.types';
import type { MovieResponse } from './movie.types';

export const createMovieRoutes = ({
  rateLimitGuard,
  mediaService,
  sourceService,
  sourceAvailabilityService,
}: RouteDeps) => {
  // Get a single movie by ID
  return new Hono().get(
    '/:id',
    rateLimitGuard(5), // 5 requests per second
    authGuard(),
    zValidator(
      'param',
      z.object({
        id: z.string().regex(/^\d+$/, 'Movie ID must be a number'),
      })
    ),
    zValidator(
      'query',
      z.object({
        lang: z.string().min(2).max(5).optional().default('en'),
        includeSources: z
          .string()
          .optional()
          .transform(val => val === 'true'),
      })
    ),
    async c => {
      const { id } = c.req.valid('param');
      const { lang, includeSources } = c.req.valid('query');

      const movieId = parseInt(id, 10);

      // Validate movie ID range
      if (movieId <= 0) {
        throw new HttpError(400, 'Invalid movie ID');
      }

      // Ensure fresh catalog data (the media-catalog service enforces freshness)
      // and mirror it into the local index.
      const result = await mediaService.getMovieByMediaId(movieId, lang);

      if (!result) {
        throw new HttpError(404, 'Movie not found');
      }
      const { local: movie, detail } = result;

      // Build the response object
      const response: MovieResponse = {
        type: 'movie',
        id: movie.id,
        mediaId: detail.mediaId,
        imdbId: detail.imdbId,
        title: detail.title,
        overview: detail.overview,
        tagline: detail.tagline,
        releaseDate: detail.releaseDate,
        runtime: detail.runtime,
        poster: detail.poster,
        backdrop: detail.backdrop,
        backdropFocus: detail.backdropFocus,
        logo: detail.logo,
        heroLogo: detail.heroLogo,
        artworkRevision: detail.artworkRevision,
        cardLogoStatus: detail.cardLogoStatus,
        heroLogoStatus: detail.heroLogoStatus,
        genres: detail.genres.map(genre => genre.name),
        popularity: detail.popularity,
        rating: detail.rating,
        sourceAvailability: 'pending',
      };

      // Include sources if requested
      if (includeSources) {
        // Use on-demand search if movie has no sources and hasn't been searched yet
        const sources = await sourceService.getSourcesForMovieWithOnDemandSearch(
          {
            id: movie.id,
            mediaId: movie.mediaId,
            releaseDate: movie.releaseDate,
            imdbId: movie.imdbId,
            title: movie.title,
            contentDirectoriesSearched: movie.contentDirectoriesSearched,
          },
          1200 // 1.2 second timeout - enough time for an indexer search but still reasonable for users
        );
        response.sources = sources.map(source => ({
          id: source.id,
          quality: source.quality,
          size: source.size,
          videoCodec: source.videoCodec,
          broadcasters: source.broadcasters ?? null,
          watchers: source.watchers ?? null,
          source: source.sourceType,
          hasDataFile: !!source.file,
        }));
      }
      // After the search above, which can mark more providers as searched.
      const searched = includeSources ? await mediaService.getMovieById(movie.id) : movie;
      response.sourceAvailability = await sourceAvailabilityService.forMovie(searched ?? movie);

      return c.json(response satisfies MovieResponse);
    }
  );
};
