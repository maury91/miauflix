import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import z from 'zod';

import { authGuard } from '@middleware/auth.middleware';
import { createRateLimitMiddlewareFactory } from '@middleware/rate-limit.middleware';
import { type ListLoadPriority, LOCAL_WATCHLIST_SLUG } from '@services/media/list.service';

import type { Deps } from './common.types';
import { serializeMedia } from './list.serializers';
import type { ListDto, ListResponse, ListsPageResponse, ListsResponse } from './list.types';

export const createListRoutes = ({ auditLogService, configurationService, listService }: Deps) => {
  const rateLimitGuard = createRateLimitMiddlewareFactory(auditLogService, configurationService);
  return new Hono()
    .get('/lists', rateLimitGuard(5), authGuard(), async c => {
      const { user } = c.get('sessionInfo');
      const lists = await listService.getLists(user.id);
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
      '/watchlist',
      rateLimitGuard(10),
      authGuard(),
      zValidator(
        'query',
        z.object({
          mediaType: z.enum(['movie', 'tv']).optional(),
          mediaId: z.coerce.number().int().positive().optional(),
          page: z.coerce.number().int().min(0).optional(),
          limit: z.coerce.number().int().min(1).max(50).optional(),
        })
      ),
      async c => {
        const { user } = c.get('sessionInfo');
        const { mediaType, mediaId, page = 0, limit = 20 } = c.req.valid('query');
        if (mediaType && mediaId) {
          return c.json({
            mediaType,
            mediaId,
            inWatchlist: await listService.getWatchlistMembership(user.id, mediaType, mediaId),
          });
        }
        const { medias, total } = await listService.getListPage(
          LOCAL_WATCHLIST_SLUG,
          'en',
          page,
          limit,
          user.id
        );
        return c.json({
          results: medias.map(serializeMedia),
          total,
          page,
          pageSize: limit,
          totalPages: Math.ceil(total / limit),
        } satisfies ListResponse);
      }
    )
    .post(
      '/watchlist',
      rateLimitGuard(30),
      authGuard(),
      zValidator(
        'json',
        z.object({
          mediaType: z.enum(['movie', 'tv']),
          mediaId: z.number().int().positive(),
        })
      ),
      async c => {
        const { user } = c.get('sessionInfo');
        const item = c.req.valid('json');
        await listService.addToWatchlist(user.id, item.mediaType, item.mediaId);
        return c.json({ ...item, inWatchlist: true }, 201);
      }
    )
    .delete(
      '/watchlist',
      rateLimitGuard(30),
      authGuard(),
      zValidator(
        'json',
        z.object({
          mediaType: z.enum(['movie', 'tv']),
          mediaId: z.number().int().positive(),
        })
      ),
      async c => {
        const { user } = c.get('sessionInfo');
        const item = c.req.valid('json');
        await listService.removeFromWatchlist(user.id, item.mediaType, item.mediaId);
        return c.json({ ...item, inWatchlist: false });
      }
    )
    .get(
      '/lists/popular',
      rateLimitGuard(5),
      authGuard(),
      zValidator(
        'query',
        z.object({
          page: z.coerce.number().int().min(0).optional(),
          limit: z.coerce.number().int().min(1).max(20).optional(),
        })
      ),
      async c => {
        const { page = 0, limit = 20 } = c.req.valid('query');
        const result = await listService.getPopularLists(page + 1, limit);
        return c.json({
          results: result.results.map(
            (list): ListDto => ({
              name: list.name,
              slug: list.slug,
              description: list.description,
              url: `/list/${list.slug}`,
            })
          ),
          page,
          pageSize: result.pageSize,
          total: result.totalItems,
          totalPages: result.totalPages,
        } satisfies ListsPageResponse);
      }
    )
    .post(
      '/list/priorities',
      rateLimitGuard(30),
      authGuard(),
      zValidator(
        'json',
        z.object({
          items: z
            .array(
              z.object({
                mediaType: z.enum(['movie', 'tv']),
                mediaId: z.number().int().positive(),
                tier: z.enum(['visible', 'viewport']),
              })
            )
            .min(1)
            .max(50),
        })
      ),
      async c => {
        await listService.promoteMediaPriorities(c.req.valid('json').items);
        return c.json({ accepted: c.req.valid('json').items.length });
      }
    )
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
          priority: z.enum(['visible', 'prefetch']).optional(),
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
        const { lang, limit, page, priority } = c.req.valid('query');
        const { user } = c.get('sessionInfo');
        const pageSize = limit ?? 20;
        const currentPage = page ?? 0;
        const { medias, total } = await listService.getListPage(
          slug,
          lang,
          currentPage,
          pageSize,
          user.id,
          priority as ListLoadPriority | undefined
        );
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
