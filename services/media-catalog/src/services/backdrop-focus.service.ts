import type { BackdropFocus } from '@miauflix/service-contracts';
import sharp, { type Sharp } from 'sharp';
import smartcrop from 'smartcrop';

import {
  BACKDROP_FOCUS_ALGORITHM_VERSION,
  type BackdropFocusKey,
  BackdropFocusRepository,
} from '../db/backdrop-focus.repo';
import type { ProviderBackdropSource } from '../provider/provider';
import { type BackdropFaceFocusDetector, detectBackdropSubjectFocus } from './backdrop-face-focus';

const DOWNLOAD_TIMEOUT_MS = 15_000;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const DEFAULT_BACKDROP_FOCUS_CONCURRENCY = 2;

type BackgroundPriority = 'displayed' | 'database';

interface QueuedTask {
  key: string;
  run: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
}

/**
 * Two logical queues share one concurrency budget. Immediate work always drains
 * before background work; displayed-list work drains before the database sweep.
 */
class BackdropFocusScheduler {
  private active = 0;
  private readonly immediate: QueuedTask[] = [];
  private readonly backgroundDisplayed: QueuedTask[] = [];
  private readonly backgroundDatabase: QueuedTask[] = [];

  constructor(private readonly concurrency: number) {}

  addImmediate<T>(key: string, run: () => Promise<T>): Promise<T> {
    return this.add(this.immediate, key, run);
  }

  addBackground<T>(key: string, priority: BackgroundPriority, run: () => Promise<T>): Promise<T> {
    return this.add(
      priority === 'displayed' ? this.backgroundDisplayed : this.backgroundDatabase,
      key,
      run
    );
  }

  promote(key: string): boolean {
    const index = this.backgroundDisplayed.findIndex(task => task.key === key);
    if (index >= 0) {
      const [task] = this.backgroundDisplayed.splice(index, 1);
      if (task) this.immediate.push(task);
      this.drain();
      return true;
    }
    const databaseIndex = this.backgroundDatabase.findIndex(task => task.key === key);
    if (databaseIndex < 0) return false;
    const [task] = this.backgroundDatabase.splice(databaseIndex, 1);
    if (task) this.immediate.push(task);
    this.drain();
    return true;
  }

  private add<T>(queue: QueuedTask[], key: string, run: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      queue.push({
        key,
        run: async () => run(),
        resolve: value => resolve(value as T),
        reject,
      });
      this.drain();
    });
  }

  private drain(): void {
    while (this.active < this.concurrency) {
      const task =
        this.immediate.shift() ??
        this.backgroundDisplayed.shift() ??
        this.backgroundDatabase.shift();
      if (!task) return;
      this.active++;
      void Promise.resolve()
        .then(task.run)
        .then(task.resolve, task.reject)
        .finally(() => {
          this.active--;
          this.drain();
        });
    }
  }
}

interface SharpImage {
  width: number;
  height: number;
  _sharp: Sharp;
}

interface SmartcropRuntime {
  crop(
    image: unknown,
    options: unknown
  ): Promise<{ topCrop: { x: number; y: number; width: number; height: number } }>;
  ImgData: new (width: number, height: number, data: Buffer) => unknown;
}

const smartcropRuntime = smartcrop as unknown as SmartcropRuntime;

export class BackdropFocusService {
  private readonly inflight = new Map<string, Promise<BackdropFocus>>();
  private readonly computationQueue: BackdropFocusScheduler;

  constructor(
    private readonly repository: BackdropFocusRepository,
    private readonly detectFaceFocus: BackdropFaceFocusDetector = detectBackdropSubjectFocus,
    concurrency = DEFAULT_BACKDROP_FOCUS_CONCURRENCY
  ) {
    const normalizedConcurrency = Number.isFinite(concurrency)
      ? Math.max(1, Math.floor(concurrency))
      : DEFAULT_BACKDROP_FOCUS_CONCURRENCY;
    this.computationQueue = new BackdropFocusScheduler(normalizedConcurrency);
  }

  /**
   * Returns cached focus or analyzes and persists it, sharing concurrent work for the same
   * provider, image key, and algorithm version. Coordinates are normalized to [0, 1].
   * Detector failures or no accepted subjects fall back to a square smartcrop analysis.
   * Rejects with backdrop_focus_temporarily_unavailable during the failure retry delay;
   * download, image analysis, and database errors otherwise propagate.
   */
  async ensure(source: ProviderBackdropSource, provider: string): Promise<BackdropFocus> {
    const key: BackdropFocusKey = { provider, imageKey: source.key };
    const cached = this.repository.get(key);
    if (cached) return cached;
    if (!this.repository.shouldRetry(key))
      throw new Error('backdrop_focus_temporarily_unavailable');

    const inflightKey = `${provider}:${source.key}:${BACKDROP_FOCUS_ALGORITHM_VERSION}`;
    const existing = this.inflight.get(inflightKey);
    if (existing) {
      this.computationQueue.promote(inflightKey);
      return existing;
    }
    const promise = this.schedule(inflightKey, key, source, 'immediate');
    return promise;
  }

  /** Enqueues preemptive work without making the caller wait for model analysis. */
  enqueueBackground(
    source: ProviderBackdropSource,
    provider: string,
    priority: BackgroundPriority
  ): boolean {
    const key: BackdropFocusKey = { provider, imageKey: source.key };
    const inflightKey = this.inflightKey(key);
    if (this.repository.get(key) || !this.repository.shouldRetry(key)) return false;
    if (this.inflight.has(inflightKey)) return false;
    const promise = this.schedule(inflightKey, key, source, priority);
    void promise.catch(() => undefined);
    return true;
  }

  private schedule(
    inflightKey: string,
    key: BackdropFocusKey,
    source: ProviderBackdropSource,
    priority: 'immediate' | BackgroundPriority
  ): Promise<BackdropFocus> {
    const promise = (
      priority === 'immediate'
        ? this.computationQueue.addImmediate(inflightKey, () => this.compute(source, key))
        : this.computationQueue.addBackground(inflightKey, priority, () =>
            this.compute(source, key)
          )
    ).finally(() => this.inflight.delete(inflightKey));
    this.inflight.set(inflightKey, promise);
    return promise;
  }

  private inflightKey(key: BackdropFocusKey): string {
    return `${key.provider}:${key.imageKey}:${BACKDROP_FOCUS_ALGORITHM_VERSION}`;
  }

  /**
   * Downloads and analyzes a backdrop, saving valid focus or recording a failure for retry.
   * Rejects missing dimensions or invalid focus and propagates download and analysis errors.
   * A database error while recording failure can replace the original error.
   */
  private async compute(
    source: ProviderBackdropSource,
    key: BackdropFocusKey
  ): Promise<BackdropFocus> {
    try {
      const response = await this.download(source.url);
      const image = sharp(response);
      const metadata = await image.metadata();
      if (!metadata.width || !metadata.height) throw new Error('image_dimensions_missing');

      const detectedFocus = await this.detectFaceFocus(response).catch(() => null);
      const focus =
        detectedFocus ??
        (await this.computeSmartcrop(response, image, {
          width: metadata.width,
          height: metadata.height,
        }));
      if (
        !Number.isFinite(focus.x) ||
        !Number.isFinite(focus.y) ||
        focus.x < 0 ||
        focus.x > 1 ||
        focus.y < 0 ||
        focus.y > 1
      )
        throw new Error('focus_out_of_range');
      this.repository.saveSuccess(key, focus);
      return focus;
    } catch (error) {
      const code = error instanceof Error ? error.message.slice(0, 80) : 'analysis_failed';
      this.repository.saveFailure(key, code);
      throw error;
    }
  }

  /**
   * Returns the preferred square crop's center, normalized by the source dimensions in pixels.
   * Image processing and crop analysis errors propagate.
   */
  private async computeSmartcrop(
    response: Buffer,
    image: Sharp,
    metadata: { width: number; height: number }
  ): Promise<BackdropFocus> {
    const result = await smartcropRuntime.crop(response, {
      width: 100,
      height: 100,
      imageOperations: {
        async open() {
          return { width: metadata.width, height: metadata.height, _sharp: image };
        },
        resample(image: SharpImage, width: number, height: number): Promise<SharpImage> {
          return Promise.resolve({
            width: Math.trunc(width),
            height: Math.trunc(height),
            _sharp: image._sharp,
          });
        },
        async getData(image: SharpImage): Promise<unknown> {
          const data = await image._sharp
            .resize(image.width, image.height, { kernel: sharp.kernel.cubic })
            .ensureAlpha(1)
            .toColourspace('srgb')
            .raw()
            .toBuffer();
          return new smartcropRuntime.ImgData(image.width, image.height, data);
        },
      },
    });
    const crop = result.topCrop;
    return {
      x: (crop.x + crop.width / 2) / metadata.width,
      y: (crop.y + crop.height / 2) / metadata.height,
    } satisfies BackdropFocus;
  }

  /**
   * Downloads at most 8 MiB of JPEG, PNG, or WebP bytes with a 15-second timeout and no redirects.
   * Rejects unsuccessful HTTP responses, unsupported content types, missing bodies, and oversized
   * images. Aborted downloads reject with image_download_timeout; other fetch/read errors propagate.
   */
  private async download(url: string): Promise<Buffer> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
    try {
      const response = await fetch(url, { redirect: 'error', signal: controller.signal });
      if (!response.ok) throw new Error(`image_http_${response.status}`);
      const contentType = response.headers.get('content-type')?.split(';', 1)[0] ?? '';
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(contentType))
        throw new Error('image_content_type_invalid');
      const length = Number(response.headers.get('content-length'));
      if (Number.isFinite(length) && length > MAX_IMAGE_BYTES) throw new Error('image_too_large');
      if (!response.body) throw new Error('image_body_missing');
      const reader = response.body.getReader();
      const chunks: Buffer[] = [];
      let total = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_IMAGE_BYTES) {
          await reader.cancel();
          throw new Error('image_too_large');
        }
        chunks.push(Buffer.from(value));
      }
      return Buffer.concat(chunks, total);
    } catch (error) {
      if (controller.signal.aborted) throw new Error('image_download_timeout');
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
