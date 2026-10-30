import { type Contract, type MethodDef, methodName } from './define.js';
import { ContractError } from './errors.js';
import type { BytesRequestInit, Client, RequestOptions, SubscribeOptions } from './types.js';

/** What a typed client needs from a connection; implemented by the local and remote transports. */
export interface Transport {
  call(method: string, input: unknown, options?: RequestOptions): Promise<unknown>;
  stream(
    method: string,
    input: unknown,
    options?: { signal?: AbortSignal }
  ): AsyncIterable<unknown>;
  subscribe(
    method: string,
    listener: (payload: unknown) => void,
    options?: SubscribeOptions<unknown>
  ): () => void;
  bytesPath(method: string, input: unknown, ttlSeconds?: number): string;
  bytesUrl(method: string, input: unknown, ttlSeconds?: number): string;
  bytesOpen(method: string, input: unknown, init?: BytesRequestInit): Promise<Response>;
  /** Minor version the service implements for `name@major`; undefined while unknown. */
  minor?(name: string, major: number): number | undefined;
}

/** Minor version of `name@major` in a hello's `contracts` entry. */
export const implementedMinor = (
  contracts: Record<string, string[]> | undefined,
  name: string,
  major: number
): number | undefined => {
  const version = contracts?.[name]?.find(entry => entry.startsWith(`${major}.`));
  return version === undefined ? undefined : Number(version.slice(version.indexOf('.') + 1));
};

const unsupported = (contract: Contract, name: string, def: MethodDef) =>
  new ContractError(
    'unsupported',
    `${contract.name}.${name} needs ${contract.major}.${def.since}; the service is older`
  );

/** Builds the typed client for one contract over any transport. */
export const createClient = <C extends Contract>(contract: C, transport: Transport): Client<C> => {
  const client: Record<string, unknown> = {};
  for (const [name, def] of Object.entries(contract.methods)) {
    const method = methodName(contract, name);
    // Unknown (not connected yet) counts as supported: the call then fails as `unavailable`.
    const missing = (): boolean => {
      if (def.since === 0) return false;
      const minor = transport.minor?.(contract.name, contract.major);
      return minor !== undefined && minor < def.since;
    };
    switch (def.kind) {
      case 'call': {
        if (!def.dedupe) {
          client[name] = (input: unknown, options?: RequestOptions) =>
            missing()
              ? Promise.reject(unsupported(contract, name, def))
              : transport.call(method, input, options);
          break;
        }
        const inflight = new Map<string, Promise<unknown>>();
        client[name] = (input: unknown, options?: RequestOptions) => {
          if (missing()) return Promise.reject(unsupported(contract, name, def));
          // A caller-owned signal could cancel the request for everyone sharing it.
          if (options?.signal) return transport.call(method, input, options);
          const key = JSON.stringify(input ?? null);
          const existing = inflight.get(key);
          if (existing) return existing;
          const promise = transport
            .call(method, input, options)
            .finally(() => inflight.delete(key));
          inflight.set(key, promise);
          return promise;
        };
        break;
      }
      case 'stream':
        client[name] = (input: unknown, options?: { signal?: AbortSignal }) =>
          missing()
            ? (async function* () {
                throw unsupported(contract, name, def);
              })()
            : transport.stream(method, input, options);
        break;
      case 'event':
        client[name] = {
          on: (listener: (payload: unknown) => void, options?: SubscribeOptions<unknown>) =>
            transport.subscribe(method, listener, options),
        };
        break;
      case 'bytes':
        client[name] = {
          url: (input: unknown, options?: { ttlSeconds?: number }) =>
            transport.bytesUrl(method, input, options?.ttlSeconds),
          path: (input: unknown, options?: { ttlSeconds?: number }) =>
            transport.bytesPath(method, input, options?.ttlSeconds),
          open: (input: unknown, init?: BytesRequestInit) =>
            missing()
              ? Promise.reject(unsupported(contract, name, def))
              : transport.bytesOpen(method, input, init),
        };
        break;
    }
  }
  return Object.freeze(client) as Client<C>;
};

/** Combines a caller signal with a timeout; `cleanup` must run once the request settles. */
export const requestSignal = (
  signal: AbortSignal | undefined,
  timeoutMs: number | undefined
): { signal: AbortSignal; timedOut: () => boolean; cleanup: () => void } => {
  const controller = new AbortController();
  let timedOut = false;
  const timer =
    timeoutMs && timeoutMs > 0
      ? setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, timeoutMs)
      : undefined;
  const onAbort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener('abort', onAbort, { once: true });
  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    cleanup: () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    },
  };
};
