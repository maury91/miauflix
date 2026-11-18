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
  /** Past the point of no return: it finishes even without callers, so later ones join it. */
  committed: boolean;
}

/**
 * Like SingleFlight, for cancellable work: concurrent callers of a key share one job, and the job's
 * signal aborts only once every caller that brought a signal has aborted (a caller without one
 * keeps it alive). A caller that aborts stops waiting at once. A job that called its `commit`
 * callback (its expensive part has started and will not stop) stays joinable without callers, so a
 * retry shares it instead of starting the same work twice.
 */
export class SharedJobs {
  private readonly jobs = new Map<string, SharedJob>();

  run<T>(
    key: string,
    operation: (signal: AbortSignal, commit: () => void) => Promise<T>,
    signal?: AbortSignal
  ): Promise<T> {
    signal?.throwIfAborted();
    let job = this.jobs.get(key);
    if (!job) {
      const controller = new AbortController();
      const created: SharedJob = {
        promise: Promise.resolve(),
        controller,
        callers: 0,
        committed: false,
      };
      created.promise = operation(controller.signal, () => {
        created.committed = true;
      }).finally(() => {
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
        if (shared.callers === 0 && !shared.committed) {
          // Nobody waits any more: later callers start afresh instead of joining a cancelled job
          if (this.jobs.get(key) === shared) this.jobs.delete(key);
          shared.controller.abort(signal.reason);
        }
        reject(signal.reason);
      };
      signal.addEventListener('abort', leave, { once: true });
      // The operation may have aborted the signal synchronously, before the listener existed
      if (signal.aborted) {
        signal.removeEventListener('abort', leave);
        leave();
        return;
      }
      (shared.promise as Promise<T>)
        .then(resolve, reject)
        .finally(() => signal.removeEventListener('abort', leave));
    });
  }
}
