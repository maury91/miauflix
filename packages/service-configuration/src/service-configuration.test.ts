import assert from 'node:assert/strict';
import test from 'node:test';

import type { ServiceConfigSchema } from '@miauflix/service-contracts';

import { ServiceConfiguration } from './service-configuration.js';

const schema: ServiceConfigSchema = {
  groups: [
    {
      id: 'PROVIDER',
      name: 'Provider',
      description: 'Configuration test fixture',
      variables: [
        {
          key: 'API_URL',
          description: 'Provider URL',
          required: false,
          inputType: 'text',
          defaultValue: 'https://default.example',
        },
        {
          key: 'API_TOKEN',
          description: 'Provider token',
          required: true,
          inputType: 'password',
          secret: true,
        },
      ],
    },
  ],
};

test('tests complete snapshots without changing active in-memory configuration', async () => {
  const config = new ServiceConfiguration({ schema });
  config.registerProber({ test: async () => ({ success: true, message: 'ok' }) });

  const result = await config.test({ API_URL: 'https://test.example', API_TOKEN: 'candidate' });

  assert.equal(result.success, true);
  assert.equal(result.mode, 'live');
  assert.equal(config.resolve('API_TOKEN'), '');
  assert.equal(config.state, 'standby');
});

test('activates backend snapshots in memory and becomes ready', async () => {
  const config = new ServiceConfiguration({ schema });
  config.registerProber({
    test: async () => ({ success: true, message: 'tested' }),
    activate: async () => ({ success: true, message: 'activated' }),
  });

  const result = await config.applyRemote({ API_URL: 'https://api.example', API_TOKEN: 'secret' });

  assert.deepEqual(result, {
    success: true,
    activated: true,
    test: { success: true, mode: 'live', message: 'activated' },
  });
  assert.equal(config.resolve('API_TOKEN'), 'secret');
  assert.equal(config.ready, true);
});

test('clears active values and returns to standby for rollback to an unconfigured state', async () => {
  const config = new ServiceConfiguration({ schema });
  config.registerProber({
    test: async () => ({ success: true, message: 'tested' }),
    activate: async () => ({ success: true, message: 'activated' }),
  });
  await config.applyRemote({ API_URL: 'https://api.example', API_TOKEN: 'secret' });

  assert.deepEqual(await config.clearRemote(), { success: true, activated: false });
  assert.deepEqual(config.values, {});
  assert.equal(config.state, 'standby');
});

test('retains the previous active snapshot when a candidate activation fails', async () => {
  const config = new ServiceConfiguration({ schema });
  config.registerProber({
    test: async () => ({ success: true, message: 'tested' }),
    activate: async values =>
      values.API_TOKEN === 'bad-token'
        ? { success: false, message: 'rejected' }
        : { success: true, message: 'activated' },
  });

  await config.applyRemote({ API_URL: 'https://api.example', API_TOKEN: 'good-token' });
  const rejected = await config.applyRemote({
    API_URL: 'https://api.example',
    API_TOKEN: 'bad-token',
  });

  assert.equal(rejected.success, false);
  assert.equal(config.resolve('API_TOKEN'), 'good-token');
  assert.equal(config.state, 'ready');
});

test('rejects missing required configuration before probing', async () => {
  const config = new ServiceConfiguration({ schema });
  const probe = { test: async () => ({ success: true, message: 'ok' }) };
  config.registerProber(probe);

  const result = await config.applyRemote({ API_URL: 'https://api.example' });

  assert.equal(result.success, false);
  assert.deepEqual(result.test?.invalidKeys, ['API_TOKEN']);
});
