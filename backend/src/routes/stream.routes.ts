import { zValidator } from '@hono/zod-validator';
import { Quality } from '@miauflix/source-metadata-extractor';
import { Hono } from 'hono';
import { z } from 'zod';

import { createRateLimitMiddlewareFactory } from '@middleware/rate-limit.middleware';
import { AudioPlaybackError } from '@services/playback/audio-playback.service';

import type { Deps, ErrorResponse } from './common.types';

export const createStreamRoutes = ({
  auditLogService,
  audioPlaybackService,
  authService,
  configurationService,
  downloadService,
  mediaService,
  playbackSessionService,
  streamService,
}: Deps) => {
  const rateLimitGuard = createRateLimitMiddlewareFactory(auditLogService, configurationService);

  return new Hono()
    .get(
      '/:token/audio',
      rateLimitGuard(60),
      zValidator('param', z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) })),
      zValidator(
        'query',
        z.object({
          start: z.coerce.number().finite().min(0).default(0),
          audioTrack: z.coerce.number().int().min(0).optional(),
        })
      ),
      async context => {
        const { token } = context.req.valid('param');
        const grant = await playbackSessionService.verify(token);
        if (!grant) return context.json({ error: 'Invalid or expired streaming key' }, 401);
        if (grant.playableKind !== 'movie')
          return context.json({ error: 'Playable source is unavailable' }, 404);
        const source = await streamService.getSourceById(grant.sourceId);
        const movie = source ? await mediaService.getMovieById(source.movieId) : null;
        if (!source || !movie || `m:${movie.mediaId}` !== grant.playableKey) {
          return context.json({ error: 'Playback grant does not match source' }, 403);
        }
        try {
          return await audioPlaybackService.stream(
            source,
            token,
            context.req.valid('query').start,
            grant.expiresAt,
            context.req.raw.signal,
            context.req.valid('query').audioTrack
          );
        } catch (error) {
          if (error instanceof AudioPlaybackError)
            return context.json({ error: error.message }, error.status);
          return context.json({ error: 'Audio conversion could not start. Retry playback.' }, 503);
        }
      }
    )
    .get(
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

          // New playback grants are pinned to the exact source selected by the
          // preparation pipeline. They must never fall back to source ranking.
          const playbackGrant = await playbackSessionService.verify(token);
          if (playbackGrant) {
            if (playbackGrant.playableKind !== 'movie') {
              return context.json(
                { error: 'Playable source is unavailable' } satisfies ErrorResponse,
                404
              );
            }
            const source = await streamService.getSourceById(playbackGrant.sourceId);
            const movie = source ? await mediaService.getMovieById(source.movieId) : null;
            if (!source || !movie || `m:${movie.mediaId}` !== playbackGrant.playableKey) {
              return context.json(
                { error: 'Playback grant does not match source' } satisfies ErrorResponse,
                403
              );
            }
            return await downloadService.streamFile(source, context.req.header('range'));
          }

          // Verify streaming key (includes timing attack protection)
          const keyData = await authService.verifyStreamingKey(token);
          const { movieId } = keyData;
          const movie = await mediaService.getMovieById(movieId);

          if (!movie) {
            return context.json({ error: 'Movie not found' } satisfies ErrorResponse, 404);
          }

          // Get the best source based on quality and codec preferences
          const source = await streamService.getBestSourceForStreaming(movieId, quality, hevc);

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
          return await downloadService.streamFile(source, rangeHeader);
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
