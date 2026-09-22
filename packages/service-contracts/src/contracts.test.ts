import assert from 'node:assert/strict';
import test from 'node:test';

import {
  batchResponseSchema,
  mediaSummaryBatchRequestSchema,
  mediaSummaryBatchResponseSchema,
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
  assert.equal(manifest.management.statusEventsPath, undefined);
  assert.equal(
    serviceManifestSchema.parse({ ...manifest, managementProtocolVersion: 2 })
      .managementProtocolVersion,
    2
  );
});

test('management manifest accepts an optional status event stream path', () => {
  const result = serviceManifestSchema.parse({
    id: 'media-catalog',
    name: 'Media Catalog',
    description: 'Catalog',
    version: '1.0.0',
    managementProtocolVersion: 1,
    capabilities: { catalog: { version: 1, basePath: '/v1/catalog' } },
    management: {
      statusPath: '/status',
      statusEventsPath: '/status/events',
      configurationSchemaPath: '/configuration/schema',
      configurationStatePath: '/configuration',
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
      managementProtocolVersion: 1,
      capabilities: { catalog: { version: 1, basePath } },
      management: {
        statusPath: '/status',
        configurationSchemaPath: '/configuration/schema',
        configurationStatePath: '/configuration',
        configurationTestPath: '/configuration/test',
        configurationApplyPath: '/configuration',
      },
    });

    assert.equal(result.success, false, `expected ${JSON.stringify(basePath)} to be rejected`);
  }
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

test('catalog v1 summary contract carries read policy and partial results', () => {
  const request = mediaSummaryBatchRequestSchema.parse({
    items: [{ mediaType: 'movie', mediaId: 1 }],
    language: 'en',
    mode: 'cache-only',
    workClass: 'foreground',
  });
  assert.equal(request.mode, 'cache-only');
  assert.equal(
    mediaSummaryBatchResponseSchema.safeParse({
      items: [],
      pending: [{ mediaType: 'movie', mediaId: 1 }],
      missing: [],
      errors: [],
    }).success,
    true
  );
});
