import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import z from 'zod';

import type { MediaList } from '@entities/list.entity';
import { authGuard } from '@middleware/auth.middleware';
import { createRateLimitMiddlewareFactory } from '@middleware/rate-limit.middleware';

import type { Deps } from './common.types';
import { serializeMedia } from './list.serializers';
import type { ListDto, ListResponse, ListsResponse } from './list.types';

export const createListRoutes = ({ auditLogService, configurationService, listService }: Deps) => {
  const rateLimitGuard = createRateLimitMiddlewareFactory(auditLogService, configurationService);
  return new Hono()
    .get('/lists', rateLimitGuard(5), authGuard(), async c => {
      const lists = await listService.getLists();
      return c.json(
        lists.map(
          (list): ListDto => ({
            name: list.name,
            slug: list.slug,
            description: list.description,
            url: `/list/${list.slug}`,
          })
        ) satisfies ListsResponse
      );
    })
    .get(
      '/list/:slug',
      rateLimitGuard(10),
      authGuard(),
      zValidator(
        'query',
        z.object({
          lang: z.string().min(2).max(5).optional(),
        })
      ),
      zValidator(
        'param',
        z.object({
          slug: z.string().min(2).max(100),
        })
      ),
      async c => {
        const slug = c.req.valid('param').slug;
        const lang = c.req.valid('query').lang;
        const list = await listService.getListContent(slug, lang);
        return c.json({
          results: list.map(serializeMedia),
          total: list.length,
          list: await listService.getListBySlug(slug),
        } satisfies ListResponse & { list: MediaList });
      }
    );
};
