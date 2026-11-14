import { describe, expect, it, jest } from 'bun:test';

import { type Engine, MediaLoadRuntime } from '../src/runtime';

const settings = (downloadLimit: string) => ({
  CONTENT_DOWNLOAD_LIMIT: downloadLimit,
  CONTENT_UPLOAD_LIMIT: '1MB',
  CONTENT_CONNECTION_LIMIT: '10',
  CONTENT_CONNECTION_BUDGET: '20',
  CONTENT_SEED_DURATION_SECONDS: '0',
  DISABLE_DISCOVERY: 'true',
  DOWNLOAD_PATH: '/tmp/media-load-runtime-test',
});

/** A runtime whose engine start is held until `finish` is called. */
const setupTest = () => {
  const runtime = new MediaLoadRuntime(':memory:');
  runtime.attach(Buffer.alloc(32, 7).toString('base64'));
  const throttleDownload = jest.fn();
  const engine = {
    downloads: { client: { throttleDownload }, rescheduleSeedExpiry: jest.fn() },
    storage: { reload: jest.fn(async () => undefined) },
  } as unknown as Engine;
  let finish!: (error?: Error) => void;
  const start = jest.fn(
    () =>
      new Promise<void>((resolve, reject) => {
        finish = error => {
          if (error) return reject(error);
          (runtime as unknown as { engine: Engine }).engine = engine;
          resolve();
        };
      })
  );
  (runtime as unknown as { start: typeof start }).start = start;
  return { runtime, start, throttleDownload, finish: (error?: Error) => finish(error) };
};

describe('MediaLoadRuntime', () => {
  it('starts the engine once for overlapping activations, then applies the later settings', async () => {
    const { runtime, start, throttleDownload, finish } = setupTest();
    const first = runtime.activate(settings('1MB'));
    const second = runtime.activate(settings('2MB'));
    await Bun.sleep(0);
    expect(start).toHaveBeenCalledTimes(1);
    finish();
    await expect(first).resolves.toEqual({ restartKeys: [] });
    await expect(second).resolves.toEqual({ restartKeys: [] });
    expect(throttleDownload).toHaveBeenCalledWith(2 * 1024 * 1024);
  });

  it('shares a failed start, and starts again on the next activation', async () => {
    const { runtime, start, finish } = setupTest();
    const first = runtime.activate(settings('1MB'));
    const second = runtime.activate(settings('2MB'));
    await Bun.sleep(0);
    const failures = Promise.allSettled([first, second]);
    finish(new Error('no disk'));
    const [one, two] = await failures;
    expect(one).toMatchObject({ status: 'rejected', reason: new Error('no disk') });
    expect(two).toMatchObject({ status: 'rejected', reason: new Error('no disk') });
    expect(start).toHaveBeenCalledTimes(1);
    const third = runtime.activate(settings('1MB'));
    await Bun.sleep(0);
    expect(start).toHaveBeenCalledTimes(2);
    finish();
    await third;
  });
});
