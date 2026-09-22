import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import type { ServiceConfigSchema } from '@miauflix/service-contracts';

import { ServiceConfiguration } from './service-configuration.js';

const schema: ServiceConfigSchema = {
  name: 'Test Service',
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
};

const fixture = async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'miauflix-service-config-'));
  return {
    dataDir,
    configFilePath: join(dataDir, 'config.json'),
    keyFilePath: join(dataDir, '.key'),
  };
};

test('resolves defaults and environment values without persisting test candidates', async () => {
  const paths = await fixture();
  try {
    const config = new ServiceConfiguration({
      schema,
      prefix: 'TEST',
      ...paths,
      env: { API_TOKEN: 'env-token', API_URL: 'https://env.example' },
    });
    config.registerProber({ test: async () => ({ success: true, message: 'ok' }) });

    assert.equal(config.resolve('API_URL'), 'https://env.example');
    assert.deepEqual(config.missingVars(), []);
    assert.equal((await config.test({ API_TOKEN: 'candidate' })).success, true);
    await assert.rejects(readFile(paths.configFilePath, 'utf8'), { code: 'ENOENT' });
  } finally {
    await rm(paths.dataDir, { recursive: true, force: true });
  }
});

test('applies encrypted values and reloads them across instances', async () => {
  const paths = await fixture();
  try {
    const config = new ServiceConfiguration({ schema, prefix: 'TEST', ...paths, env: {} });
    config.registerProber({
      test: async () => ({ success: true, message: 'ok' }),
      activate: async () => ({ success: true, message: 'activated' }),
    });

    const result = await config.applyRemote({ API_TOKEN: 'secret-token' });
    assert.deepEqual(result, {
      success: true,
      reloaded: true,
      test: { success: true, mode: 'live', message: 'activated' },
    });
    assert.match(await readFile(paths.configFilePath, 'utf8'), /TEST__API_TOKEN.*enc:/s);

    const restarted = new ServiceConfiguration({ schema, prefix: 'TEST', ...paths, env: {} });
    assert.equal(restarted.resolve('API_TOKEN'), 'secret-token');
  } finally {
    await rm(paths.dataDir, { recursive: true, force: true });
  }
});

test('restores the previous value when activation rejects a candidate', async () => {
  const paths = await fixture();
  try {
    const config = new ServiceConfiguration({ schema, prefix: 'TEST', ...paths, env: {} });
    config.registerProber({
      test: async () => ({ success: true, message: 'tested' }),
      activate: async values =>
        values.API_TOKEN === 'bad-token'
          ? { success: false, message: 'rejected' }
          : { success: true, message: 'activated' },
    });

    await config.applyRemote({ API_TOKEN: 'good-token' });
    const persistedBefore = await readFile(paths.configFilePath, 'utf8');
    const rejected = await config.applyRemote({ API_TOKEN: 'bad-token' });
    assert.equal(rejected.success, false);
    assert.equal(config.resolve('API_TOKEN'), 'good-token');
    assert.equal(await readFile(paths.configFilePath, 'utf8'), persistedBefore);
  } finally {
    await rm(paths.dataDir, { recursive: true, force: true });
  }
});
