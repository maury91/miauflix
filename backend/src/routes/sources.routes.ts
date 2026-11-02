import { zValidator } from '@hono/zod-validator';
import { isContractError } from '@miauflix/contract';
import { Hono } from 'hono';
import { z } from 'zod';

import { UserRole } from '@entities/user.entity';
import { authGuard } from '@middleware/auth.middleware';
import { createRateLimitMiddlewareFactory } from '@middleware/rate-limit.middleware';

import type { Deps } from './common.types';

const updateSchema = z.object({
  enabled: z.boolean().optional(),
  priority: z.number().int().min(1).max(999).optional(),
  settings: z.record(z.string(), z.union([z.string().max(2000), z.boolean()])).optional(),
});
const orderSchema = z.object({ ids: z.array(z.string().max(100)).max(500) });
const cardigannSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/),
  source: z.string().max(300).optional(),
});
const flag = z
  .enum(['true', 'false'])
  .transform(value => value === 'true')
  .optional();
const catalogSchema = z.object({
  query: z.string().max(100).optional(),
  source: z.string().max(300).optional(),
  imdb: flag,
  tmdb: flag,
  tvdb: flag,
  movies: flag,
  tv: flag,
  anime: flag,
  publicOnly: flag,
  supportedOnly: flag,
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(0).max(100).default(40),
});
const torznabSchema = z.object({
  name: z.string().trim().min(1).max(100),
  baseUrl: z.string().url().max(2000),
  apiKey: z.string().max(500).optional(),
});
const repositorySchema = z.object({ url: z.string().url().max(2000) });

/** Maps the service's typed errors to HTTP; anything else is left to the global handler. */
const failure = (error: unknown) => {
  if (isContractError(error, 'not_found')) return { status: 404 as const, message: error.message };
  if (isContractError(error, 'bad_request'))
    return { status: 400 as const, message: error.message };
  if (isContractError(error, 'unsupported'))
    return { status: 503 as const, message: 'The sources service does not support this yet' };
  return null;
};

export const createSourcesRoutes = (deps: Deps) => {
  const rateLimitGuard = createRateLimitMiddlewareFactory(
    deps.auditLogService,
    deps.configurationService
  );
  const sources = deps.sourcesClientService;
  const admin = authGuard(UserRole.ADMIN);

  return new Hono()
    .get('/providers', rateLimitGuard(10), admin, async c => c.json(await sources.providers()))
    .put('/providers/order', rateLimitGuard(5), admin, zValidator('json', orderSchema), async c => {
      try {
        return c.json(await sources.reorderProviders(c.req.valid('json').ids));
      } catch (error) {
        const mapped = failure(error);
        if (!mapped) throw error;
        return c.json({ error: mapped.message }, mapped.status);
      }
    })
    .patch(
      '/providers/:id',
      rateLimitGuard(10),
      admin,
      zValidator('json', updateSchema),
      async c => {
        try {
          return c.json(
            await sources.updateProvider({ id: c.req.param('id'), ...c.req.valid('json') })
          );
        } catch (error) {
          const mapped = failure(error);
          if (!mapped) throw error;
          return c.json({ error: mapped.message }, mapped.status);
        }
      }
    )
    .get('/definitions', rateLimitGuard(30), admin, zValidator('query', catalogSchema), async c => {
      try {
        return c.json(await sources.cardigannDefinitions(c.req.valid('query')));
      } catch (error) {
        const mapped = failure(error);
        if (!mapped) throw error;
        return c.json({ error: mapped.message }, mapped.status);
      }
    })
    .post('/definitions/sync', rateLimitGuard(5), admin, async c => {
      try {
        return c.json(await sources.syncCardigannDefinitions());
      } catch (error) {
        const mapped = failure(error);
        if (!mapped) throw error;
        return c.json({ error: mapped.message }, mapped.status);
      }
    })
    .post(
      '/providers/cardigann',
      rateLimitGuard(3),
      admin,
      zValidator('json', cardigannSchema),
      async c => {
        try {
          return c.json(await sources.addCardigannProvider(c.req.valid('json')), 201);
        } catch (error) {
          const mapped = failure(error);
          if (!mapped) throw error;
          return c.json({ error: mapped.message }, mapped.status);
        }
      }
    )
    .post(
      '/providers/torznab',
      rateLimitGuard(3),
      admin,
      zValidator('json', torznabSchema),
      async c => {
        try {
          return c.json(await sources.addTorznabProvider(c.req.valid('json')), 201);
        } catch (error) {
          const mapped = failure(error);
          if (!mapped) throw error;
          return c.json({ error: mapped.message }, mapped.status);
        }
      }
    )
    .delete('/providers/:id', rateLimitGuard(5), admin, async c => {
      try {
        await sources.removeProvider(c.req.param('id'));
        return c.body(null, 204);
      } catch (error) {
        const mapped = failure(error);
        if (!mapped) throw error;
        return c.json({ error: mapped.message }, mapped.status);
      }
    })
    .post('/providers/:id/test', rateLimitGuard(5), admin, async c => {
      try {
        return c.json(await sources.testProvider(c.req.param('id')));
      } catch (error) {
        const mapped = failure(error);
        if (!mapped) throw error;
        return c.json({ error: mapped.message }, mapped.status);
      }
    })
    .get('/repositories', rateLimitGuard(10), admin, async c =>
      c.json(await sources.repositories())
    )
    .post(
      '/repositories',
      rateLimitGuard(3),
      admin,
      zValidator('json', repositorySchema),
      async c => {
        try {
          return c.json(await sources.addRepository(c.req.valid('json').url), 201);
        } catch (error) {
          const mapped = failure(error);
          if (!mapped) throw error;
          return c.json({ error: mapped.message }, mapped.status);
        }
      }
    )
    .delete('/repositories/:id', rateLimitGuard(5), admin, async c => {
      try {
        await sources.removeRepository(c.req.param('id'));
        return c.body(null, 204);
      } catch (error) {
        const mapped = failure(error);
        if (!mapped) throw error;
        return c.json({ error: mapped.message }, mapped.status);
      }
    })
    .post('/repositories/:id/refresh', rateLimitGuard(3), admin, async c => {
      try {
        return c.json(await sources.refreshRepository(c.req.param('id')));
      } catch (error) {
        const mapped = failure(error);
        if (!mapped) throw error;
        return c.json({ error: mapped.message }, mapped.status);
      }
    });
};
