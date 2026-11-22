import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';

import { HttpError } from '@errors/http.error';
import { authGuard } from '@middleware/auth.middleware';
import { AudioPlaybackError } from '@services/playback/audio-playback.service';
import { PlaybackUnavailableError } from '@services/playback/playback-session.service';

import type { RouteDeps } from './common.types';
import type { CreatePlaybackSessionResponse, PlaybackUnavailableResponse } from './playback.types';
import {
  audioSourcesRequestSchema,
  audioSourcesSearchSchema,
  createPlaybackSessionRequestSchema,
} from './playback.types';

export const createPlaybackRoutes = ({
  rateLimitGuard,
  playbackSessionService,
  audioSourcesService,
}: Pick<RouteDeps, 'audioSourcesService' | 'playbackSessionService' | 'rateLimitGuard'>) => {
  return new Hono()
    .post(
      '/sources',
      rateLimitGuard(30),
      authGuard(),
      zValidator('json', audioSourcesRequestSchema),
      async c => c.json(await audioSourcesService.list(c.req.valid('json').playable))
    )
    .post(
      '/sources/search',
      rateLimitGuard(5),
      authGuard(),
      zValidator('json', audioSourcesSearchSchema),
      async c => {
        const { playable, language } = c.req.valid('json');
        return c.json(await audioSourcesService.search(playable, language));
      }
    )
    .post(
      '/sessions',
      rateLimitGuard(10),
      authGuard(),
      zValidator('json', createPlaybackSessionRequestSchema),
      async c => {
        const session = c.get('sessionInfo');
        const request = c.req.valid('json');
        let result;
        try {
          result = await playbackSessionService.create(
            session.user.id,
            request.playable,
            request.preferences,
            {
              ...(request.deferDownload ? { deferDownload: true } : {}),
              ...(request.avoidSourceIds?.length ? { avoidSourceIds: request.avoidSourceIds } : {}),
              ...(request.sourceId ? { sourceId: request.sourceId } : {}),
              sessionId: session.sessionId,
            }
          );
        } catch (error) {
          if (error instanceof AudioPlaybackError) throw new HttpError(error.status, error.message);
          if (error instanceof PlaybackUnavailableError)
            return c.json(
              { error: error.message, reason: error.reason } satisfies PlaybackUnavailableResponse,
              error.reason === 'insufficient_storage' ? 507 : 404
            );
          throw error;
        }
        if (!result) {
          return c.json(
            {
              error: 'No playable source available',
              reason: 'not_found',
            } satisfies PlaybackUnavailableResponse,
            404
          );
        }
        return c.json(result satisfies CreatePlaybackSessionResponse, 201);
      }
    );
};
