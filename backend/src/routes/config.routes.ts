import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { UserRole } from '@entities/user.entity';
import { ConfigurationServiceError } from '@errors/configuration.errors';
import { authGuard } from '@middleware/auth.middleware';
import { createRateLimitMiddlewareFactory } from '@middleware/rate-limit.middleware';
import { ALL_VAR_NAMES } from '@services/configuration/configuration.consts';
import { isConfigGroupName } from '@services/configuration/configuration.utils';

import type { Deps } from './common.types';
const configEntriesSchema = z.object({
  entries: z.array(z.object({ key: z.string(), value: z.string() })),
});

export const createConfigRoutes = (deps: Deps) => {
  const rateLimitGuard = createRateLimitMiddlewareFactory(
    deps.auditLogService,
    deps.configurationService
  );

  return (
    new Hono()
      // GET /api/config — list all config values (secrets masked)
      .get('/', rateLimitGuard(5), authGuard(UserRole.ADMIN), async c => {
        const configs = await deps.configurationService.getAllConfigs();
        return c.json(configs);
      })
      // PUT /api/config — update config values
      .put(
        '/',
        rateLimitGuard(2),
        authGuard(UserRole.ADMIN),
        zValidator('json', configEntriesSchema),
        async c => {
          const { entries } = c.req.valid('json');

          const unknownKeys = entries.filter(e => !ALL_VAR_NAMES.has(e.key));
          if (unknownKeys.length > 0) {
            return c.json(
              { error: `Unknown configuration keys: ${unknownKeys.map(e => e.key).join(', ')}` },
              400
            );
          }

          return c.json(await deps.configurationService.testAndSaveConfigs(entries));
        }
      )

      // POST /api/config/:service/test — test draft values without persisting them
      .post(
        '/:service/test',
        rateLimitGuard(2),
        authGuard(UserRole.ADMIN),
        zValidator('json', configEntriesSchema),
        async c => {
          const serviceParam = c.req.param('service').toUpperCase();
          if (!isConfigGroupName(serviceParam)) {
            return c.json({ error: `Configuration group '${serviceParam}' does not exist` }, 404);
          }
          const { entries } = c.req.valid('json');
          return c.json(await deps.configurationService.testServiceConfigs(serviceParam, entries));
        }
      )

      // PUT /api/config/:service — test and persist one service's values
      .put(
        '/:service',
        rateLimitGuard(2),
        authGuard(UserRole.ADMIN),
        zValidator('json', configEntriesSchema),
        async c => {
          const serviceParam = c.req.param('service').toUpperCase();
          if (!isConfigGroupName(serviceParam)) {
            return c.json({ error: `Configuration group '${serviceParam}' does not exist` }, 404);
          }
          const { entries } = c.req.valid('json');
          return c.json(await deps.configurationService.saveServiceConfigs(serviceParam, entries));
        }
      )

      // POST /api/config/:service/restart — restart a service after config change
      .post('/:service/restart', rateLimitGuard(1), authGuard(UserRole.ADMIN), async c => {
        const serviceParam = c.req.param('service').toUpperCase();

        try {
          await deps.configurationService.restartService(serviceParam);
          const status = deps.configurationService.getServiceStatuses()[serviceParam];
          return c.json({ success: true, status });
        } catch (e) {
          if (e instanceof ConfigurationServiceError) {
            switch (e.code) {
              case 'service_not_found':
                return c.json({ error: e.message }, 404);
              case 'service_not_registered':
                return c.json(
                  {
                    error: `Service '${serviceParam}' requires a process restart to apply configuration changes`,
                    requiresProcessRestart: true,
                  },
                  422
                );
            }
            return c.json({ error: e.message }, 400);
          }
          return c.json({ error: 'Restart failed' }, 500);
        }
      })
  );
};
