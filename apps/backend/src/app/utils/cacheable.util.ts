import { Cache } from 'cache-manager';

abstract class ClassWithCache {
  cacheManager: Cache;
}

export function Cacheable<
  This extends ClassWithCache,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Args extends any[],
  Return
>(ttlMs: number, reset = false) {
  return function (
    target: This,
    _key: string | symbol,
    descriptor: TypedPropertyDescriptor<(...args: Args) => Promise<Return>>
  ) {
    const originalMethod = descriptor.value;

    async function cacheMethod(this: This, ...args: Args): Promise<Return> {
      const cacheKey = `cache.${this.constructor.name}.${
        originalMethod.name
      }.${JSON.stringify(args)}`;
      const cached = await this.cacheManager.get<Return>(cacheKey);
      if (cached && !reset) {
        return cached;
      }

      const result = await originalMethod.apply(this, args);
      await this.cacheManager.set(cacheKey, result, ttlMs);

      return result;
    }

    descriptor.value = cacheMethod;

    return descriptor;
  } as MethodDecorator;
}
