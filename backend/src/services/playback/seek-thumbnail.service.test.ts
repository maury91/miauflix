import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

import type { PlaybackTarget } from './playback-target';
import {
  seekThumbnailArgs,
  SeekThumbnailError,
  SeekThumbnailService,
} from './seek-thumbnail.service';

/** A fake FFmpeg: once spawned, writes `output` and exits with `code`, unless killed first. */
const fakeProcess = (output: Buffer | null, code = 0, delayMs = 0) => {
  const child = Object.assign(new EventEmitter(), {
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    exitCode: null as number | null,
    signalCode: null as string | null,
    kill: jest.fn(() => {
      if (child.exitCode !== null || child.signalCode !== null) return true;
      child.signalCode = 'SIGKILL';
      if (timer) clearTimeout(timer);
      queueMicrotask(() => child.emit('close', null));
      return true;
    }),
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const start = () => {
    timer = setTimeout(() => {
      if (output) child.stdout.write(output);
      child.exitCode = code;
      child.emit('close', code);
    }, delayMs);
    return child;
  };
  return Object.assign(child, { start });
};

/** How a request ended, without leaving a rejection unhandled meanwhile. */
const outcome = (request: Promise<unknown>) =>
  request.then(
    () => 'resolved',
    () => 'rejected'
  );

const setupTest = (maxProcesses: number, ...processes: ReturnType<typeof fakeProcess>[]) => {
  const mediaLoad = {
    streamFile: jest.fn().mockResolvedValue(new Response('bytes')),
  };
  const spawn = jest.fn();
  for (const process of processes) spawn.mockImplementationOnce(() => process.start());
  const service = new SeekThumbnailService(mediaLoad as never, spawn as never, 1_000, maxProcesses);
  const target = { source: { id: 4 }, filePath: 'movie.mkv' } as unknown as PlaybackTarget;
  return { service, spawn, target };
};

describe('SeekThumbnailService', () => {
  it('decodes only the keyframe at the requested moment into a small JPEG', () => {
    const args = seekThumbnailArgs('http://127.0.0.1:1/input', 120);
    expect(args.join(' ')).toContain('-threads 1 -skip_frame nokey -ss 120 -noaccurate_seek -i');
    expect(args.join(' ')).toContain('-frames:v 1');
    expect(args).toContain('mjpeg');
  });

  it('snaps requests to the grid and serves repeats from memory', async () => {
    const { service, spawn, target } = setupTest(3, fakeProcess(Buffer.from('jpeg')));

    const first = await service.thumbnail(target, 127.4, new AbortController().signal);
    const again = await service.thumbnail(target, 121, new AbortController().signal);

    expect(Buffer.from(first).toString()).toBe('jpeg');
    expect(again).toBe(first);
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(spawn.mock.calls[0][1]).toContain('120');
  });

  it('queues frames beyond the running limit and drops one given up on while queued', async () => {
    const { service, spawn, target } = setupTest(
      1,
      fakeProcess(Buffer.from('first'), 0, 50),
      fakeProcess(Buffer.from('third'))
    );
    const skipped = new AbortController();

    const first = service.thumbnail(target, 10, new AbortController().signal);
    const second = outcome(service.thumbnail(target, 20, skipped.signal));
    const third = service.thumbnail(target, 30, new AbortController().signal);
    await new Promise(resolve => setTimeout(resolve, 10));
    skipped.abort();

    expect(await second).toBe('rejected');
    expect(Buffer.from(await first).toString()).toBe('first');
    expect(Buffer.from(await third).toString()).toBe('third');
    expect(spawn).toHaveBeenCalledTimes(2);
    expect(spawn.mock.calls[1][1]).toContain('30');
  });

  it('shares a frame between requests and stops FFmpeg once all of them gave up', async () => {
    const slow = fakeProcess(Buffer.from('frame'), 0, 500);
    const { service, spawn, target } = setupTest(3, slow);
    const one = new AbortController();
    const two = new AbortController();

    const first = outcome(service.thumbnail(target, 40, one.signal));
    const second = outcome(service.thumbnail(target, 45, two.signal));
    await new Promise(resolve => setTimeout(resolve, 20));
    one.abort();
    expect(await first).toBe('rejected');
    expect(slow.kill).not.toHaveBeenCalled();
    two.abort();
    expect(await second).toBe('rejected');
    expect(spawn).toHaveBeenCalledTimes(1);
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(slow.kill).toHaveBeenCalled();
  });

  it('hands a freed slot to the queued request before a new caller can take it', async () => {
    let running = 0;
    let most = 0;
    const counted = (output: string) => {
      const process = fakeProcess(Buffer.from(output), 0, 30);
      const start = process.start;
      process.start = () => {
        running += 1;
        most = Math.max(most, running);
        process.once('close', () => (running -= 1));
        return start();
      };
      return process;
    };
    const { service, target } = setupTest(1, counted('first'), counted('queued'), counted('late'));

    const first = service.thumbnail(target, 10, new AbortController().signal);
    const queued = service.thumbnail(target, 20, new AbortController().signal);
    await first;
    // Arrives in the same turn the first one's slot is freed
    const late = service.thumbnail(target, 30, new AbortController().signal);
    await Promise.all([queued, late]);

    expect(most).toBe(1);
  });

  it('starts no FFmpeg for queued requests once closed', async () => {
    const { service, spawn, target } = setupTest(1, fakeProcess(Buffer.from('first'), 0, 200));

    const first = outcome(service.thumbnail(target, 10, new AbortController().signal));
    const queued = outcome(service.thumbnail(target, 20, new AbortController().signal));
    await new Promise(resolve => setTimeout(resolve, 20));
    service.close();

    expect(await queued).toBe('rejected');
    expect(await first).toBe('rejected');
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it('answers 404 past the last keyframe, where FFmpeg writes nothing', async () => {
    const { service, target } = setupTest(3, fakeProcess(null));

    const request = service.thumbnail(target, 9_000, new AbortController().signal);

    await expect(request).rejects.toBeInstanceOf(SeekThumbnailError);
    await expect(request).rejects.toMatchObject({ status: 404 });
  });

  it('gives up with 504 when the frame takes too long to download', async () => {
    const { service, target } = setupTest(3, fakeProcess(Buffer.from('late'), 0, 5_000));

    await expect(service.thumbnail(target, 30, new AbortController().signal)).rejects.toMatchObject(
      { status: 504 }
    );
  });
});
