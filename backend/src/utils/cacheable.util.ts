import { logger } from '@logger';

import type { Api } from './api.util';

export function Cacheable<
  This extends Api,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Args extends any[],
  Return,
>(ttlMs: number, reset = false) {
  return function (
    target: This,
    _key: string | symbol,
    descriptor: TypedPropertyDescriptor<(...args: Args) => Promise<Return>>
  ) {
    const originalMethod = descriptor.value;

    if (typeof originalMethod === 'function') {
      async function cacheMethod(this: This, ...args: Args): Promise<Return> {
        const cacheKey = `cache.${target.constructor.name}.${
          (originalMethod as typeof cacheMethod).name
        }.${JSON.stringify(args)}`;
        const cached = await this.cache.get<Return>(cacheKey).catch(() => null);
        if (cached && !reset) {
          logger.debug('Cache', `Cache hit for ${cacheKey}`);
          return cached;
        }

        logger.debug('Cache', `Cache miss for ${cacheKey}`);
        const result = await (originalMethod as typeof cacheMethod).apply(this, args);
        logger.debug('Cache', `Setting cache for ${cacheKey}`);
        await this.cache.set(cacheKey, result, ttlMs);

        return result;
      }

      descriptor.value = cacheMethod;
    }

    return descriptor;
  } as MethodDecorator;
}

export type CachedMethod<T> = T & {
  bypassCache: T;
};

export type WithCache<T, M extends keyof T> = {
  [K in keyof T]: K extends M
    ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
      T[K] extends (...args: any[]) => any
      ? CachedMethod<T[K]>
      : T[K]
    : T[K];
};

export type ClassWithCache<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  T extends new (...args: any[]) => any,
  M extends keyof InstanceType<T> = keyof InstanceType<T>,
> = new (...args: ConstructorParameters<T>) => WithCache<InstanceType<T>, M>;
