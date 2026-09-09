import {
  batchRequestSchema,
  batchResponseSchema,
  listDefinitionSchema,
  listPageSchema,
  localizedGenreSchema,
  movieDetailSchema,
  okResponseSchema,
  seasonDetailSchema,
  tvShowDetailSchema,
  watchingRequestSchema,
} from '@miauflix/service-contracts';

import type { ServiceContext } from '../../service-context';
import { HttpError, type Router } from '../router';
import { BASE_PATH } from './consts.ts';

export const MAX_BATCH_ITEMS = 50;

const parseMediaId = (raw: string): number => {
  const mediaId = Number.parseInt(raw, 10);
  if (!Number.isInteger(mediaId) || mediaId <= 0) {
    throw new HttpError(400, `Invalid mediaId: ${raw}`);
  }
  return mediaId;
};

const parseSeasonNumber = (raw: string): number => {
  const seasonNumber = Number.parseInt(raw, 10);
  if (!Number.isInteger(seasonNumber) || seasonNumber < 0) {
    throw new HttpError(400, `Invalid season number: ${raw}`);
  }
  return seasonNumber;
};

const parseLanguage = (url: URL): string => url.searchParams.get('language') ?? 'en';

const parsePage = (url: URL): number => {
  const page = Number.parseInt(url.searchParams.get('page') ?? '1', 10);
  if (!Number.isInteger(page) || page < 1) {
    throw new HttpError(400, `Invalid page: ${url.searchParams.get('page')}`);
  }
  return page;
};

/**
 * Data endpoints. All of them require the service to be `ready` — a standby or
 * misconfigured service answers 503 so the main app maps it to its
 * "service not configured" flow.
 */
export const registerMediaRoutes = (router: Router, ctx: ServiceContext): void => {
  const dataPlane = () => {
    if (ctx.config.state !== 'ready' || !ctx.catalog) {
      throw new HttpError(503, 'catalog_not_configured');
    }
    return ctx.catalog;
  };

  router.add('GET', `${BASE_PATH}/movie/:mediaId`, async ({ params, url, json }) => {
    const catalog = dataPlane();
    return json(
      movieDetailSchema.parse(
        await catalog.getMovie(parseMediaId(params.mediaId), parseLanguage(url))
      )
    );
  });

  router.add('GET', `${BASE_PATH}/tv/:mediaId`, async ({ params, url, json }) => {
    const catalog = dataPlane();
    return json(
      tvShowDetailSchema.parse(
        await catalog.getTVShow(parseMediaId(params.mediaId), parseLanguage(url))
      )
    );
  });

  router.add(
    'GET',
    `${BASE_PATH}/tv/:mediaId/season/:seasonNumber`,
    async ({ params, url, json }) => {
      const catalog = dataPlane();
      return json(
        seasonDetailSchema.parse(
          await catalog.getSeason(
            parseMediaId(params.mediaId),
            parseSeasonNumber(params.seasonNumber),
            parseLanguage(url)
          )
        )
      );
    }
  );

  router.add('POST', `${BASE_PATH}/media/batch`, async ({ req, json }) => {
    const body = batchRequestSchema.parse(await req.json().catch(() => null));
    const catalog = dataPlane();
    return json(batchResponseSchema.parse(await catalog.batch(body.items, body.language)));
  });

  router.add('GET', `${BASE_PATH}/lists`, async ({ json }) => {
    const catalog = dataPlane();
    return json(listDefinitionSchema.array().parse(await catalog.listDefinitions()));
  });

  router.add('GET', `${BASE_PATH}/lists/:slug`, async ({ params, url, json }) => {
    const catalog = dataPlane();
    return json(
      listPageSchema.parse(
        await catalog.getListPage(params.slug, parsePage(url), parseLanguage(url))
      )
    );
  });

  router.add('GET', `${BASE_PATH}/genres`, async ({ url, json }) => {
    const catalog = dataPlane();
    return json(localizedGenreSchema.array().parse(await catalog.getGenres(parseLanguage(url))));
  });

  // Not behind the readiness gate: the main app pushes the watching set at boot,
  // possibly while this service is still in standby.
  router.add('PUT', `${BASE_PATH}/watching`, async ({ req, json }) => {
    const body = watchingRequestSchema.parse(await req.json().catch(() => null));
    await ctx.db.writeQueue.run(() => ctx.db.setWatching(body.mediaIds));
    return json(okResponseSchema.parse({ ok: true }));
  });
};
