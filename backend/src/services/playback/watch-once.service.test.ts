import type { StorageRemovalResult } from '@miauwatch/service-contracts';

import type { MediaLoadClientService } from '@services/media-load/media-load-client.service';

import type { AudioPlaybackService, ProbeResult } from './audio-playback.service';
import type { PlaybackTarget } from './playback-target';
import {
  WatchOnceRejectedError,
  WatchOnceService,
  type WatchOnceServiceOptions,
} from './watch-once.service';

const target = {
  source: { id: 7 },
  filePath: 'movie.mkv',
  matchKind: 'movie',
} as unknown as PlaybackTarget;

/** Fakes advance a virtual clock inside `sleep`, so no test waits on a real timer. */
const setup = (overrides: Partial<WatchOnceServiceOptions> = {}) => {
  let time = 0;
  const isFileComplete = jest.fn(async () => true);
  const removeStorageWithResult = jest.fn(
    async (): Promise<StorageRemovalResult> => ({ status: 'removed', bytes: 42 })
  );
  const probeFresh = jest.fn(
    async (): Promise<ProbeResult> => ({ streams: [{ codec_type: 'video' }] })
  );
  const probeFile = jest.fn(async (): Promise<ProbeResult> => ({ streams: [] }));
  const sleep = jest.fn(async (ms: number) => {
    time += ms;
  });
  const now = jest.fn(() => time);
  const service = new WatchOnceService({
    mediaLoad: { isFileComplete, removeStorageWithResult } as unknown as MediaLoadClientService,
    audio: { probeFresh, probeFile } as unknown as AudioPlaybackService,
    sleep,
    now,
    timeoutMs: 3_000,
    intervalMs: 1_000,
    maxReleaseRetries: 2,
    ...overrides,
  });
  return { service, isFileComplete, removeStorageWithResult, probeFresh, probeFile, sleep, now };
};

describe('WatchOnceService.verify', () => {
  it('rejects an executable target without polling or probing it', async () => {
    const { service, isFileComplete, probeFresh, sleep } = setup();

    await expect(service.verify({ ...target, filePath: 'movie.exe' })).rejects.toBeInstanceOf(
      WatchOnceRejectedError
    );
    expect(isFileComplete).not.toHaveBeenCalled();
    expect(probeFresh).not.toHaveBeenCalled();
    expect(sleep).not.toHaveBeenCalled();
  });

  it('rejects when the file stays incomplete past the timeout', async () => {
    const { service, isFileComplete, probeFresh, sleep } = setup();
    isFileComplete.mockResolvedValue(false);

    await expect(service.verify(target)).rejects.toBeInstanceOf(WatchOnceRejectedError);
    expect(isFileComplete).toHaveBeenCalledWith(7, 'movie.mkv');
    expect(isFileComplete).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledWith(1_000);
    expect(probeFresh).not.toHaveBeenCalled();
  });

  it('resolves once the file is complete and the probe finds real video', async () => {
    const { service, isFileComplete, probeFresh, sleep } = setup();

    await expect(service.verify(target)).resolves.toBeUndefined();
    expect(isFileComplete).toHaveBeenCalledWith(7, 'movie.mkv');
    expect(probeFresh).toHaveBeenCalledWith(target);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('gates on a fresh probe, ignoring a cached probe that finds no video', async () => {
    const { service, probeFresh, probeFile } = setup();
    probeFile.mockResolvedValue({ streams: [{ codec_type: 'audio' }] });

    await expect(service.verify(target)).resolves.toBeUndefined();

    expect(probeFresh).toHaveBeenCalledWith(target);
    expect(probeFile).not.toHaveBeenCalled();
  });

  it('rejects when the probe finds no video stream', async () => {
    const { service, probeFresh } = setup();
    probeFresh.mockResolvedValue({ streams: [{ codec_type: 'audio' }] });

    await expect(service.verify(target)).rejects.toBeInstanceOf(WatchOnceRejectedError);
    probeFresh.mockResolvedValue({});
    await expect(service.verify(target)).rejects.toBeInstanceOf(WatchOnceRejectedError);
  });
});

describe('WatchOnceService.release', () => {
  it('retries while playback is active and resolves once the storage is removed', async () => {
    const { service, removeStorageWithResult, sleep } = setup();
    removeStorageWithResult
      .mockResolvedValueOnce({ status: 'active_playback' })
      .mockResolvedValueOnce({ status: 'active_playback' })
      .mockResolvedValueOnce({ status: 'removed', bytes: 42 });

    await expect(service.release(7)).resolves.toEqual({ status: 'removed', bytes: 42 });
    expect(removeStorageWithResult).toHaveBeenCalledTimes(3);
    expect(removeStorageWithResult).toHaveBeenCalledWith(7);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(1_000);
  });

  it('gives up after the bounded retries and returns the last result', async () => {
    const { service, removeStorageWithResult, sleep } = setup();
    removeStorageWithResult.mockResolvedValue({ status: 'active_playback' });

    await expect(service.release(7)).resolves.toEqual({ status: 'active_playback' });
    expect(removeStorageWithResult).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('returns other removal outcomes immediately', async () => {
    const { service, removeStorageWithResult, sleep } = setup();
    removeStorageWithResult.mockResolvedValue({ status: 'cleanup_failed' });

    await expect(service.release(7)).resolves.toEqual({ status: 'cleanup_failed' });
    expect(removeStorageWithResult).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });
});
