import assert from 'node:assert/strict';
import test from 'node:test';

import {
  batchResponseSchema,
  serviceConfigMutationSchema,
  serviceManifestSchema,
  serviceStatusSchema,
} from './index.js';

test('management manifest requires the supported protocol and relative paths', () => {
  const manifest = serviceManifestSchema.parse({
    id: 'media-catalog',
    name: 'Media Catalog',
    description: 'Catalog',
    version: '1.0.0',
    managementProtocolVersion: 1,
    capabilities: { catalog: { version: 1, basePath: '/v1/catalog' } },
    management: {
      statusPath: '/status',
      configurationSchemaPath: '/configuration/schema',
      configurationStatePath: '/configuration',
      configurationTestPath: '/configuration/test',
      configurationApplyPath: '/configuration',
    },
  });
  assert.equal(manifest.capabilities.catalog.version, 1);
  assert.equal(
    serviceManifestSchema.parse({ ...manifest, managementProtocolVersion: 2 })
      .managementProtocolVersion,
    2
  );
});

test('status and explicit configuration clearing are runtime validated', () => {
  assert.equal(
    serviceStatusSchema.parse({ state: 'standby', missingConfiguration: ['TOKEN'] }).state,
    'standby'
  );
  assert.deepEqual(
    serviceConfigMutationSchema.parse({ values: {}, unsetKeys: ['TOKEN'] }).unsetKeys,
    ['TOKEN']
  );
});

test('catalog responses reject drifted media shapes', () => {
  const drifted = { items: [{ mediaType: 'movie', mediaId: 1 }], missing: [] };
  assert.equal(batchResponseSchema.safeParse(drifted).success, false);
});
