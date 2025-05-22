import KeyvSqlite from '@keyv/sqlite';
import { createCache } from 'cache-manager';
import { CacheableMemory } from 'cacheable';
import Keyv from 'keyv';
import path from 'path';

import { ENV } from '@constants';

export const buildCache = () =>
  createCache({
    stores: [
      // Memory-based cache
      new Keyv({
        store: new CacheableMemory({
          lruSize: 500,
        }),
      }),

      // File-based cache
      new Keyv({
        store: new KeyvSqlite(`sqlite://${path.resolve(ENV('DATA_DIR'), 'cache.sqlite')}`),
      }),
    ],
  });
