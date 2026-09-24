import assert from 'node:assert/strict';
import test from 'node:test';

import {
  batchResponseSchema,
  serviceConfigMutationSchema,
  serviceConfigSchemaSchema,
  serviceManifestSchema,
  serviceStatusSchema,
} from './index.js';

test('management manifest requires the supported protocol and relative paths', () => {
  const manifest = serviceManifestSchema.parse({
    id: 'media-catalog',
    name: 'Media Catalog',
    description: 'Catalog',
    version: '1.0.0',
    managementProtocolVersion: 2,
    capabilities: { catalog: { version: 1, basePath: '/v1/catalog' } },
    management: {
      statusPath: '/status',
      configurationSchemaPath: '/configuration/schema',
      configurationTestPath: '/configuration/test',
      configurationApplyPath: '/configuration',
    },
  });
  assert.equal(manifest.capabilities.catalog.version, 1);
  assert.equal(manifest.management.statusEventsPath, undefined);
  assert.equal(
    serviceManifestSchema.parse({ ...manifest, managementProtocolVersion: 1 })
      .managementProtocolVersion,
    1
  );
});

test('management manifest accepts an optional status event stream path', () => {
  const result = serviceManifestSchema.parse({
    id: 'media-catalog',
    name: 'Media Catalog',
    description: 'Catalog',
    version: '1.0.0',
    managementProtocolVersion: 2,
    capabilities: { catalog: { version: 1, basePath: '/v1/catalog' } },
    management: {
      statusPath: '/status',
      statusEventsPath: '/status/events',
      configurationSchemaPath: '/configuration/schema',
      configurationTestPath: '/configuration/test',
      configurationApplyPath: '/configuration',
    },
  });
  assert.equal(result.management.statusEventsPath, '/status/events');
});

test('management manifest rejects paths WHATWG URL normalizes as cross-origin', () => {
  for (const basePath of [
    '//untrusted.example/v1/catalog',
    '/\\untrusted.example/v1/catalog',
    '/\r//untrusted.example/v1/catalog',
    '/\n//untrusted.example/v1/catalog',
    '/\t//untrusted.example/v1/catalog',
  ]) {
    const result = serviceManifestSchema.safeParse({
      id: 'media-catalog',
      name: 'Media Catalog',
      description: 'Catalog',
      version: '1.0.0',
      managementProtocolVersion: 2,
      capabilities: { catalog: { version: 1, basePath } },
      management: {
        statusPath: '/status',
        configurationSchemaPath: '/configuration/schema',
        configurationTestPath: '/configuration/test',
        configurationApplyPath: '/configuration',
      },
    });

    assert.equal(result.success, false, `expected ${JSON.stringify(basePath)} to be rejected`);
  }
});

test('status and complete configuration snapshots are runtime validated', () => {
  assert.equal(
    serviceStatusSchema.parse({ state: 'standby', missingConfiguration: ['TOKEN'] }).state,
    'standby'
  );
  assert.deepEqual(serviceConfigMutationSchema.parse({ values: { TOKEN: 'value' } }), {
    values: { TOKEN: 'value' },
  });
  assert.deepEqual(serviceConfigMutationSchema.parse({ clear: true }), { clear: true });
});

test('configuration schemas publish distinct groups with canonical keys', () => {
  const schema = serviceConfigSchemaSchema.parse({
    groups: [
      { id: 'TRAKT', name: 'Trakt', description: 'Shared settings', variables: [] },
      { id: 'LIST', name: 'Lists', description: 'List service settings', variables: [] },
    ],
  });
  assert.deepEqual(
    schema.groups.map(group => group.id),
    ['TRAKT', 'LIST']
  );
});

test('catalog responses reject drifted media shapes', () => {
  const drifted = { items: [{ mediaType: 'movie', mediaId: 1 }], missing: [] };
  assert.equal(batchResponseSchema.safeParse(drifted).success, false);
});
