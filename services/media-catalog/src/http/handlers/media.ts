import {
  artworkQueueRequestSchema,
  artworkQueueResponseSchema,
  artworkSnapshotRequestSchema,
  artworkSnapshotResponseSchema,
  artworkUpdateSchema,
  backdropFocusBackgroundRequestSchema,
  backdropFocusBackgroundResponseSchema,
  backdropFocusResponseSchema,
  batchRequestSchema,
  batchResponseSchema,
  externalMediaResolveRequestSchema,
  externalMediaResolveResponseSchema,
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

const parseDecimalSafeInteger = (raw: string, minimum: number, label: string): number => {
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < minimum) {
    throw new HttpError(400, `Invalid ${label}: ${raw}`);
  }
  return value;
};

const parseMediaId = (raw: string): number => {
  return parseDecimalSafeInteger(raw, 1, 'mediaId');
};

const parseSeasonNumber = (raw: string): number => {
  return parseDecimalSafeInteger(raw, 0, 'season number');
};

const parseLanguage = (url: URL): string => url.searchParams.get('language') ?? 'en';

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
    return json(
      batchResponseSchema.parse(
        await catalog.batch(body.items, body.language, body.artworkPriority)
      )
    );
  });

  router.add('POST', `${BASE_PATH}/media/artwork/snapshot`, async ({ req, json }) => {
    const body = artworkSnapshotRequestSchema.parse(await req.json().catch(() => null));
    const catalog = dataPlane();
    return json(
      artworkSnapshotResponseSchema.parse({
        updates: catalog
          .artworkSnapshot(body.items)
          .map(update => artworkUpdateSchema.parse(update)),
      })
    );
  });

  router.add('POST', `${BASE_PATH}/media/artwork/queue`, async ({ req, json }) => {
    const body = artworkQueueRequestSchema.parse(await req.json().catch(() => null));
    const catalog = dataPlane();
    return json(
      artworkQueueResponseSchema.parse({
        accepted: catalog.queueArtwork(body.items, body.priority),
      })
    );
  });

  router.add('GET', `${BASE_PATH}/media/artwork/events`, ({ req }) => {
    const catalog = dataPlane();
    const encoder = new TextEncoder();
    let unsubscribe: () => void = () => undefined;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      unsubscribe();
      if (heartbeat) clearInterval(heartbeat);
    };
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        unsubscribe = catalog.onArtworkUpdate(update => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(update)}\n\n`));
          } catch {
            close();
          }
        });
        heartbeat = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(': keep-alive\n\n'));
          } catch {
            close();
          }
        }, 20_000);
        req.signal.addEventListener('abort', close, { once: true });
      },
      cancel: close,
    });
    return new Response(stream, {
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
      },
    });
  });

  router.add('POST', `${BASE_PATH}/media/backdrop-focus/background`, async ({ req, json }) => {
    const body = backdropFocusBackgroundRequestSchema.parse(await req.json().catch(() => null));
    const catalog = dataPlane();
    return json(
      backdropFocusBackgroundResponseSchema.parse({
        accepted: catalog.enqueueBackdropFocus(body.items),
      })
    );
  });

  router.add(
    'POST',
    `${BASE_PATH}/media/:mediaType/:mediaId/backdrop-focus`,
    async ({ params, json }) => {
      const catalog = dataPlane();
      const mediaType = params.mediaType;
      if (mediaType !== 'movie' && mediaType !== 'tv')
        throw new HttpError(400, `Invalid media type: ${mediaType}`);
      return json(
        backdropFocusResponseSchema.parse({
          backdropFocus: await catalog.ensureBackdropFocus(mediaType, parseMediaId(params.mediaId)),
        })
      );
    }
  );

  router.add('POST', `${BASE_PATH}/media/resolve`, async ({ req, json }) => {
    const body = externalMediaResolveRequestSchema.parse(await req.json().catch(() => null));
    const catalog = dataPlane();
    const items = await Promise.all(
      body.items.map(async requested => ({
        requested,
        media: await catalog.resolveExternal(requested),
      }))
    );
    return json(externalMediaResolveResponseSchema.parse({ items }));
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
