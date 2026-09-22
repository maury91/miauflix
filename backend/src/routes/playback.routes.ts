import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';

import { authGuard } from '@middleware/auth.middleware';
import { createRateLimitMiddlewareFactory } from '@middleware/rate-limit.middleware';

import type { Deps, ErrorResponse } from './common.types';
import type { CreatePlaybackSessionResponse } from './playback.types';
import { createPlaybackSessionRequestSchema } from './playback.types';

export const createPlaybackRoutes = ({
  auditLogService,
  configurationService,
  playbackSessionService,
}: Pick<Deps, 'auditLogService' | 'configurationService' | 'playbackSessionService'>) => {
  const rateLimitGuard = createRateLimitMiddlewareFactory(auditLogService, configurationService);

  return new Hono().post(
    '/sessions',
    rateLimitGuard(10),
    authGuard(),
    zValidator('json', createPlaybackSessionRequestSchema),
    async c => {
      const session = c.get('sessionInfo');
      const result = await playbackSessionService.create(
        session.user.id,
        c.req.valid('json').playable,
        c.req.valid('json').preferences
      );
      if (!result) {
        return c.json({ error: 'No playable source available' } satisfies ErrorResponse, 404);
      }
      return c.json(result satisfies CreatePlaybackSessionResponse, 201);
    }
  );
};
