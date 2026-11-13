import { Hono } from 'hono';

import { authGuard } from '@middleware/auth.middleware';

import type { RouteDeps } from './common.types';

export const createIntegrationRoutes = ({ rateLimitGuard, listService, listClient }: RouteDeps) => {
  return new Hono()
    .post('/trakt/authorization', rateLimitGuard(2), authGuard(), async c => {
      const { user } = c.get('sessionInfo');
      return c.json(await listClient.beginTraktConnection(user.id));
    })
    .post(
      '/trakt/authorization/:authorizationId/check',
      rateLimitGuard(1),
      authGuard(),
      async c => {
        const { user } = c.get('sessionInfo');
        const result = await listClient.checkTraktConnection(
          user.id,
          c.req.param('authorizationId')
        );
        if (result.state === 'connected') {
          await listService.reconcileRemoteWatchlist(user.id);
        }
        return c.json(result);
      }
    )
    .get('/trakt/association', rateLimitGuard(5), authGuard(), async c => {
      const { user } = c.get('sessionInfo');
      return c.json(await listClient.getTraktAssociation(user.id));
    })
    .delete('/trakt/association', rateLimitGuard(1), authGuard(), async c => {
      const { user } = c.get('sessionInfo');
      await listClient.disconnectTrakt(user.id);
      return c.json({ connected: false, provider: 'trakt', accountId: null, username: null });
    });
};
