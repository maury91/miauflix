import { defineService, type Service, type ServiceStatus } from '@miauflix/contract';
import {
  catalog as catalogContract,
  type CatalogStatusDetails,
  MAX_BATCH_ITEMS,
  SEARCH_GENRE_KEY_PATTERN,
} from '@miauflix/contracts';
import { sql } from 'drizzle-orm';

import type { CatalogDatabase } from './db/database';
import { episodes, movies, seasons, syncState, tvShows } from './db/schema';
import { HttpError } from './errors';
import { logger } from './logger';
import type { ServiceContext } from './service-context';

const SCOPE = 'MediaCatalog';
const SYNC_SCOPES: Record<string, string> = { movies: 'lastMovieSync', tv_shows: 'lastShowSync' };
const STATUS_NOTIFY_INTERVAL_MS = 5_000;
const MAX_QUERY_LENGTH = 100;
const MAX_SEARCH_PAGE = 500;

const count = (
  db: CatalogDatabase,
  table: typeof movies | typeof tvShows | typeof seasons | typeof episodes
): number =>
  db.db
    .select({ total: sql<number>`count(*)` })
    .from(table)
    .get()?.total ?? 0;

const lastSync = (
  db: CatalogDatabase
): Pick<CatalogStatusDetails, 'lastMovieSync' | 'lastShowSync'> => {
  const rows = db.db
    .select({ name: syncState.name, lastSync: syncState.lastSync })
    .from(syncState)
    .all();
  const result: Record<string, string | null> = {};
  for (const row of rows) {
    const key = SYNC_SCOPES[row.name];
    if (key && row.lastSync) result[key] = new Date(row.lastSync).toISOString();
  }
  return {
    lastMovieSync: result.lastMovieSync ?? null,
    lastShowSync: result.lastShowSync ?? null,
  };
};

const buildStatus = ({ config, db }: ServiceContext): ServiceStatus => {
  const state = config.state;
  const details: CatalogStatusDetails = {
    provider: 'tmdb',
    movies: count(db, movies),
    tvShows: count(db, tvShows),
    seasons: count(db, seasons),
    episodes: count(db, episodes),
    ...lastSync(db),
  };
  return {
    state,
    message: config.errorMessage ?? undefined,
    errorCode: state === 'error' ? 'provider_unavailable' : undefined,
    missingConfiguration: state === 'ready' ? undefined : config.missingVars(),
    details: { ...details },
  };
};

const isNotFound = (error: unknown): boolean => error instanceof HttpError && error.status === 404;

/**
 * Builds the media-catalog service. The data plane (`context.catalog`) attaches later, after a
 * successful configuration apply; data methods are rejected as `not_configured` until then.
 */
export const createCatalogService = (context: ServiceContext): Service => {
  const { config, db } = context;
  const catalog = (): NonNullable<ServiceContext['catalog']> => {
    if (!context.catalog) throw new Error('Catalog data plane is not attached');
    return context.catalog;
  };

  let interval: ReturnType<typeof setInterval> | undefined;

  const service = defineService({
    info: {
      id: 'media-catalog',
      name: 'Media Catalog',
      description: 'Movie and television catalog metadata service',
      version: '0.1.0',
    },
    configuration: config,
    status: () => buildStatus(context),
    ready: () => config.state === 'ready' && context.catalog !== null,
    onError: (method, error) => logger.error(SCOPE, `Unexpected failure in ${method}`, error),
    onStop: () => {
      if (interval) clearInterval(interval);
      interval = undefined;
    },
  });

  service.implement(catalogContract, {
    getMovie: async ({ mediaId, language }, ctx) => {
      try {
        return (await catalog().getMovie(mediaId, language)) ?? ctx.fail('not_found');
      } catch (error) {
        if (isNotFound(error)) ctx.fail('not_found', (error as Error).message);
        throw error;
      }
    },
    getShow: async ({ mediaId, language }, ctx) => {
      try {
        return (await catalog().getTVShow(mediaId, language)) ?? ctx.fail('not_found');
      } catch (error) {
        if (isNotFound(error)) ctx.fail('not_found', (error as Error).message);
        throw error;
      }
    },
    getSeason: async ({ tvMediaId, seasonNumber, language }, ctx) => {
      try {
        return (
          (await catalog().getSeason(tvMediaId, seasonNumber, language)) ?? ctx.fail('not_found')
        );
      } catch (error) {
        if (isNotFound(error)) ctx.fail('not_found', (error as Error).message);
        throw error;
      }
    },
    search: ({ query, page, language }, ctx) => {
      const trimmed = query.trim();
      if (trimmed.length < 1 || trimmed.length > MAX_QUERY_LENGTH)
        ctx.fail('bad_request', `query must be 1..${MAX_QUERY_LENGTH} characters`);
      if (!Number.isInteger(page) || page < 1 || page > MAX_SEARCH_PAGE)
        ctx.fail('bad_request', `page must be an integer 1..${MAX_SEARCH_PAGE}`);
      return catalog().search(trimmed, page, language);
    },
    discover: ({ genre, page, language }, ctx) => {
      if (!SEARCH_GENRE_KEY_PATTERN.test(genre)) ctx.fail('bad_request', 'Invalid genre');
      if (!Number.isInteger(page) || page < 1 || page > MAX_SEARCH_PAGE)
        ctx.fail('bad_request', `page must be an integer 1..${MAX_SEARCH_PAGE}`);
      return catalog().discover(genre, page, language);
    },
    searchGenres: ({ language }) => catalog().searchGenres(language),
    batch: async ({ items, language, artworkPriority }, ctx) => {
      if (items.length > MAX_BATCH_ITEMS)
        ctx.fail('bad_request', `At most ${MAX_BATCH_ITEMS} items per batch`);
      const result = await catalog().batch(items, language, artworkPriority);
      return { ...result, errors: result.errors ?? [] };
    },
    resolveExternal: ({ items }) =>
      Promise.all(
        items.map(async requested => ({
          requested,
          media: await catalog().resolveExternal(requested),
        }))
      ),
    queueArtwork: ({ items, priority }) => catalog().queueArtwork(items, priority),
    artworkSnapshot: ({ items }) => catalog().artworkSnapshot(items),
    artwork: emit => catalog().onArtworkUpdate(emit),
    ensureBackdropFocus: async ({ mediaType, mediaId }, ctx) => {
      try {
        return await catalog().ensureBackdropFocus(mediaType, mediaId);
      } catch (error) {
        if (isNotFound(error)) ctx.fail('not_found', (error as Error).message);
        if (error instanceof HttpError && error.status === 422)
          ctx.fail('no_backdrop', 'The title has no backdrop to analyse');
        throw error;
      }
    },
    queueBackdropFocus: ({ items }) => catalog().enqueueBackdropFocus(items),
    // Not behind the readiness gate: the host pushes the watching set at boot, possibly while
    // this service is still in standby.
    setWatching: async ({ mediaIds }) => {
      await db.writeQueue.run(() => db.setWatching(mediaIds));
    },
  });

  interval = setInterval(() => service.notifyStatus(), STATUS_NOTIFY_INTERVAL_MS);
  interval.unref?.();
  return service;
};
