jest.mock('@logger');

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { CacheableMemory } from 'cacheable';

import { CacheService } from './cache.service';

describe('CacheService', () => {
  const setupTest = () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), 'cache-service-'));
    const config = {
      getOrThrow: (key: string) => (key === 'DATA_DIR' ? dataDir : BigInt(1024 * 1024)),
    };
    const service = new CacheService(config as never);
    const memory = (service.cache.stores[0] as unknown as { opts: { store: CacheableMemory } }).opts
      .store;
    return { service, memory, dataDir };
  };

  it('keeps the memory layer within its LRU size while entries expire and are set again', async () => {
    const { service, memory, dataDir } = setupTest();
    try {
      // Provider responses churn like this: read (expiring on access), then set again.
      // cacheable <= 2.2 lost track of expired keys here and grew without bound.
      for (let round = 0; round < 4; round++) {
        for (let index = 0; index < 3000; index++) {
          const key = `provider:${(index * 7 + round * 13) % 5000}`;
          await service.cache.get(key);
          await service.cache.set(key, { body: 'x' }, 5);
        }
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      expect(memory.size).toBeLessThanOrEqual(500);
    } finally {
      await service.cache.disconnect();
      rmSync(dataDir, { recursive: true, force: true });
    }
  }, 30_000);
});
