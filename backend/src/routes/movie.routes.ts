import { zValidator } from '@hono/zod-validator';
import type { Source, VideoCodec } from '@miauflix/source-metadata-extractor';
import { Quality } from '@miauflix/source-metadata-extractor';
import { Hono } from 'hono';
import { z } from 'zod';

import { authGuard } from '@middleware/auth.middleware';
import { createRateLimitMiddlewareFactory } from '@middleware/rate-limit.middleware';
import type { AuthService } from '@services/auth/auth.service';
import type { MediaService } from '@services/media/media.service';
import type { TranslatedMovie } from '@services/media/media.types';
import type { AuditLogService } from '@services/security/audit-log.service';
import type { SourceService } from '@services/source/source.service';
import type { StreamService } from '@services/stream/stream.service';

interface MovieResponse {
  id: number;
  tmdbId: number;
  imdbId: string | null;
  title: string;
  overview: string;
  tagline: string;
  releaseDate: string;
  runtime: number;
  poster: string;
  backdrop: string;
  logo: string;
  genres: string[];
  popularity: number;
  rating: number;
  sources?: Array<{
    id: number;
    quality: Quality | '3D' | null;
    size: number;
    videoCodec: VideoCodec | null;
    broadcasters: number | null;
    watchers: number | null;
    source: Source | null;
    hasDataFile: boolean;
  }>;
}

export const createMovieRoutes = (
  mediaService: MediaService,
  sourceService: SourceService,
  streamService: StreamService,
  auditLogService: AuditLogService,
  authService: AuthService
) => {
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
            return context.json({ error: 'Invalid movie ID' }, 400);
          }

          // Get the movie from the database or fetch from TMDB if not available
          const movie = await mediaService.getMovie(movieId);

          if (!movie) {
            return context.json({ error: 'Movie not found' }, 404);
          }

          // Get translated version of the movie
          const [translatedMovie] = await mediaService.mediasWithLanguage([movie], lang);

          // Cast to TranslatedMovie since we know it's a movie
          const movieData = translatedMovie as TranslatedMovie;

          // Build the response object
          const response: MovieResponse = {
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

          return context.json(response);
        } catch (error: unknown) {
          console.error('Failed to get movie:', error);

          // Handle TMDB API errors
          if (error && typeof error === 'object' && 'response' in error) {
            const httpError = error as { response?: { status?: number }; status?: number };
            if (httpError?.response?.status === 404 || httpError?.status === 404) {
              return context.json({ error: 'Movie not found' }, 404);
            }

            // Handle other HTTP errors
            if (
              httpError?.response?.status &&
              httpError.response.status >= 400 &&
              httpError.response.status < 500
            ) {
              return context.json({ error: 'Invalid request' }, 400);
            }
          }

          return context.json({ error: 'Internal server error' }, 500);
        }
      }
    )
    .post(
      '/:id/:quality',
      rateLimitGuard(5), // 5 requests per second for streaming key generation
      authGuard(),
      zValidator(
        'param',
        z.object({
          id: z.string().regex(/^\d+$/, 'Movie ID must be a number'),
          quality: z.enum<Quality | 'auto', typeof supportedQualities>(supportedQualities, {
            errorMap: () => ({
              message: `Quality must be one of: ${supportedQualities.join(', ')}`,
            }),
          }),
        })
      ),
      async context => {
        try {
          const user = context.get('user');
          const { id, quality } = context.req.valid('param');
          const movieId = parseInt(id, 10);

          // Validate movie ID range
          if (movieId <= 0) {
            return context.json({ error: 'Invalid movie ID' }, 400);
          }

          // Check if movie exists
          const movie = await mediaService.getMovie(movieId);
          if (!movie) {
            return context.json({ error: 'Movie not found' }, 404);
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
            return context.json({ error: 'No sources available for this movie' }, 404);
          }

          // Find the best source based on quality preference
          const selectedSource = await streamService.getBestSourceForStreaming(movieId, quality);

          if (!selectedSource) {
            return context.json(
              {
                error: `No ${quality === 'auto' ? 'suitable' : quality} quality source available`,
              },
              404
            );
          }

          // Generate streaming key for movie (not tied to specific source)
          const streamingKey = await authService.generateStreamingKey(movieId, user.id);

          return context.json({
            streamingKey,
            quality: selectedSource.quality,
            size: selectedSource.size,
            videoCodec: selectedSource.videoCodec,
            broadcasters: selectedSource.broadcasters,
            watchers: selectedSource.watchers,
            expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000), // 6 hours
          });
        } catch (error: unknown) {
          console.error('Failed to generate streaming key:', error);
          return context.json({ error: 'Internal server error' }, 500);
        }
      }
    );
};
