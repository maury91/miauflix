import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import z from 'zod';

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
          page: z.coerce.number().int().min(0).optional(),
          limit: z.coerce.number().int().min(1).max(50).optional(),
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
        const { lang, limit, page } = c.req.valid('query');
        const pageSize = limit ?? 20;
        const currentPage = page ?? 0;
        const { medias, total } = await listService.getListPage(slug, lang, currentPage, pageSize);
        return c.json({
          results: medias.map(serializeMedia),
          total,
          page: currentPage,
          pageSize,
          totalPages: Math.ceil(total / pageSize),
        } satisfies ListResponse);
      }
    );
};
