/** Await a shared operation without transferring one caller's cancellation to its peers. */
export function withAbort<T>(promise: PromiseLike<T> | T, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener('abort', abort);
      reject(signal.reason);
    };
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(promise)
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', abort));
  });
}

/** Collapse identical asynchronous calls; cancel shared work only after its last caller leaves. */
export class SingleFlight {
  private readonly inflight = new Map<string, Promise<unknown>>();
  private readonly cancelable = new Map<
    string,
    {
      promise: Promise<unknown>;
      controller: AbortController;
      callers: number;
    }
  >();

  run<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const existing = this.inflight.get(key) as Promise<T> | undefined;
    if (existing) return existing;
    const promise = operation().finally(() => this.inflight.delete(key));
    this.inflight.set(key, promise);
    return promise;
  }

  runCancelable<T>(
    key: string,
    signal: AbortSignal,
    operation: (sharedSignal: AbortSignal) => Promise<T>
  ): Promise<T> {
    if (signal.aborted) return Promise.reject(signal.reason);
    let flight = this.cancelable.get(key);
    if (!flight) {
      const controller = new AbortController();
      const created = {
        controller,
        callers: 0,
        promise: Promise.resolve().then(() => operation(controller.signal)) as Promise<unknown>,
      };
      created.promise = created.promise.finally(() => {
        if (this.cancelable.get(key) === created) this.cancelable.delete(key);
      });
      this.cancelable.set(key, created);
      flight = created;
    }
    const active = flight;
    active.callers++;
    return withAbort(active.promise as Promise<T>, signal).finally(() => {
      active.callers--;
      if (!active.callers && this.cancelable.get(key) === active) {
        this.cancelable.delete(key);
        active.controller.abort();
      }
    });
  }
}
