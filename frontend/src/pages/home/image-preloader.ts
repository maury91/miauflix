export interface ImageSize {
  width: number;
  height: number;
}

/** Something on screen is waiting for this image: load it now, beyond the concurrency limit. */
export const URGENT = 0;
/** Likely to be shown next (the backdrops around the selected card). */
export const NEARBY = 1;

interface Job {
  url: string;
  priority: number;
  /** Batches that still want the image; a queued job nobody wants is dropped. */
  owners: Set<string>;
  /** Callers awaiting this exact image; their job is never dropped. */
  direct: number;
  state: 'queued' | 'loading';
  promise: Promise<ImageSize>;
  resolve: (size: ImageSize) => void;
  reject: (error: Error) => void;
}

interface ImagePreloaderOptions {
  /** Images loading at once, except urgent ones. */
  maxConcurrent?: number;
  /** A batch settles after this long even if some images are still loading (ms). */
  batchTimeoutMs?: number;
  /** Loaded images whose size is remembered, so a revisit resolves at once. */
  rememberLoaded?: number;
  /** Image constructor; looked up per load so tests can replace it. */
  createImage?: () => HTMLImageElement;
}

/**
 * One queue for every preloaded image: bounded concurrency, de-duplicated by URL, ordered by
 * priority, decoded before it reports ready, and sized. Batches belong to an owner (a row, a
 * page) and are replaced or cleared as a whole, so work that is no longer wanted stops queuing.
 */
export function createImagePreloader({
  maxConcurrent = 4,
  batchTimeoutMs = 2_500,
  rememberLoaded = 512,
  createImage = () => new Image(),
}: ImagePreloaderOptions = {}) {
  const jobs = new Map<string, Job>();
  const queue: Job[] = [];
  const owners = new Map<string, Set<string>>();
  const loaded = new Map<string, ImageSize>();
  let active = 0;

  const remember = (url: string, size: ImageSize) => {
    loaded.delete(url);
    loaded.set(url, size);
    if (loaded.size > rememberLoaded) loaded.delete(loaded.keys().next().value!);
  };

  const settle = (job: Job, outcome: ImageSize | Error) => {
    if (jobs.get(job.url) !== job) return;
    jobs.delete(job.url);
    active -= 1;
    if (outcome instanceof Error) job.reject(outcome);
    else {
      remember(job.url, outcome);
      job.resolve(outcome);
    }
    pump();
  };

  const start = (job: Job) => {
    job.state = 'loading';
    active += 1;
    const image = createImage();
    image.decoding = 'async';
    const succeed = () => settle(job, { width: image.naturalWidth, height: image.naturalHeight });
    const fail = () => settle(job, new Error('image_load_failed'));
    image.onload = () => {
      // Decode off the commit path; a decode failure of a loaded image still counts as loaded.
      if (typeof image.decode === 'function') void image.decode().then(succeed, succeed);
      else succeed();
    };
    image.onerror = fail;
    image.src = job.url;
  };

  function pump() {
    queue.sort((left, right) => left.priority - right.priority);
    while (queue.length && (active < maxConcurrent || queue[0]!.priority === URGENT)) {
      const job = queue.shift()!;
      if (jobs.get(job.url) === job) start(job);
    }
  }

  const ensureJob = (url: string, priority: number): Job => {
    const existing = jobs.get(url);
    if (existing) {
      if (priority < existing.priority) {
        existing.priority = priority;
        if (existing.state === 'queued') pump();
      }
      return existing;
    }
    let resolve!: (size: ImageSize) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<ImageSize>((onResolve, onReject) => {
      resolve = onResolve;
      reject = onReject;
    });
    // Batch callers settle on failure through their own handler; avoid unhandled rejections.
    promise.catch(() => undefined);
    const job: Job = {
      url,
      priority,
      owners: new Set(),
      direct: 0,
      state: 'queued',
      promise,
      resolve,
      reject,
    };
    jobs.set(url, job);
    queue.push(job);
    pump();
    return job;
  };

  const release = (owner: string, url: string) => {
    const job = jobs.get(url);
    if (!job) return;
    job.owners.delete(owner);
    if (job.state !== 'queued' || job.owners.size || job.direct) return;
    jobs.delete(url);
    queue.splice(queue.indexOf(job), 1);
    job.reject(new Error('image_load_cancelled'));
  };

  return {
    /**
     * Load and decode one image and report its natural size; rejects if it fails to load.
     * Already loaded images resolve at once.
     */
    load(url: string, priority = URGENT): Promise<ImageSize> {
      const known = loaded.get(url);
      if (known) {
        remember(url, known);
        return Promise.resolve(known);
      }
      const job = ensureJob(url, priority);
      job.direct += 1;
      const done = () => (job.direct -= 1);
      job.promise.then(done, done);
      return job.promise;
    },

    /**
     * Make `urls` this owner's wanted images, replacing its previous batch. Resolves when every
     * wanted image has loaded or failed, or after the batch timeout, whichever is first.
     */
    prepare(owner: string, urls: readonly string[], priority = NEARBY): Promise<void> {
      const wanted = new Set(urls.filter(Boolean));
      for (const url of owners.get(owner) ?? []) if (!wanted.has(url)) release(owner, url);
      owners.set(owner, wanted);
      const waits: Promise<unknown>[] = [];
      for (const url of wanted) {
        if (loaded.has(url)) continue;
        const job = ensureJob(url, priority);
        job.owners.add(owner);
        waits.push(job.promise.catch(() => undefined));
      }
      if (!waits.length) return Promise.resolve();
      return new Promise<void>(resolve => {
        const timer = setTimeout(resolve, batchTimeoutMs);
        void Promise.all(waits).then(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    },

    /** Forget an owner's batch; images only it wanted stop queuing (loading ones finish). */
    clear(owner: string): void {
      for (const url of owners.get(owner) ?? []) release(owner, url);
      owners.delete(owner);
    },

    /** For tests and diagnostics. */
    stats: () => ({ active, queued: queue.length, loaded: loaded.size }),
  };
}

export type ImagePreloader = ReturnType<typeof createImagePreloader>;

/** The app-wide queue Home's rows, hero and details share. */
export const imagePreloader = createImagePreloader();
