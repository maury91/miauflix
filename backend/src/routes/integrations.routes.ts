import { Hono } from 'hono';

import { authGuard } from '@middleware/auth.middleware';
import { createRateLimitMiddlewareFactory } from '@middleware/rate-limit.middleware';

import type { Deps } from './common.types';

export const createIntegrationRoutes = ({
  auditLogService,
  configurationService,
  listClient,
}: Deps) => {
  const rateLimitGuard = createRateLimitMiddlewareFactory(auditLogService, configurationService);
  return new Hono()
    .post('/trakt/authorization', rateLimitGuard(2), authGuard(), async context => {
      const { user } = context.get('sessionInfo');
      return context.json(await listClient.beginTraktConnection(user.id));
    })
    .post(
      '/trakt/authorization/:authorizationId/check',
      rateLimitGuard(1),
      authGuard(),
      async context => {
        const { user } = context.get('sessionInfo');
        return context.json(
          await listClient.checkTraktConnection(user.id, context.req.param('authorizationId'))
        );
      }
    )
    .get('/trakt/association', rateLimitGuard(5), authGuard(), async context => {
      const { user } = context.get('sessionInfo');
      return context.json(await listClient.getTraktAssociation(user.id));
    })
    .delete('/trakt/association', rateLimitGuard(1), authGuard(), async context => {
      const { user } = context.get('sessionInfo');
      await listClient.disconnectTrakt(user.id);
      return context.json({ connected: false, provider: 'trakt', accountId: null, username: null });
    });
};
