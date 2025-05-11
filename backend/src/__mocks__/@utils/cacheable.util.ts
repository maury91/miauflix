import { spyOn } from 'bun:test';

import * as cacheableUtil from '@utils/cacheable.util';

const originalCacheable = cacheableUtil.Cacheable;

spyOn(cacheableUtil, 'Cacheable').mockImplementation(
  (
    ttl: number,
    reset?: boolean,
    customCache?: {
      get: <T>(key: string) => Promise<T | null>;
      set: <T>(key: string, value: T, ttl?: number) => Promise<T>;
    }
  ): MethodDecorator => {
    const originalInstance = originalCacheable(ttl, reset, customCache);

    return (target, _key, descriptor) => {
      // Disable mocking for TestClass ( used in testing cacheable.util)
      if (target.constructor.name === 'TestClass') {
        return originalInstance(target, _key, descriptor);
      }
      return descriptor;
    };
  }
);
