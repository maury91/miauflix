import { EventEmitter } from 'node:events';
import { renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:net';
import { PassThrough } from 'node:stream';

import { mpvThumbnailArgs } from './mpv-frame-worker';
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
  const service = new SeekThumbnailService(
    mediaLoad as never,
    spawn as never,
    1_000,
    maxProcesses,
    'ffmpeg'
  );
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

/**
 * A fake mpv, speaking mpv's IPC: shows `frame:<start>` once up and answers a `duration` query
 * with `duration`; for each seek it answers the command (its `request_id`), sends `seek` (after
 * `seekEventLagMs` for a moment in it), then 5 ms after the command (`slowSeekMs` for a moment in
 * it) writes the new frame (a temporary file renamed into place, as mpv's atomic writes do) and,
 * `restartLagMs` later, `playback-restart`. A moment in `sameFrameAt` writes nothing new (the
 * keyframe already shown); one in `stuckAt` never finishes (bytes that don't come).
 */
const fakeMpv = (
  options: {
    sameFrameAt?: number[];
    stuckAt?: number[];
    slowSeekMs?: Record<number, number>;
    seekEventLagMs?: Record<number, number>;
    restartLagMs?: Record<number, number>;
    duration?: number;
    failToOpen?: boolean;
    startDelayMs?: number;
    /** mpvs running, and the most at once, across the fakes sharing it. */
    live?: { running: number; peak: number };
  } = {}
) => {
  const seeks: number[] = [];
  let server: Server | undefined;
  const child = Object.assign(new EventEmitter(), {
    stderr: new PassThrough(),
    exitCode: null as number | null,
    signalCode: null as string | null,
    seeks,
    kill: jest.fn(() => {
      if (child.exitCode !== null || child.signalCode !== null) return true;
      child.signalCode = 'SIGKILL';
      server?.close();
      queueMicrotask(() => child.emit('exit', null));
      return true;
    }),
    /** mpv quits by itself (it crashed). */
    crash: () => child.kill(),
  });
  child.once('exit', () => {
    if (options.live) options.live.running -= 1;
  });
  const start = (args: string[]) => {
    if (options.live) {
      options.live.running += 1;
      options.live.peak = Math.max(options.live.peak, options.live.running);
    }
    const arg = (name: string) =>
      args.find(value => value.startsWith(`--${name}=`))!.slice(name.length + 3);
    const output = arg('o');
    const show = (seconds: number) => {
      if (child.signalCode !== null) return;
      writeFileSync(`${output}.tmp`, `frame:${seconds}`);
      renameSync(`${output}.tmp`, output);
    };
    queueMicrotask(() => child.emit('spawn'));
    if (options.failToOpen) {
      setTimeout(() => {
        child.exitCode = 2;
        child.emit('exit', 2);
      }, 5);
      return child;
    }
    server = createServer(connection => {
      const send = (message: object) => {
        if (!connection.destroyed) connection.write(`${JSON.stringify(message)}\n`);
      };
      let received = '';
      connection.on('data', chunk => {
        received += chunk.toString();
        for (let end = received.indexOf('\n'); end !== -1; end = received.indexOf('\n')) {
          const { command, request_id } = JSON.parse(received.slice(0, end)) as {
            command: [string, number];
            request_id?: number;
          };
          received = received.slice(end + 1);
          const data = command[0] === 'get_property' ? (options.duration ?? null) : null;
          send({ request_id, error: 'success', data });
          if (command[0] !== 'seek') continue;
          const seconds = command[1];
          seeks.push(seconds);
          const seekEventLag = options.seekEventLagMs?.[seconds];
          if (seekEventLag === undefined) send({ event: 'seek' });
          else setTimeout(() => send({ event: 'seek' }), seekEventLag);
          if (options.stuckAt?.includes(seconds)) continue;
          setTimeout(() => {
            if (!options.sameFrameAt?.includes(seconds)) show(seconds);
            setTimeout(
              () => send({ event: 'playback-restart' }),
              options.restartLagMs?.[seconds] ?? 0
            );
          }, options.slowSeekMs?.[seconds] ?? 5);
        }
      });
    });
    server.listen(arg('input-ipc-server'), () =>
      setTimeout(() => show(Number(arg('start'))), options.startDelayMs ?? 0)
    );
    return child;
  };
  return Object.assign(child, { start });
};

/** A spawn that is missing mpv, as on a machine without it installed. */
const missingMpv = () => {
  const child = Object.assign(new EventEmitter(), { stderr: new PassThrough() });
  queueMicrotask(() =>
    child.emit('error', Object.assign(new Error('spawn mpv ENOENT'), { code: 'ENOENT' }))
  );
  return child;
};

const setupMpv = (
  mpvs: Array<ReturnType<typeof fakeMpv> | 'missing'>,
  ffmpegs: ReturnType<typeof fakeProcess>[] = [],
  idleMs = 60_000,
  timeoutMs = 1_000
) => {
  const mediaLoad = { streamFile: jest.fn().mockResolvedValue(new Response('bytes')) };
  const spawn = jest.fn((command: string, args: string[]) => {
    if (command === 'mpv') {
      const next = mpvs.shift()!;
      return next === 'missing' ? missingMpv() : next.start(args);
    }
    return ffmpegs.shift()!.start();
  });
  const service = new SeekThumbnailService(
    mediaLoad as never,
    spawn as never,
    timeoutMs,
    3,
    'mpv',
    idleMs
  );
  const target = { source: { id: 7 }, filePath: 'movie.mp4' } as unknown as PlaybackTarget;
  const frame = async (seconds: number) =>
    Buffer.from(await service.thumbnail(target, seconds, new AbortController().signal)).toString();
  return { service, spawn, target, frame };
};

describe('SeekThumbnailService with mpv', () => {
  it('runs mpv paused, writing keyframe seeks as small JPEGs replaced atomically', () => {
    const args = mpvThumbnailArgs(
      'http://127.0.0.1:1/input',
      120,
      '/tmp/s',
      '/tmp/f.jpg',
      384,
      216
    );
    expect(args).toEqual(
      expect.arrayContaining([
        '--pause',
        '--hr-seek=no',
        '--no-audio',
        '--ovc=mjpeg',
        '--ofopts=update=1,atomic_writing=1',
        '--o=/tmp/f.jpg',
        '--input-ipc-server=/tmp/s',
        '--start=120',
        '--access-references=no',
      ])
    );
    // The input comes last, after `--`, so a URL can't be read as an option
    expect(args.slice(-2)).toEqual(['--', 'http://127.0.0.1:1/input']);
  });

  it('keeps one mpv open on the file and seeks it for each frame', async () => {
    const mpv = fakeMpv();
    const { service, spawn, frame } = setupMpv([mpv]);
    try {
      expect(await frame(125)).toBe('frame:120');
      expect(await frame(3_600)).toBe('frame:3600');
      expect(await frame(40)).toBe('frame:40');

      expect(spawn).toHaveBeenCalledTimes(1);
      expect(spawn.mock.calls[0][1]).toContain('--start=120');
      expect(mpv.seeks).toEqual([3_600, 40]);
    } finally {
      service.close();
    }
  });

  it('answers with the frame shown when a seek lands on the same keyframe', async () => {
    const mpv = fakeMpv({ sameFrameAt: [130] });
    const { service, frame } = setupMpv([mpv]);
    try {
      expect(await frame(120)).toBe('frame:120');
      expect(await frame(130)).toBe('frame:120');
    } finally {
      service.close();
    }
  });

  it('starts a fresh mpv when the open one died', async () => {
    const first = fakeMpv();
    const second = fakeMpv();
    const { service, spawn, frame } = setupMpv([first, second]);
    try {
      expect(await frame(10)).toBe('frame:10');
      first.crash();
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(await frame(20)).toBe('frame:20');
      expect(spawn).toHaveBeenCalledTimes(2);
      expect(spawn.mock.calls[1][1]).toContain('--start=20');
    } finally {
      service.close();
    }
  });

  it('closes an mpv left idle and starts another for the next frame', async () => {
    const first = fakeMpv();
    const second = fakeMpv();
    const { service, spawn, frame } = setupMpv([first, second], [], 30);
    try {
      await frame(10);
      await new Promise(resolve => setTimeout(resolve, 60));
      expect(first.kill).toHaveBeenCalled();

      expect(await frame(20)).toBe('frame:20');
      expect(spawn).toHaveBeenCalledTimes(2);
    } finally {
      service.close();
    }
  });

  it('fails the frame when mpv cannot open the file', async () => {
    const { service, target } = setupMpv([fakeMpv({ failToOpen: true })]);
    try {
      await expect(
        service.thumbnail(target, 10, new AbortController().signal)
      ).rejects.toBeInstanceOf(SeekThumbnailError);
    } finally {
      service.close();
    }
  });

  it('takes frames with FFmpeg runs when mpv is not installed', async () => {
    const { service, spawn, frame } = setupMpv(
      ['missing'],
      [fakeProcess(Buffer.from('ffmpeg:10')), fakeProcess(Buffer.from('ffmpeg:20'))]
    );
    try {
      expect(await frame(10)).toBe('ffmpeg:10');
      expect(await frame(20)).toBe('ffmpeg:20');
      // mpv is not tried again
      expect(spawn.mock.calls.map(([command]) => command)).toEqual(['mpv', 'ffmpeg', 'ffmpeg']);
    } finally {
      service.close();
    }
  });

  it('closes its mpvs when closed', async () => {
    const mpv = fakeMpv();
    const { service, frame } = setupMpv([mpv]);
    await frame(10);

    service.close();
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(mpv.kill).toHaveBeenCalled();
  });

  it('stops a start the last request gave up on, and starts afresh for the next', async () => {
    const slow = fakeMpv({ startDelayMs: 500 });
    const next = fakeMpv();
    const { service, spawn, target, frame } = setupMpv([slow, next]);
    try {
      const giveUp = new AbortController();
      const first = outcome(service.thumbnail(target, 10, giveUp.signal));
      await new Promise(resolve => setTimeout(resolve, 30));
      giveUp.abort();

      expect(await first).toBe('rejected');
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(slow.kill).toHaveBeenCalled();
      expect(await frame(20)).toBe('frame:20');
      expect(spawn.mock.calls[1][1]).toContain('--start=20');
    } finally {
      service.close();
    }
  });

  it('keeps a start going while another request still waits on it', async () => {
    const slow = fakeMpv({ startDelayMs: 100 });
    const { service, spawn, target, frame } = setupMpv([slow]);
    try {
      const giveUp = new AbortController();
      const first = outcome(service.thumbnail(target, 10, giveUp.signal));
      await new Promise(resolve => setTimeout(resolve, 10));
      const second = frame(20);
      giveUp.abort();

      expect(await first).toBe('rejected');
      expect(await second).toBe('frame:20');
      expect(slow.kill).not.toHaveBeenCalled();
      expect(spawn).toHaveBeenCalledTimes(1);
    } finally {
      service.close();
    }
  });

  it('waits for an mpv to go idle when three are busy, then replaces the oldest idle one', async () => {
    const live = { running: 0, peak: 0 };
    const mpvs = [0, 1, 2, 3].map(() => fakeMpv({ startDelayMs: 200, live }));
    const { service, spawn } = setupMpv([...mpvs]);
    try {
      const requests: Array<Promise<string>> = [];
      for (const id of [1, 2, 3, 4]) {
        const file = { source: { id }, filePath: 'movie.mp4' } as unknown as PlaybackTarget;
        requests.push(outcome(service.thumbnail(file, 10, new AbortController().signal)));
        // Each one is running, still starting, before the next comes
        await new Promise(resolve => setTimeout(resolve, 20));
      }

      // Three are busy starting: the fourth file waits instead of interrupting one
      expect(spawn).toHaveBeenCalledTimes(3);
      expect(await Promise.all(requests)).toEqual(['resolved', 'resolved', 'resolved', 'resolved']);
      expect(spawn).toHaveBeenCalledTimes(4);
      expect(live.peak).toBe(3);
      // The least recently used, idle by then, made room
      expect(mpvs[0].kill).toHaveBeenCalled();
      expect(mpvs.slice(1).every(mpv => !mpv.kill.mock.calls.length)).toBe(true);
    } finally {
      service.close();
    }
  });

  it("does not take an earlier seek's late report for the next seek's frame", async () => {
    // Seek 40's turn ends on its frame alone (its report comes 300 ms later): that report arrives
    // after seek 50 was sent, before seek 50 starts (its `seek` event, 100 ms in), and 400 ms
    // before seek 50's frame. Taken for seek 50's, it would answer with frame 40 after the grace.
    const mpv = fakeMpv({
      restartLagMs: { 40: 300 },
      seekEventLagMs: { 50: 100 },
      slowSeekMs: { 50: 500 },
    });
    const { service, frame } = setupMpv([mpv]);
    try {
      await frame(10);
      const [forty, fifty] = await Promise.all([frame(40), frame(50)]);

      expect(forty).toBe('frame:40');
      expect(fifty).toBe('frame:50');
    } finally {
      service.close();
    }
  });

  it("tries a queued frame on a fresh mpv when another frame's seek timed out", async () => {
    const stuck = fakeMpv({ stuckAt: [20] });
    const fresh = fakeMpv();
    const { service, spawn, target, frame } = setupMpv([stuck, fresh]);
    try {
      await frame(10);
      const timedOut = service.thumbnail(target, 20, new AbortController().signal);
      const queued = frame(40);

      await expect(timedOut).rejects.toMatchObject({ status: 504 });
      expect(await queued).toBe('frame:40');
      expect(spawn.mock.calls[1][1]).toContain('--start=40');
    } finally {
      service.close();
    }
  });

  it('moves the frames queued on an mpv that exited to one fresh mpv', async () => {
    const live = { running: 0, peak: 0 };
    const first = fakeMpv({ slowSeekMs: { 20: 300 }, live });
    const fresh = fakeMpv({ live });
    const { service, spawn, target, frame } = setupMpv([first, fresh]);
    try {
      await frame(10);
      const own = outcome(service.thumbnail(target, 20, new AbortController().signal));
      const queued = [frame(30), frame(40)];
      await new Promise(resolve => setTimeout(resolve, 50));
      first.crash();

      // The frame whose seek it was fails; the two waiting share one replacement
      expect(await own).toBe('rejected');
      expect(await Promise.all(queued)).toEqual(['frame:30', 'frame:40']);
      expect(spawn).toHaveBeenCalledTimes(2);
      expect(fresh.seeks).toEqual([40]);
      service.close();
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(live.running).toBe(0);
    } finally {
      service.close();
    }
  });

  it('stops mpv when a seek nobody waits for is stuck, and serves the queue on a fresh one', async () => {
    const stuck = fakeMpv({ stuckAt: [20] });
    const fresh = fakeMpv();
    // A frame's own timeout well past the watchdog's second: only the watchdog can free the queue
    const { service, spawn, target, frame } = setupMpv([stuck, fresh], [], 60_000, 10_000);
    try {
      await frame(10);
      const giveUp = new AbortController();
      const abandoned = outcome(service.thumbnail(target, 20, giveUp.signal));
      const queued = frame(30);
      await new Promise(resolve => setTimeout(resolve, 20));
      const abortedAt = performance.now();
      giveUp.abort();

      expect(await abandoned).toBe('rejected');
      expect(await queued).toBe('frame:30');
      expect(performance.now() - abortedAt).toBeLessThan(3_000);
      expect(stuck.kill).toHaveBeenCalled();
      expect(spawn).toHaveBeenCalledTimes(2);
    } finally {
      service.close();
    }
  });

  it('keeps mpv when a seek nobody waits for finishes quickly', async () => {
    const mpv = fakeMpv({ slowSeekMs: { 20: 50 } });
    const { service, spawn, target, frame } = setupMpv([mpv]);
    try {
      await frame(10);
      const giveUp = new AbortController();
      const abandoned = outcome(service.thumbnail(target, 20, giveUp.signal));
      await new Promise(resolve => setTimeout(resolve, 10));
      giveUp.abort();

      expect(await abandoned).toBe('rejected');
      expect(await frame(30)).toBe('frame:30');
      expect(mpv.kill).not.toHaveBeenCalled();
      expect(spawn).toHaveBeenCalledTimes(1);
    } finally {
      service.close();
    }
  });

  it('stops a start when every request waiting on it gives up in the same turn', async () => {
    const slow = fakeMpv({ startDelayMs: 500 });
    const { service, target } = setupMpv([slow]);
    try {
      const giveUp = new AbortController();
      const first = outcome(service.thumbnail(target, 10, giveUp.signal));
      await new Promise(resolve => setTimeout(resolve, 20));
      const second = outcome(service.thumbnail(target, 20, giveUp.signal));
      await new Promise(resolve => setTimeout(resolve, 5));
      giveUp.abort();

      expect(await Promise.all([first, second])).toEqual(['rejected', 'rejected']);
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(slow.kill).toHaveBeenCalled();
    } finally {
      service.close();
    }
  });

  it('answers 404 past the end of the file, without seeking', async () => {
    const mpv = fakeMpv({ duration: 95 });
    const { service, target, frame } = setupMpv([mpv]);
    try {
      expect(await frame(10)).toBe('frame:10');
      await expect(
        service.thumbnail(target, 100, new AbortController().signal)
      ).rejects.toMatchObject({ status: 404 });
      expect(mpv.seeks).toEqual([]);
      // mpv is kept for the next frame
      expect(await frame(90)).toBe('frame:90');
      expect(mpv.kill).not.toHaveBeenCalled();
    } finally {
      service.close();
    }
  });

  it('answers 404 past a known runtime without starting mpv', async () => {
    const { service, spawn, target } = setupMpv([fakeMpv()]);
    try {
      const known = { ...target, durationSeconds: 60 } as PlaybackTarget;
      await expect(
        service.thumbnail(known, 60, new AbortController().signal)
      ).rejects.toMatchObject({ status: 404 });
      expect(spawn).not.toHaveBeenCalled();
    } finally {
      service.close();
    }
  });

  it('fails a seek, never answering with an old file, when the frame shown is missing', async () => {
    const first = fakeMpv();
    const fresh = fakeMpv();
    const { service, spawn, target, frame } = setupMpv([first, fresh]);
    try {
      await frame(10);
      const output = (spawn.mock.calls[0][1] as string[])
        .find(arg => arg.startsWith('--o='))!
        .slice(4);
      unlinkSync(output);

      await expect(
        service.thumbnail(target, 20, new AbortController().signal)
      ).rejects.toMatchObject({ status: 503 });
      expect(first.seeks).toEqual([]);
      expect(await frame(30)).toBe('frame:30');
    } finally {
      service.close();
    }
  });

  it('does not close an mpv for being idle while it takes a frame', async () => {
    const mpv = fakeMpv({ slowSeekMs: { 20: 120 } });
    const { service, spawn, frame } = setupMpv([mpv], [], 40);
    try {
      await frame(10);
      expect(await frame(20)).toBe('frame:20');
      expect(spawn).toHaveBeenCalledTimes(1);
      expect(mpv.kill).not.toHaveBeenCalled();
      // Idle again afterwards: closed once the time passes
      await new Promise(resolve => setTimeout(resolve, 80));
      expect(mpv.kill).toHaveBeenCalled();
    } finally {
      service.close();
    }
  });
});
