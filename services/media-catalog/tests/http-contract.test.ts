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
import { registerSystemRoutes } from '../src/http/handlers/system';
import { Router } from '../src/http/router';
import type { ServiceContext } from '../src/service-context';

const directories: string[] = [];

const setupTest = () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'catalog-http-contract-'));
  directories.push(dataDir);
  const config = new CatalogConfigService(dataDir, {});
  const db = {
    sql: {
      query: (sql: string) => ({
        get: () => ({ total: 0 }),
        all: () => (sql.includes('sync_state') ? [] : []),
      }),
    },
  };
  const context = { config, db, catalog: null, env: {} } as unknown as ServiceContext;
  const router = new Router();
  registerSystemRoutes(router, context);
  registerConfigurationRoutes(router, context);
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
});
