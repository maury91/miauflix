/**
 * Images fetched and decoded off the main thread, a few at a time, visible ones first. Knows
 * nothing about textures: what's loaded is handed to `onLoaded`, which owns it from then on.
 */

/** `visible`: drawn on screen now; `near`: within the prefetch margin. */
export type ImagePriority = 'visible' | 'near';

export interface ImagePipelineOptions {
  /** Fetches at once. */
  concurrency: number;
  /** `maxWidth`: the widest it's drawn (device px, 0 for any); larger images are scaled down. */
  load?: (src: string, maxWidth: number) => Promise<ImageBitmap>;
  onLoaded: (src: string, bitmap: ImageBitmap) => void;
  onFailed: (src: string, error: unknown) => void;
}

interface Request {
  src: string;
  /** Read when the image decodes: paints may draw it larger meanwhile. */
  maxWidth: () => number;
}

export class ImagePipeline {
  private queue: Request[] = [];
  private queued = new Map<string, Request>();
  /** In flight, by src: a result whose request is gone (cancelled, cleared) is dropped. */
  private inFlight = new Map<string, Request>();
  /** Loads still running, cancelled ones included: they hold their slot until they settle. */
  private loading = 0;
  private readonly load: (src: string, maxWidth: number) => Promise<ImageBitmap>;

  constructor(private readonly options: ImagePipelineOptions) {
    this.load = options.load ?? fetchBitmap;
  }

  /** Queued or in flight. */
  has(src: string) {
    return this.queued.has(src) || this.inFlight.has(src);
  }

  get active() {
    return this.loading;
  }

  get waiting() {
    return this.queue.length;
  }

  /** Asks for an image; visible ones go to the front. Asking again for a queued one can move it up. */
  request(src: string, priority: ImagePriority, maxWidth: () => number) {
    if (this.inFlight.has(src)) return;
    let request = this.queued.get(src);
    if (request) {
      if (priority !== 'visible') return;
      this.queue.splice(this.queue.indexOf(request), 1);
    } else {
      request = { src, maxWidth };
      this.queued.set(src, request);
    }
    if (priority === 'visible') this.queue.unshift(request);
    else this.queue.push(request);
    this.pump();
  }

  /** Forgets a request: not fetched if queued, its result dropped if in flight. */
  cancel(src: string) {
    const request = this.queued.get(src);
    if (request) {
      this.queued.delete(src);
      this.queue.splice(this.queue.indexOf(request), 1);
    }
    this.inFlight.delete(src);
  }

  /** Forgets every request (a context loss, disposal). */
  clear() {
    this.queue = [];
    this.queued.clear();
    this.inFlight.clear();
  }

  private pump() {
    while (this.loading < this.options.concurrency && this.queue.length) {
      const request = this.queue.shift()!;
      this.queued.delete(request.src);
      this.inFlight.set(request.src, request);
      this.loading++;
      const current = () => this.inFlight.get(request.src) === request;
      this.load(request.src, request.maxWidth())
        .then(
          bitmap => {
            if (!current()) {
              bitmap.close?.();
              return;
            }
            this.inFlight.delete(request.src);
            this.options.onLoaded(request.src, bitmap);
          },
          error => {
            if (!current()) return;
            this.inFlight.delete(request.src);
            this.options.onFailed(request.src, error);
          }
        )
        .finally(() => {
          this.loading--;
          this.pump();
        });
    }
  }
}

/** Fetched without credentials and decoded off the main thread, never larger than drawn. */
export async function fetchBitmap(src: string, maxWidth: number): Promise<ImageBitmap> {
  const response = await fetch(src, { mode: 'cors', credentials: 'omit' });
  if (!response.ok) throw new Error(String(response.status));
  const bitmap = await createImageBitmap(await response.blob());
  if (!maxWidth || bitmap.width <= maxWidth * 1.25) return bitmap;
  const scaled = await createImageBitmap(bitmap, {
    resizeWidth: maxWidth,
    resizeHeight: Math.round((bitmap.height * maxWidth) / bitmap.width),
    resizeQuality: 'medium',
  });
  bitmap.close?.();
  return scaled;
}
