import { describe, expect, it, vi } from 'vitest';

import { ImagePipeline } from './imagePipeline';

/** Loads that resolve or fail when the test says. */
function controlledLoads() {
  const pending = new Map<
    string,
    { maxWidth: number; resolve: (bitmap: ImageBitmap) => void; reject: (error: unknown) => void }
  >();
  const order: string[] = [];
  const load = (src: string, maxWidth: number) =>
    new Promise<ImageBitmap>((resolve, reject) => {
      order.push(src);
      pending.set(src, { maxWidth, resolve, reject });
    });
  const bitmap = () => ({ close: vi.fn() }) as unknown as ImageBitmap;
  return { load, pending, order, bitmap };
}

const flush = () => new Promise(resolve => setTimeout(resolve));

function pipeline(concurrency = 2) {
  const loads = controlledLoads();
  const onLoaded = vi.fn();
  const onFailed = vi.fn();
  const images = new ImagePipeline({ concurrency, load: loads.load, onLoaded, onFailed });
  return { images, onLoaded, onFailed, ...loads };
}

describe('ImagePipeline', () => {
  it('loads a few at a time, visible ones first', async () => {
    const { images, order, pending, bitmap } = pipeline(1);

    images.request('a', 'near', () => 0);
    images.request('b', 'near', () => 0);
    images.request('c', 'visible', () => 0);
    expect(order).toEqual(['a']);

    pending.get('a')!.resolve(bitmap());
    await flush();
    expect(order).toEqual(['a', 'c']);
  });

  it('moves a queued image up when it becomes visible', async () => {
    const { images, order, pending, bitmap } = pipeline(1);
    images.request('a', 'near', () => 0);
    images.request('b', 'near', () => 0);
    images.request('c', 'near', () => 0);

    images.request('c', 'visible', () => 0);
    pending.get('a')!.resolve(bitmap());
    await flush();

    expect(order).toEqual(['a', 'c']);
  });

  it('reads the width it decodes to when the load starts', () => {
    const { images, pending } = pipeline(1);
    let width = 100;
    images.request('a', 'near', () => width);
    images.request('b', 'near', () => width);
    width = 300;

    expect(pending.get('a')!.maxWidth).toBe(100);
    images.cancel('a');
    expect(pending.get('b')).toBeUndefined();
  });

  it('hands over what loaded, and reports failures', async () => {
    const { images, pending, onLoaded, onFailed, bitmap } = pipeline();
    images.request('ok', 'near', () => 0);
    images.request('missing', 'near', () => 0);
    const loaded = bitmap();

    pending.get('ok')!.resolve(loaded);
    pending.get('missing')!.reject(new Error('404'));
    await flush();

    expect(onLoaded).toHaveBeenCalledWith('ok', loaded);
    expect(onFailed).toHaveBeenCalledWith('missing', new Error('404'));
    expect(images.active).toBe(0);
  });

  it('drops (and closes) what loads after it was cancelled or cleared', async () => {
    const { images, pending, onLoaded, onFailed, bitmap } = pipeline();
    images.request('a', 'near', () => 0);
    images.request('b', 'near', () => 0);
    const late = bitmap();

    images.cancel('a');
    images.clear();
    pending.get('a')!.resolve(late);
    pending.get('b')!.reject(new Error('gone'));
    await flush();

    expect(late.close).toHaveBeenCalled();
    expect(onLoaded).not.toHaveBeenCalled();
    expect(onFailed).not.toHaveBeenCalled();
  });

  it('does not load a cancelled request still in the queue', async () => {
    const { images, order, pending, bitmap } = pipeline(1);
    images.request('a', 'near', () => 0);
    images.request('b', 'near', () => 0);
    images.cancel('b');

    pending.get('a')!.resolve(bitmap());
    await flush();

    expect(order).toEqual(['a']);
    expect(images.has('b')).toBe(false);
  });
});
