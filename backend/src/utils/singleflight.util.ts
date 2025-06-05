/**
 * SingleFlight decorator: ensures only one concurrent execution per key.
 * Usage:
 *   @SingleFlight // uses default key: method name + JSON.stringify(args)
 *   @SingleFlight((...args) => args[0]) // custom key function
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function SingleFlight<This, Args extends any[], Return>(
  keyFn?: (...args: Args) => number | string
) {
  return function (
    target: This,
    propertyKey: string | symbol,
    descriptor: TypedPropertyDescriptor<(...args: Args) => Promise<Return>>
  ) {
    const originalMethod = descriptor.value;
    const inFlight = new Map<number | string, Promise<Return>>();

    if (typeof originalMethod === 'function') {
      descriptor.value = async function (this: This, ...args: Args): Promise<Return> {
        const key = keyFn ? keyFn(...args) : `${String(propertyKey)}:${JSON.stringify(args)}`;

        if (inFlight.has(key)) {
          return inFlight.get(key)!;
        }
        const p = (async () => {
          try {
            return await originalMethod.apply(this, args);
          } finally {
            inFlight.delete(key);
          }
        })();
        inFlight.set(key, p);
        return p;
      };
    }
    return descriptor;
  };
}
