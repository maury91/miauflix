import {
  MANAGEMENT_PROTOCOL_VERSION,
  SERVICE_MANIFEST_PATH,
  type ServiceManifest,
  serviceManifestSchema,
  type ServiceStatus,
  serviceStatusSchema,
} from '@miauflix/service-contracts';
import {
  CATALOG_CAPABILITY,
  CATALOG_CAPABILITY_VERSION,
  catalogStatusDetailsSchema,
} from '@miauflix/service-contracts';
import { sql } from 'drizzle-orm';

import type { CatalogDatabase } from '../../db/database';
import { episodes, movies, seasons, syncState, tvShows } from '../../db/schema';
import type { ServiceContext } from '../../service-context';
import type { RequestContext, Router } from '../router';
import {
  BASE_PATH,
  CONFIGURATION_APPLY_PATH,
  CONFIGURATION_SCHEMA_PATH,
  CONFIGURATION_STATE_PATH,
  CONFIGURATION_TEST_PATH,
} from './consts.ts';

const SCOPES: Record<string, string> = {
  movies: 'lastMovieSync',
  tv_shows: 'lastShowSync',
};

const count = (
  db: CatalogDatabase,
  table: typeof movies | typeof tvShows | typeof seasons | typeof episodes
): number => {
  return (
    db.db
      .select({ total: sql<number>`count(*)` })
      .from(table)
      .get()?.total ?? 0
  );
};

const lastSync = (
  db: CatalogDatabase
): Pick<
  import('@miauflix/service-contracts').CatalogStatusDetails,
  'lastMovieSync' | 'lastShowSync'
> => {
  const rows = db.db
    .select({ name: syncState.name, lastSync: syncState.lastSync })
    .from(syncState)
    .all();
  const result: Record<string, string | null> = {};
  for (const row of rows) {
    const key = SCOPES[row.name];
    if (key && row.lastSync) result[key] = new Date(row.lastSync).toISOString();
  }
  return {
    lastMovieSync: result.lastMovieSync ?? null,
    lastShowSync: result.lastShowSync ?? null,
  };
};

const buildStatus = (ctx: ServiceContext): ServiceStatus => {
  const { config } = ctx;
  const state = config.state;
  return {
    state,
    message: config.errorMessage ?? undefined,
    errorCode: state === 'error' ? 'provider_unavailable' : undefined,
    missingConfiguration: state === 'ready' ? undefined : config.missingVars(),
    details: catalogStatusDetailsSchema.parse({
      provider: 'tmdb',
      movies: count(ctx.db, movies),
      tvShows: count(ctx.db, tvShows),
      seasons: count(ctx.db, seasons),
      episodes: count(ctx.db, episodes),
      ...lastSync(ctx.db),
    }),
  };
};

export const registerSystemRoutes = (router: Router, ctx: ServiceContext): void => {
  const STATUS_PATH = '/status';

  // Used to ensure services don't get mixed up
  router.add('GET', SERVICE_MANIFEST_PATH, ({ json }) =>
    json(
      serviceManifestSchema.parse({
        id: 'media-catalog',
        name: 'Media Catalog',
        description: 'Movie and television catalog metadata service',
        version: '0.1.0',
        managementProtocolVersion: MANAGEMENT_PROTOCOL_VERSION,
        capabilities: {
          [CATALOG_CAPABILITY]: { version: CATALOG_CAPABILITY_VERSION, basePath: BASE_PATH },
        },
        management: {
          statusPath: STATUS_PATH,
          configurationSchemaPath: CONFIGURATION_SCHEMA_PATH,
          configurationStatePath: CONFIGURATION_STATE_PATH,
          configurationTestPath: CONFIGURATION_TEST_PATH,
          configurationApplyPath: CONFIGURATION_APPLY_PATH,
        },
      } satisfies ServiceManifest)
    )
  );
  // Liveness: always 200 once the process is bound, whatever the lifecycle state —
  // a standby service is healthy, it is just not configured yet.
  router.add('GET', '/health', ({ json }: RequestContext) =>
    json({ status: 'ok', state: ctx.config.state })
  );

  // Readiness + introspection, used by the main app's configuration test.
  router.add('GET', STATUS_PATH, ({ json }: RequestContext) =>
    json(serviceStatusSchema.parse(buildStatus(ctx)))
  );
};
