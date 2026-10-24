import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createImagePreloader, NEARBY, URGENT } from './image-preloader';

/** An image whose loading the test controls. */
class FakeImage {
  static all: FakeImage[] = [];
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  decoding = '';
  naturalWidth = 0;
  naturalHeight = 0;
  decoded = false;
  src = '';
  constructor() {
    FakeImage.all.push(this);
  }
  decode() {
    this.decoded = true;
    return Promise.resolve();
  }
  finish(width = 1280, height = 720) {
    this.naturalWidth = width;
    this.naturalHeight = height;
    this.onload?.();
  }
  fail() {
    this.onerror?.();
  }
}

const started = () => FakeImage.all.map(image => image.src);
const image = (url: string) => FakeImage.all.find(item => item.src === url)!;
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe('image preloader', () => {
  const setup = (options: Parameters<typeof createImagePreloader>[0] = {}) =>
    createImagePreloader({ createImage: () => new FakeImage() as never, ...options });

  beforeEach(() => {
    FakeImage.all = [];
  });
  afterEach(() => vi.useRealTimers());

  it('decodes before reporting the size, and remembers loaded images', async () => {
    const preloader = setup();
    const loading = preloader.load('/a.jpg');
    expect(image('/a.jpg').decoding).toBe('async');
    image('/a.jpg').finish(1920, 1080);
    await expect(loading).resolves.toEqual({ width: 1920, height: 1080 });
    expect(image('/a.jpg').decoded).toBe(true);

    await expect(preloader.load('/a.jpg')).resolves.toEqual({ width: 1920, height: 1080 });
    expect(started()).toEqual(['/a.jpg']);
  });

  it('rejects a failed load and lets a later request try again', async () => {
    const preloader = setup();
    const first = preloader.load('/broken.jpg');
    image('/broken.jpg').fail();
    await expect(first).rejects.toThrow('image_load_failed');
    void preloader.load('/broken.jpg').catch(() => undefined);
    expect(started()).toEqual(['/broken.jpg', '/broken.jpg']);
  });

  it('loads each URL once however many owners want it', async () => {
    const preloader = setup();
    void preloader.prepare('row-1', ['/a.jpg', '/b.jpg']);
    void preloader.prepare('row-2', ['/b.jpg', '/c.jpg']);
    void preloader.load('/a.jpg');
    expect(started()).toEqual(['/a.jpg', '/b.jpg', '/c.jpg']);
  });

  it('limits concurrent loads, starts urgent ones at once, and serves the most urgent first', async () => {
    const preloader = setup({ maxConcurrent: 2 });
    void preloader.prepare('row', ['/1.jpg', '/2.jpg', '/3.jpg', '/4.jpg'], NEARBY);
    expect(started()).toEqual(['/1.jpg', '/2.jpg']);

    void preloader.load('/hero.jpg', URGENT);
    expect(started()).toEqual(['/1.jpg', '/2.jpg', '/hero.jpg']);

    // Urgent loads skip the queue but still use bandwidth: they count toward the limit.
    void preloader.prepare('later', ['/later.jpg'], 5);
    image('/1.jpg').finish();
    await flush();
    expect(started()).toHaveLength(3);
    image('/2.jpg').finish();
    await flush();
    expect(started()).toEqual(['/1.jpg', '/2.jpg', '/hero.jpg', '/3.jpg']);
    image('/hero.jpg').finish();
    await flush();
    expect(started()).toEqual(['/1.jpg', '/2.jpg', '/hero.jpg', '/3.jpg', '/4.jpg']);
  });

  it('drops queued images an owner no longer wants, but finishes ones already loading', async () => {
    const preloader = setup({ maxConcurrent: 1 });
    void preloader.prepare('row', ['/1.jpg', '/2.jpg', '/3.jpg']);
    void preloader.prepare('row', ['/1.jpg', '/4.jpg']);
    image('/1.jpg').finish();
    await flush();
    expect(started()).toEqual(['/1.jpg', '/4.jpg']);

    void preloader.prepare('row', ['/5.jpg']);
    preloader.clear('row');
    image('/4.jpg').finish();
    await flush();
    expect(started()).toEqual(['/1.jpg', '/4.jpg']);
    expect(preloader.stats()).toEqual({ active: 0, queued: 0, loaded: 2 });
  });

  it('keeps an image another owner or a direct caller still wants', async () => {
    const preloader = setup({ maxConcurrent: 1 });
    void preloader.prepare('blocker', ['/busy.jpg']);
    void preloader.prepare('row-1', ['/shared.jpg']);
    void preloader.prepare('row-2', ['/shared.jpg']);
    const direct = preloader.load('/direct.jpg', NEARBY);
    void preloader.prepare('row-3', ['/direct.jpg']);
    preloader.clear('row-1');
    preloader.clear('row-3');
    image('/busy.jpg').finish();
    await flush();
    image('/shared.jpg').finish();
    await flush();
    image('/direct.jpg').finish(10, 20);
    await expect(direct).resolves.toEqual({ width: 10, height: 20 });
  });

  it('settles a batch when every image has loaded or failed', async () => {
    const preloader = setup();
    let settled = false;
    void preloader.prepare('row', ['/ok.jpg', '/bad.jpg']).then(() => (settled = true));
    image('/ok.jpg').finish();
    await flush();
    expect(settled).toBe(false);
    image('/bad.jpg').fail();
    await flush();
    expect(settled).toBe(true);
    await expect(preloader.prepare('row', ['/ok.jpg'])).resolves.toBeUndefined();
  });

  it('settles a slow batch after the timeout without marking the image loaded', async () => {
    vi.useFakeTimers();
    const preloader = setup({ batchTimeoutMs: 2_500 });
    let settled = false;
    void preloader.prepare('row', ['/slow.jpg']).then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(2_499);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBe(true);
    expect(preloader.stats()).toMatchObject({ active: 1, loaded: 0 });
  });

  it('forgets the oldest loaded images beyond its memory', async () => {
    const preloader = setup({ rememberLoaded: 2 });
    for (const url of ['/1.jpg', '/2.jpg', '/3.jpg']) {
      const loading = preloader.load(url);
      image(url).finish();
      await loading;
    }
    void preloader.load('/1.jpg');
    expect(started().filter(url => url === '/1.jpg')).toHaveLength(2);
  });
});
