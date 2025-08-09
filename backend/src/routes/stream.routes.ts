import { zValidator } from '@hono/zod-validator';
import { Quality } from '@miauflix/source-metadata-extractor';
import { Hono } from 'hono';
import { z } from 'zod';

import { createRateLimitMiddlewareFactory } from '@middleware/rate-limit.middleware';

import type { Deps, ErrorResponse } from './common.types';

export const createStreamRoutes = ({
  authService,
  mediaService,
  streamService,
  auditLogService,
  downloadService,
}: Deps) => {
  const rateLimitGuard = createRateLimitMiddlewareFactory(auditLogService);

  return new Hono().get(
    '/:token',
    rateLimitGuard(60), // 60 requests per minute for streaming (allows seeking, pausing)
    zValidator(
      'param',
      z.object({
        token: z.string().min(10, 'Invalid key format'),
      })
    ),
    zValidator(
      'query',
      z.object({
        quality: z.enum(['auto', ...Object.values(Quality)]).optional(),
        hevc: z
          .string()
          .optional()
          .transform(val => val === 'true'),
      })
    ),
    async context => {
      try {
        const { token } = context.req.valid('param');
        const { quality = 'auto', hevc = true } = context.req.valid('query');

        // Verify streaming key (includes timing attack protection)
        const keyData = await authService.verifyStreamingKey(token);
        const { movieId } = keyData;
        const movie = await mediaService.getMovieById(movieId);

        if (!movie) {
          return context.json({ error: 'Movie not found' } satisfies ErrorResponse, 404);
        }

        // Get the best source based on quality and codec preferences
        const source = await streamService.getBestSourceForStreaming(movie.tmdbId, quality, hevc);

        if (!source) {
          const codecMsg = hevc === false ? ' (H.265 excluded)' : '';
          return context.json(
            {
              error: `No ${quality === 'auto' ? 'suitable' : quality} quality source available${codecMsg}`,
            } satisfies ErrorResponse,
            404
          );
        }

        // Stream the file
        const rangeHeader = context.req.header('range');
        const { stream, headers, status } = await downloadService.streamFile(source, rangeHeader);

        // Return the stream
        // The Response constructor is typed incorrectly, so we need to cast to any, there's a PR open to fix this
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return new Response(stream as any, {
          status,
          headers,
        });
      } catch (error: unknown) {
        console.error('Failed to stream content:', error);

        if (error && typeof error === 'object' && 'message' in error) {
          const errorMessage = error.message as string;
          if (errorMessage.includes('Invalid token')) {
            return context.json(
              { error: 'Invalid or expired streaming key' } satisfies ErrorResponse,
              401
            );
          }
          if (errorMessage.includes('stream_timeout')) {
            return context.json(
              {
                error: 'Stream loading timeout',
              } satisfies ErrorResponse,
              504
            );
          }
          if (errorMessage.includes('no_files')) {
            return context.json(
              { error: 'No video files found in torrent' } satisfies ErrorResponse,
              404
            );
          }
        }

        return context.json({ error: 'Internal server error' } satisfies ErrorResponse, 500);
      }
    }
  );
};
