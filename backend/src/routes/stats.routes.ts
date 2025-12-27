import { Hono } from 'hono';

import { authGuard } from '@middleware/auth.middleware';
import { createRateLimitMiddlewareFactory } from '@middleware/rate-limit.middleware';

import type { Deps } from './common.types';

export const createStatsRoutes = ({ statsService, auditLogService }: Deps) => {
  const rateLimitGuard = createRateLimitMiddlewareFactory(auditLogService);

  return new Hono().get('/stats', rateLimitGuard(10), authGuard(), async c => {
    const stats = statsService.report();
    return c.json(stats);
  });
};
