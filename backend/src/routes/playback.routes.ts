import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';

import { HttpError } from '@errors/http.error';
import { authGuard } from '@middleware/auth.middleware';
import { AudioPlaybackError } from '@services/playback/audio-playback.service';
import { PlaybackUnavailableError } from '@services/playback/playback-session.service';

import type { RouteDeps } from './common.types';
import type { CreatePlaybackSessionResponse, PlaybackUnavailableResponse } from './playback.types';
import { createPlaybackSessionRequestSchema } from './playback.types';

export const createPlaybackRoutes = ({
  rateLimitGuard,
  playbackSessionService,
}: Pick<RouteDeps, 'playbackSessionService' | 'rateLimitGuard'>) => {
  return new Hono().post(
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
            sessionId: session.sessionId,
          }
        );
      } catch (error) {
        if (error instanceof AudioPlaybackError) throw new HttpError(error.status, error.message);
        if (error instanceof PlaybackUnavailableError)
          return c.json(
            { error: error.message, reason: error.reason } satisfies PlaybackUnavailableResponse,
            404
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
