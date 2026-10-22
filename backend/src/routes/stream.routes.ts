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
    .post(
      '/:token/prefetch',
      rateLimitGuard(60),
      zValidator('param', z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) })),
      async context => {
        const grant = await playbackSessionService.verify(context.req.valid('param').token);
        if (!grant) return context.json({ error: 'Invalid or expired streaming key' }, 401);
        // Only the next episode is prefetched; movie grants never reach source resolution.
        if (grant.playableKind !== 'episode')
          return context.json({ error: 'Episode file is unavailable' }, 404);
        const resolved = await streamService.resolvePlaybackTarget(grant);
        if (!resolved) return context.json({ error: 'Playback grant does not match source' }, 403);
        await downloadService.predownload(resolved.target);
        return context.body(null, 202);
      }
    )
    .get(
      '/:token/audio',
      rateLimitGuard(60),
      zValidator('param', z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) })),
      zValidator(
        'query',
        z.object({
          start: z.coerce.number().finite().min(0).default(0),
          audioTrack: z.coerce.number().int().min(0).optional(),
          audioCopy: z.enum(['true', 'false']).optional(),
          transcodeVideo: z.enum(['true', 'false']).optional(),
        })
      ),
      async context => {
        const { token } = context.req.valid('param');
        const grant = await playbackSessionService.verify(token);
        if (!grant) return context.json({ error: 'Invalid or expired streaming key' }, 401);
        const resolved = await streamService.resolvePlaybackTarget(grant);
        if (!resolved) {
          return context.json({ error: 'Playback grant does not match source' }, 403);
        }
        try {
          return await audioPlaybackService.stream(
            resolved.target,
            token,
            context.req.valid('query').start,
            grant.expiresAt,
            context.req.raw.signal,
            context.req.valid('query').audioTrack,
            context.req.valid('query').audioCopy === 'true',
            context.req.valid('query').transcodeVideo === 'true'
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
            const resolved = await streamService.resolvePlaybackTarget(playbackGrant);
            if (!resolved) {
              return context.json(
                { error: 'Playback grant does not match source' } satisfies ErrorResponse,
                403
              );
            }
            return await downloadService.streamFile(resolved.target, context.req.header('range'));
          }

          // Verify streaming key (includes timing attack protection)
          const keyData = await authService.verifyStreamingKey(token);
          const { movieId } = keyData;
          if (!movieId)
            return context.json({ error: 'Movie not found' } satisfies ErrorResponse, 404);
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

          // Stream the movie's main video
          const target = await streamService.movieTarget(movieId, source);
          return await downloadService.streamFile(target, context.req.header('range'));
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
