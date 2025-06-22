import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { authGuard } from '@middleware/auth.middleware';
import { createRateLimitMiddlewareFactory } from '@middleware/rate-limit.middleware';
import type { MediaService } from '@services/media/media.service';
import type { TranslatedMovie } from '@services/media/media.types';
import type { AuditLogService } from '@services/security/audit-log.service';
import type { SourceService } from '@services/source/source.service';

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
    hash: string;
    magnetLink: string;
    quality: string;
    resolution: number;
    size: number;
    videoCodec: string;
    seeds: number | undefined;
    leechers: number | undefined;
    source: string;
    hasDataFile: boolean;
  }>;
}

export const createMovieRoutes = (
  mediaService: MediaService,
  sourceService: SourceService,
  auditLogService: AuditLogService
) => {
  const rateLimitGuard = createRateLimitMiddlewareFactory(auditLogService);

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
              sourceSearched: movie.sourceSearched,
            },
            1200 // 1.2 second timeout - enough time for YTS API search but still reasonable for users
          );
          response.sources = sources.map(source => ({
            id: source.id,
            hash: source.hash,
            magnetLink: source.magnetLink,
            quality: source.quality || 'Unknown',
            resolution: source.resolution,
            size: source.size,
            videoCodec: source.videoCodec || 'Unknown',
            seeds: source.broadcasters,
            leechers: source.watchers,
            source: source.source,
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
  );
};
