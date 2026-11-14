import { zValidator } from '@hono/zod-validator';
import { logger } from '@logger';
import { ContractError } from '@miauflix/contract';
import { Hono } from 'hono';
import { z } from 'zod';

import { ErrorWithStatus } from '@errors/error-with-status.error';
import { HttpError } from '@errors/http.error';
import { AudioPlaybackError } from '@services/playback/audio-playback.service';
import { OpenedPlaylists, playlistStartingAt } from '@services/playback/tv-remux.service';

import type { RouteDeps } from './common.types';

export const createStreamRoutes = ({
  rateLimitGuard,
  audioPlaybackService,
  mediaLoadClient,
  playbackSessionService,
  streamService,
  tvRemuxService,
}: RouteDeps) => {
  const openedPlaylists = new OpenedPlaylists();
  /** A fake source surfaces as `source_file_unavailable`; `null` lets the route answer 404. */
  const resolveTarget = async (
    grant: Parameters<typeof streamService.resolvePlaybackTarget>[0]
  ): Promise<{
    resolved?: Awaited<ReturnType<typeof streamService.resolvePlaybackTarget>>;
    unavailable?: string;
  }> => {
    try {
      return { resolved: await streamService.resolvePlaybackTarget(grant) };
    } catch (error) {
      if (error instanceof ErrorWithStatus && error.status === 'source_file_unavailable')
        return { unavailable: error.message };
      throw error;
    }
  };

  return new Hono()
    .post(
      '/:token/prefetch',
      rateLimitGuard(60),
      zValidator('param', z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) })),
      zValidator('query', z.object({ remux: z.enum(['true', 'false']).optional() })),
      async c => {
        const grant = await playbackSessionService.verify(c.req.valid('param').token);
        if (!grant) throw new HttpError(401, 'Invalid or expired streaming key');
        // Only the next episode is prefetched; movie grants never reach source resolution.
        if (grant.playableKind !== 'episode')
          throw new HttpError(404, 'Episode file is unavailable');
        const { resolved, unavailable } = await resolveTarget(grant);
        if (unavailable) throw new HttpError(404, unavailable);
        if (!resolved) throw new HttpError(403, 'Playback grant does not match source');
        // Best-effort: grant and source are validated above, so failures here are only logged.
        void mediaLoadClient
          .predownload(resolved.target, {
            kind: 'prefetch',
            ownerKey: `next:${grant.userId}:${grant.playableKey}`,
          })
          .catch((error: unknown) =>
            logger.warn('StreamRoutes', 'Next-episode prefetch failed', error)
          );
        // A TV gets the episode's remux built once it is downloaded, when it needs one.
        if (c.req.valid('query').remux === 'true')
          tvRemuxService.requestWhenDownloaded(resolved.target);
        return c.body(null, 202);
      }
    )
    .get(
      '/:token/remux/:name',
      // AVPlay reads the playlist again every segment, and segments quickly while it buffers.
      rateLimitGuard(600),
      zValidator(
        'param',
        z.object({
          token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
          name: z.string().regex(/^(?:index\.m3u8|seg\d{5}\.ts|s\d{1,3}\.(?:vtt|mkv|sup))$/),
        })
      ),
      zValidator('query', z.object({ start: z.coerce.number().finite().min(0).optional() })),
      async c => {
        const { token, name } = c.req.valid('param');
        const { start } = c.req.valid('query');
        const grant = await playbackSessionService.verify(token);
        if (!grant) throw new HttpError(401, 'Invalid or expired streaming key');
        const { resolved, unavailable } = await resolveTarget(grant);
        if (unavailable) throw new HttpError(404, unavailable);
        if (!resolved) throw new HttpError(403, 'Playback grant does not match source');
        if (name.endsWith('.ts')) openedPlaylists.segmentRequested(token);
        try {
          const response = await mediaLoadClient.readRemux(
            resolved.target,
            name,
            c.req.header('range')
          );
          // A playback opening its playlist starts where the viewer is; once playing, it is whole.
          if (name !== 'index.m3u8' || start === undefined || !openedPlaylists.cut(token))
            return response;
          return new Response(playlistStartingAt(await response.text(), start), {
            status: response.status,
            headers: response.headers,
          });
        } catch (error) {
          if (error instanceof ContractError && error.code === 'remux_not_found')
            throw new HttpError(404, 'This file has no TV version');
          throw error;
        }
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
      async c => {
        const { token } = c.req.valid('param');
        const grant = await playbackSessionService.verify(token);
        if (!grant) throw new HttpError(401, 'Invalid or expired streaming key');
        const { resolved, unavailable } = await resolveTarget(grant);
        if (unavailable) throw new HttpError(404, unavailable);
        if (!resolved) {
          throw new HttpError(403, 'Playback grant does not match source');
        }
        try {
          return await audioPlaybackService.stream(
            resolved.target,
            token,
            c.req.valid('query').start,
            grant.expiresAt,
            c.req.raw.signal,
            c.req.valid('query').audioTrack,
            c.req.valid('query').audioCopy === 'true',
            c.req.valid('query').transcodeVideo === 'true'
          );
        } catch (error) {
          if (error instanceof AudioPlaybackError) throw new HttpError(error.status, error.message);
          throw new HttpError(503, 'Audio conversion could not start. Retry playback.', {
            cause: error,
          });
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
      async c => {
        try {
          const { token } = c.req.valid('param');

          // Playback grants are pinned to the exact source the preparation pipeline selected;
          // they never fall back to source ranking.
          const playbackGrant = await playbackSessionService.verify(token);
          if (!playbackGrant) throw new HttpError(401, 'Invalid or expired streaming key');
          const resolved = await streamService.resolvePlaybackTarget(playbackGrant);
          if (!resolved) {
            throw new HttpError(403, 'Playback grant does not match source');
          }
          return await mediaLoadClient.streamFile(resolved.target, c.req.header('range'));
        } catch (error: unknown) {
          if (error instanceof ErrorWithStatus) {
            if (error.status === 'source_file_unavailable') {
              // A fake source: the player moves on to the next one.
              throw new HttpError(404, error.message);
            }
            if (error.status === 'local_media_unavailable') {
              throw new HttpError(410, error.message);
            }
          }
          // The global error handler logs it and maps service errors (timeouts, ...) to a status.
          throw error;
        }
      }
    );
};
