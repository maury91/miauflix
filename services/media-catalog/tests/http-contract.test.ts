import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  SERVICE_MANIFEST_PATH,
  serviceErrorSchema,
  serviceManifestSchema,
} from '@miauflix/service-contracts';
import { afterEach, describe, expect, it } from 'bun:test';

import { CatalogConfigService } from '../src/config/config.service';
import { registerConfigurationRoutes } from '../src/http/handlers/configuration';
import { registerMediaRoutes } from '../src/http/handlers/media';
import { registerSystemRoutes } from '../src/http/handlers/system';
import { Router } from '../src/http/router';
import type { ServiceContext } from '../src/service-context';

const directories: string[] = [];

const setupTest = () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'catalog-http-contract-'));
  directories.push(dataDir);
  const config = new CatalogConfigService();
  const db = {
    db: {
      select: () => ({
        from: () => ({
          get: () => ({ total: 0 }),
          all: () => [],
        }),
      }),
    },
  };
  const context = { config, db, catalog: null, env: {} } as unknown as ServiceContext;
  const router = new Router();
  registerSystemRoutes(router, context);
  registerConfigurationRoutes(router, context);
  return router;
};

const setupReadyMediaRouter = () => {
  const router = new Router();
  const context = {
    config: { state: 'ready' },
    catalog: {
      getMovie: async (mediaId: number) => ({
        mediaType: 'movie' as const,
        mediaId,
        imdbId: null,
        title: 'Movie',
        overview: '',
        tagline: '',
        releaseDate: '',
        runtime: 0,
        poster: '',
        backdrop: '',
        logo: '',
        genres: [],
        popularity: 0,
        rating: 0,
        detailsSyncedAt: null,
      }),
    },
  } as unknown as ServiceContext;
  registerMediaRoutes(router, context);
  return router;
};

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe('media-catalog management contract', () => {
  it('publishes a runtime-valid discovery manifest', async () => {
    const response = await setupTest().handle(
      new Request(`http://catalog${SERVICE_MANIFEST_PATH}`)
    );
    expect(response.status).toBe(200);
    expect(serviceManifestSchema.parse(await response.json()).capabilities.catalog).toEqual({
      version: 1,
      basePath: '/v1/catalog',
    });
  });

  it('returns the shared error envelope for malformed configuration writes', async () => {
    const response = await setupTest().handle(
      new Request('http://catalog/configuration', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: [] }),
      })
    );
    expect(response.status).toBe(400);
    expect(serviceErrorSchema.parse(await response.json()).code).toBe('invalid_contract_payload');
  });

  it('rejects route parameters that only begin with a valid media ID', async () => {
    const response = await setupReadyMediaRouter().handle(
      new Request('http://catalog/v1/catalog/movie/7junk')
    );

    expect(response.status).toBe(400);
    expect(serviceErrorSchema.parse(await response.json()).code).toBe('invalid_request');
  });
});
