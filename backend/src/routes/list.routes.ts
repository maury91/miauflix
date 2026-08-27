import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import z from 'zod';

import type { MediaList } from '@entities/list.entity';
import { authGuard } from '@middleware/auth.middleware';
import { createRateLimitMiddlewareFactory } from '@middleware/rate-limit.middleware';

import type { Deps } from './common.types';
import { paginate } from './list.pagination';
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
        const list = await listService.getListContent(slug, lang);
        const paginationRequested = page !== undefined || limit !== undefined;
        const pageSize = limit ?? 20;
        const currentPage = page ?? 0;
        const pagination = paginationRequested ? paginate(list, currentPage, pageSize) : null;
        return c.json({
          results: (pagination?.results ?? list).map(serializeMedia),
          total: list.length,
          ...(pagination
            ? {
                page: pagination.page,
                pageSize: pagination.pageSize,
                totalPages: pagination.totalPages,
              }
            : {}),
          list: await listService.getListBySlug(slug),
        } satisfies ListResponse & { list: MediaList });
      }
    );
};
