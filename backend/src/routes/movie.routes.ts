import { zValidator } from '@hono/zod-validator';
import { Quality } from '@miauflix/source-metadata-extractor';
import { Hono } from 'hono';
import { z } from 'zod';

import { authGuard } from '@middleware/auth.middleware';
import { createRateLimitMiddlewareFactory } from '@middleware/rate-limit.middleware';
import type { TranslatedMovie } from '@services/media/media.types';

import type { Deps, ErrorResponse } from './common.types';
import type { MovieResponse, StreamingKeyResponse } from './movie.types';

export const createMovieRoutes = ({
  mediaService,
  sourceService,
  streamService,
  auditLogService,
  authService,
}: Deps) => {
  const rateLimitGuard = createRateLimitMiddlewareFactory(auditLogService);
  const supportedQualities: ['auto', ...Quality[]] = ['auto', ...Object.values(Quality)];

  // Get a single movie by ID
  return new Hono()
    .get(
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
      async context => {
        try {
          const { id } = context.req.valid('param');
          const { lang, includeSources } = context.req.valid('query');

          const movieId = parseInt(id, 10);

          // Validate movie ID range
          if (movieId <= 0) {
            return context.json({ error: 'Invalid movie ID' } satisfies ErrorResponse, 400);
          }

          // Get the movie from the database or fetch from TMDB if not available
          const movie = await mediaService.getMovieByTmdbId(movieId);

          if (!movie) {
            return context.json({ error: 'Movie not found' } satisfies ErrorResponse, 404);
          }

          // Get translated version of the movie
          const [translatedMovie] = await mediaService.mediasWithLanguage([movie], lang);

          // Cast to TranslatedMovie since we know it's a movie
          const movieData = translatedMovie as TranslatedMovie;

          // Build the response object
          const response: MovieResponse = {
            type: 'movie',
            id: movieData.id,
            tmdbId: movieData.tmdbId,
            imdbId: movieData.imdbId,
            title: movieData.title,
            overview: movieData.overview,
            tagline: movieData.tagline,
            releaseDate: movieData.releaseDate,
            runtime: movieData.runtime,
            poster: movieData.poster,
            backdrop: movieData.backdrop,
            logo: movieData.logo,
            genres: movieData.genres,
            popularity: movieData.popularity,
            rating: movieData.rating,
          };

          // Include sources if requested
          if (includeSources) {
            // Use on-demand search if movie has no sources and hasn't been searched yet
            const sources = await sourceService.getSourcesForMovieWithOnDemandSearch(
              {
                id: movie.id,
                imdbId: movie.imdbId,
                title: movie.title,
                contentDirectoriesSearched: movie.contentDirectoriesSearched,
              },
              1200 // 1.2 second timeout - enough time for YTS API search but still reasonable for users
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

          return context.json(response satisfies MovieResponse);
        } catch (error: unknown) {
          console.error('Failed to get movie:', error);

          // Handle TMDB API errors
          if (error && typeof error === 'object' && 'response' in error) {
            const httpError = error as { response?: { status?: number }; status?: number };
            if (httpError?.response?.status === 404 || httpError?.status === 404) {
              return context.json({ error: 'Movie not found' } satisfies ErrorResponse, 404);
            }

            // Handle other HTTP errors
            if (
              httpError?.response?.status &&
              httpError.response.status >= 400 &&
              httpError.response.status < 500
            ) {
              return context.json({ error: 'Invalid request' } satisfies ErrorResponse, 400);
            }
          }

          return context.json({ error: 'Internal server error' } satisfies ErrorResponse, 500);
        }
      }
    )
    .post(
      '/:tmdbId/:quality',
      rateLimitGuard(5), // 5 requests per second for streaming key generation
      authGuard(),
      zValidator(
        'param',
        z.object({
          tmdbId: z.string().regex(/^\d+$/, 'Movie TMDB ID must be a number'),
          quality: z.enum(supportedQualities),
        })
      ),
      async context => {
        try {
          const { user } = context.get('sessionInfo');
          const { tmdbId, quality } = context.req.valid('param');
          const movieId = parseInt(tmdbId, 10);

          // Validate movie ID range
          if (movieId <= 0) {
            return context.json({ error: 'Invalid movie ID' } satisfies ErrorResponse, 400);
          }

          // Check if movie exists
          const movie = await mediaService.getMovieByTmdbId(movieId);
          if (!movie) {
            return context.json({ error: 'Movie not found' } satisfies ErrorResponse, 404);
          }

          // Get sources for the movie to find the best matching source
          const sources = await sourceService.getSourcesForMovieWithOnDemandSearch(
            {
              id: movie.id,
              imdbId: movie.imdbId,
              title: movie.title,
              contentDirectoriesSearched: movie.contentDirectoriesSearched,
            },
            1200 // 1.2 second timeout
          );

          if (!sources || sources.length === 0) {
            return context.json(
              { error: 'No sources available for this movie' } satisfies ErrorResponse,
              404
            );
          }

          // Find the best source based on quality preference
          const selectedSource = await streamService.getBestSourceForStreaming(movieId, quality);

          if (!selectedSource) {
            return context.json(
              {
                error: `No ${quality === 'auto' ? 'suitable' : quality} quality source available`,
              } satisfies ErrorResponse,
              404
            );
          }

          // Generate streaming key for movie (not tied to specific source)
          const streamingKey = await authService.generateStreamingKey(movie.id, user.id);

          return context.json({
            streamingKey,
            quality: selectedSource.quality,
            size: selectedSource.size,
            videoCodec: selectedSource.videoCodec,
            broadcasters: selectedSource.broadcasters ?? null,
            watchers: selectedSource.watchers ?? null,
            expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000), // 6 hours
          } satisfies StreamingKeyResponse);
        } catch (error: unknown) {
          console.error('Failed to generate streaming key:', error);
          return context.json({ error: 'Internal server error' } satisfies ErrorResponse, 500);
        }
      }
    );
};
