/**
 * Collapses concurrent identical asynchronous calls into one execution
 * (port of the backend's `@SingleFlight` decorator, as an explicit helper).
 */
export class SingleFlight {
  private readonly inflight = new Map<string, Promise<unknown>>();

  run<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const existing = this.inflight.get(key) as Promise<T> | undefined;
    if (existing) return existing;

    const promise = operation().finally(() => {
      this.inflight.delete(key);
    });
    this.inflight.set(key, promise);
    return promise;
  }
}

interface SharedJob {
  promise: Promise<unknown>;
  controller: AbortController;
  callers: number;
}

/**
 * Like SingleFlight, for cancellable work: concurrent callers of a key share one job, and the job's
 * signal aborts only once every caller that brought a signal has aborted (a caller without one
 * keeps it alive). A caller that aborts stops waiting at once.
 */
export class SharedJobs {
  private readonly jobs = new Map<string, SharedJob>();

  run<T>(
    key: string,
    operation: (signal: AbortSignal) => Promise<T>,
    signal?: AbortSignal
  ): Promise<T> {
    signal?.throwIfAborted();
    let job = this.jobs.get(key);
    if (!job) {
      const controller = new AbortController();
      const created: SharedJob = { promise: Promise.resolve(), controller, callers: 0 };
      created.promise = operation(controller.signal).finally(() => {
        if (this.jobs.get(key) === created) this.jobs.delete(key);
      });
      this.jobs.set(key, created);
      job = created;
    }
    const shared = job;
    shared.callers += 1;
    if (!signal) return shared.promise as Promise<T>;
    return new Promise<T>((resolve, reject) => {
      const leave = () => {
        shared.callers -= 1;
        if (shared.callers === 0) {
          // Nobody waits any more: later callers start afresh instead of joining a cancelled job
          if (this.jobs.get(key) === shared) this.jobs.delete(key);
          shared.controller.abort(signal.reason);
        }
        reject(signal.reason);
      };
      signal.addEventListener('abort', leave, { once: true });
      (shared.promise as Promise<T>)
        .then(resolve, reject)
        .finally(() => signal.removeEventListener('abort', leave));
    });
  }
}
