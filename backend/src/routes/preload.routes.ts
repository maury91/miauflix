import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { authGuard } from '@middleware/auth.middleware';
import { createRateLimitMiddlewareFactory } from '@middleware/rate-limit.middleware';
import { preloadIntentRequestSchema } from '@mytypes/playable.types';
import type { PreloadIntentResponse } from '@mytypes/preload.types';

import type { Deps } from './common.types';

const clientIdSchema = z.object({
  clientId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/, 'Invalid client id'),
});

const cleanupQuerySchema = z.object({
  sequence: z.coerce.number().int().nonnegative().safe().optional(),
});

export const createPreloadRoutes = ({
  auditLogService,
  configurationService,
  preloadIntentService,
}: Pick<Deps, 'auditLogService' | 'configurationService' | 'preloadIntentService'>) => {
  const rateLimitGuard = createRateLimitMiddlewareFactory(auditLogService, configurationService);

  return new Hono()
    .put(
      '/intents/:clientId',
      rateLimitGuard(30),
      authGuard(),
      zValidator('param', clientIdSchema),
      zValidator('json', preloadIntentRequestSchema),
      c => {
        const session = c.get('sessionInfo');
        const result = preloadIntentService.update(
          session.user.id,
          session.sessionId,
          c.req.valid('param').clientId,
          c.req.valid('json')
        );
        const response: PreloadIntentResponse = {
          acceptedSequence: result.acceptedSequence,
          expiresAt: result.expiresAt.toISOString(),
          preparation: result.preparation,
        };
        return c.json(response, result.accepted ? 200 : 409);
      }
    )
    .delete(
      '/intents/:clientId',
      rateLimitGuard(30),
      authGuard(),
      zValidator('param', clientIdSchema),
      zValidator('query', cleanupQuerySchema),
      c => {
        const session = c.get('sessionInfo');
        preloadIntentService.remove(
          session.user.id,
          session.sessionId,
          c.req.valid('param').clientId,
          c.req.valid('query').sequence
        );
        return c.body(null, 204);
      }
    );
};
