import { implementedMinor, requestSignal, type Transport } from './client.js';
import { ContractError, isContractError } from './errors.js';
import { type ServiceStatus, STATUS_CHANGED } from './management.js';
import type { Service } from './service.js';
import { signedBytesPath } from './tickets.js';

export interface LocalTransportOptions {
  /** Origin where the host serves `service.fetch` (needed only for `bytes` URLs). */
  bytesBaseUrl?: string;
  /** Key for `bytes` URLs; a random one is generated when omitted. */
  ticketKey?: string;
}

/**
 * In-process transport: calls the implementation directly. Nothing is serialized or copied, so
 * inputs and outputs must be treated as immutable by both sides.
 */
export const localTransport = (
  service: Service,
  options: LocalTransportOptions = {}
): Transport => {
  if (options.ticketKey) service.setTicketKey(options.ticketKey);
  const ticketKey = service.ensureTicketKey();
  // Same failure semantics as the remote transport: anything unexpected becomes `internal`.
  const normalize = (method: string, error: unknown): never => {
    if (error instanceof ContractError) throw error;
    const { code, message } = service.wireError(method, error);
    throw Object.assign(new ContractError(code, message), { cause: error });
  };

  return {
    async call(method, input, requestOptions) {
      // An abort listener added below would never fire for a signal aborted before the call.
      if (requestOptions?.signal?.aborted) throw new ContractError('cancelled', 'Request aborted');
      const request = requestSignal(requestOptions?.signal, requestOptions?.timeoutMs);
      try {
        const result = service.invoke(method, input, request.signal);
        if (!requestOptions?.signal && !requestOptions?.timeoutMs) return await result;
        return await Promise.race([
          result,
          new Promise<never>((_, reject) =>
            request.signal.addEventListener(
              'abort',
              () =>
                reject(
                  new ContractError(request.timedOut() ? 'timeout' : 'cancelled', 'Request aborted')
                ),
              { once: true }
            )
          ),
        ]);
      } catch (error) {
        return normalize(method, error);
      } finally {
        request.cleanup();
      }
    },

    stream(method, input, streamOptions) {
      return (async function* () {
        if (streamOptions?.signal?.aborted)
          throw new ContractError('cancelled', 'Stream cancelled');
        const controller = new AbortController();
        const onAbort = () => controller.abort();
        streamOptions?.signal?.addEventListener('abort', onAbort, { once: true });
        try {
          for await (const item of service.openStream(method, input, controller.signal)) {
            if (controller.signal.aborted) throw new ContractError('cancelled', 'Stream cancelled');
            yield item;
          }
        } catch (error) {
          normalize(method, error);
        } finally {
          controller.abort();
          streamOptions?.signal?.removeEventListener('abort', onAbort);
        }
      })();
    },

    subscribe(method, listener, subscribeOptions) {
      let unsubscribe: (() => void) | null = null;
      let attachedBefore = false;
      let closed = false;
      const attach = () => {
        if (closed || unsubscribe) return;
        try {
          unsubscribe = service.subscribe(method, subscribeOptions?.filter, listener);
        } catch (error) {
          if (isContractError(error, 'not_configured')) return; // retried once the service is ready
          throw error;
        }
        if (attachedBefore) subscribeOptions?.onResync?.();
        attachedBefore = true;
      };
      // Follow readiness: detach when the service leaves `ready`, re-attach when it returns.
      const stopStatus = method.startsWith('$@')
        ? () => undefined
        : service.subscribe(STATUS_CHANGED, undefined, payload => {
            const ready = (payload as ServiceStatus).state === 'ready';
            if (ready) attach();
            else if (unsubscribe) {
              unsubscribe();
              unsubscribe = null;
            }
          });
      attach();
      // Whether or not it attached now, any later attach follows a gap the caller must resync.
      attachedBefore = true;
      return () => {
        closed = true;
        stopStatus();
        unsubscribe?.();
        unsubscribe = null;
      };
    },

    bytesPath(method, input, ttlSeconds) {
      return signedBytesPath(ticketKey, method, input, ttlSeconds);
    },

    bytesUrl(method, input, ttlSeconds) {
      if (!options.bytesBaseUrl)
        throw new Error(`${service.info.name}: bytes URLs need a bytesBaseUrl in local mode`);
      return new URL(this.bytesPath(method, input, ttlSeconds), options.bytesBaseUrl).href;
    },

    async bytesOpen(method, input, init) {
      try {
        return await service.openBytes(
          method,
          input,
          new Headers(init?.headers),
          init?.signal ?? new AbortController().signal
        );
      } catch (error) {
        return normalize(method, error);
      }
    },

    minor: (name, major) => implementedMinor(service.hello.contracts, name, major),
  };
};
