import cache from './caching';

abstract class Class {}

export function Cacheable<
  This extends Class,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Args extends any[],
  Return,
>(
  ttlMs: number,
  reset = false,
  customCache: { get: typeof cache.get; set: typeof cache.set } = cache
) {
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
        const cached = await customCache.get<Return>(cacheKey).catch(() => null);
        if (cached && !reset) {
          return cached;
        }

        const result = await (originalMethod as typeof cacheMethod).apply(this, args);
        await customCache.set(cacheKey, result, ttlMs);

        return result;
      }

      descriptor.value = cacheMethod;
    }

    return descriptor;
  } as MethodDecorator;
}
