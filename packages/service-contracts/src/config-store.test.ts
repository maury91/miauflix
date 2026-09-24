import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { ConfigStore, ServiceSecretCodec } from './config-store.js';

const fixture = async () => {
  const directory = await mkdtemp(join(tmpdir(), 'miauflix-config-store-'));
  return {
    directory,
    filePath: join(directory, 'config.json'),
  };
};

test('read and update expose only explicitly owned keys and preserve foreign values', async () => {
  const { directory, filePath } = await fixture();
  try {
    await writeFile(
      filePath,
      JSON.stringify({ BACKEND__PORT: '3000', CATALOG__TOKEN: 'old', LIST__TOKEN: 'keep' })
    );
    const store = new ConfigStore({ filePath });
    const owned = new Set(['CATALOG__TOKEN']);

    assert.deepEqual(await store.read(owned), { CATALOG__TOKEN: 'old' });
    await store.update(owned, { values: { CATALOG__TOKEN: 'new' } });

    assert.deepEqual(JSON.parse(await readFile(filePath, 'utf8')), {
      BACKEND__PORT: '3000',
      CATALOG__TOKEN: 'new',
      LIST__TOKEN: 'keep',
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('update rejects values outside the ownership set', async () => {
  const { directory, filePath } = await fixture();
  try {
    const store = new ConfigStore({ filePath });
    await assert.rejects(
      store.update(new Set(['CATALOG__TOKEN']), { values: { LIST__TOKEN: 'wrong-owner' } }),
      /not owned by this store/
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('concurrent owners serialize read-modify-write updates', async () => {
  const { directory, filePath } = await fixture();
  try {
    const catalog = new ConfigStore({ filePath, retryDelayMs: 1 });
    const list = new ConfigStore({ filePath, retryDelayMs: 1 });
    await Promise.all([
      catalog.update(new Set(['CATALOG__TOKEN']), { values: { CATALOG__TOKEN: 'catalog' } }),
      list.update(new Set(['LIST__TOKEN']), { values: { LIST__TOKEN: 'list' } }),
    ]);

    assert.deepEqual(JSON.parse(await readFile(filePath, 'utf8')), {
      CATALOG__TOKEN: 'catalog',
      LIST__TOKEN: 'list',
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('unsetKeys remove only owned entries', async () => {
  const { directory, filePath } = await fixture();
  try {
    await writeFile(filePath, JSON.stringify({ CATALOG__TOKEN: 'remove', LIST__TOKEN: 'keep' }));
    const store = new ConfigStore({ filePath });
    await store.update(new Set(['CATALOG__TOKEN']), { unsetKeys: ['CATALOG__TOKEN'] });
    assert.deepEqual(JSON.parse(await readFile(filePath, 'utf8')), { LIST__TOKEN: 'keep' });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('service secret keys are generated once and decrypt across instances', async () => {
  const { directory } = await fixture();
  try {
    const keyPath = join(directory, '.service-key');
    const first = new ServiceSecretCodec({ filePath: keyPath });
    const encrypted = first.encrypt('provider-secret');
    const second = new ServiceSecretCodec({ filePath: keyPath });
    assert.equal(second.key, first.key);
    assert.equal(second.decrypt(encrypted), 'provider-secret');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('service secret codecs use a deployment key without creating a key file', async () => {
  const { directory } = await fixture();
  try {
    const keyPath = join(directory, '.service-key');
    const first = new ServiceSecretCodec({
      filePath: keyPath,
      encryptionKey: 'deployment-secret',
    });
    const encrypted = first.encrypt('provider-secret');
    const second = new ServiceSecretCodec({
      filePath: keyPath,
      encryptionKey: 'deployment-secret',
    });
    assert.equal(second.decrypt(encrypted), 'provider-secret');
    assert.equal(existsSync(keyPath), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
