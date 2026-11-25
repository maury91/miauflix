import type { ChildProcess, spawn as spawnProcess } from 'node:child_process';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { connect, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { collectStderr } from './stderr-tail';

/** mpv could not be started at all (not installed): the caller takes frames another way. */
export class MpvUnavailableError extends Error {
  constructor() {
    super('mpv is not installed');
    this.name = 'MpvUnavailableError';
  }
}

/** A frame mpv did not deliver: it stopped, failed to open the file or took too long. */
export class MpvFrameError extends Error {
  constructor(
    message: string,
    readonly timedOut = false
  ) {
    super(message);
    this.name = 'MpvFrameError';
  }
}

/**
 * mpv arguments for a paused player that writes the frame it shows as a small JPEG, replacing
 * `output` on each seek: thumbfast's settings. It reads as little as it can (no readahead, a tiny
 * demuxer cache, no audio or subtitles) and decodes cheaply (no loop filter, fast scaling); keyframe
 * seeks decode one picture. The frame is written atomically (a temporary file renamed over it), so a
 * reader never sees half of one. Without `--idle`, a file mpv can't open ends the process.
 */
export function mpvThumbnailArgs(
  input: string,
  seconds: number,
  socket: string,
  output: string,
  width: number,
  height: number
): string[] {
  return [
    '--no-config',
    '--msg-level=all=error',
    '--pause',
    '--keep-open=always',
    '--load-scripts=no',
    '--osc=no',
    '--ytdl=no',
    '--no-sub',
    '--no-audio',
    '--hr-seek=no',
    '--demuxer-readahead-secs=0',
    '--demuxer-max-bytes=128KiB',
    '--network-timeout=15',
    '--vd-lavc-skiploopfilter=all',
    '--vd-lavc-fast',
    '--vd-lavc-threads=2',
    '--hwdec=no',
    '--sws-scaler=fast-bilinear',
    `--vf=scale=w=${width}:h=${height}:force_original_aspect_ratio=decrease:force_divisible_by=2,format=yuvj420p`,
    '--ovc=mjpeg',
    // FFmpeg's -q:v 6; mpv's encoder only takes the AVOptions behind it
    '--ovcopts=strict=unofficial,flags=+qscale,global_quality=708',
    '--of=image2',
    '--ofopts=update=1,atomic_writing=1',
    `--o=${output}`,
    `--input-ipc-server=${socket}`,
    `--start=${seconds}`,
    '--',
    input,
  ];
}

/** How often the frame file is checked while a seek is under way. */
const POLL_MS = 3;
/**
 * A seek to the keyframe already shown may write no new frame: once mpv says it is ready
 * (`playback-restart`) and nothing came for this long, the frame on disk is the answer.
 */
const SAME_FRAME_GRACE_MS = 150;

interface Options {
  spawn: typeof spawnProcess;
  /** The file, as a URL mpv can read (a loopback capability). */
  input: string;
  /** The first frame: mpv opens the file there, so starting costs no extra seek. */
  seconds: number;
  width: number;
  height: number;
  /** A frame taking longer than this (the bytes still downloading) is given up on. */
  timeoutMs: number;
}

/**
 * One mpv kept open on one file, like thumbfast's helper: opening and probing the file is paid
 * once, then each frame is a seek over mpv's IPC socket and one keyframe's decode. Frames are taken
 * one at a time; a request given up on before its turn never seeks. Any failure stops the worker:
 * the caller starts a fresh one for the next frame.
 */
export class MpvFrameWorker {
  private child: ChildProcess | undefined;
  private ipc: Socket | undefined;
  private stderr: () => string = () => '';
  private dir = '';
  private chain: Promise<unknown> = Promise.resolve();
  /** The grid moment the frame on disk shows. */
  private shownAt: number | undefined;
  private playbackRestarts = 0;
  private stopped = false;
  private stopError: Error = new MpvFrameError('mpv is not running');
  private readonly stopListeners = new Set<(error: Error) => void>();
  private readonly exitListeners = new Set<() => void>();

  private constructor(private readonly options: Options) {}

  /** Start mpv on `options.input` and wait for its first frame (at `options.seconds`). */
  static async start(options: Options): Promise<{ worker: MpvFrameWorker; frame: Uint8Array }> {
    const worker = new MpvFrameWorker(options);
    try {
      const frame = await worker.launch();
      return { worker, frame };
    } catch (error) {
      await worker.close();
      throw error;
    }
  }

  /** Whether the worker can still take frames. */
  get alive(): boolean {
    return !this.stopped;
  }

  /** Called once, when mpv is gone (it failed, timed out or was closed). */
  onExit(listener: () => void): void {
    if (this.stopped) listener();
    else this.exitListeners.add(listener);
  }

  /** The JPEG for `seconds`, after the frames asked for before it. */
  frame(seconds: number, signal: AbortSignal): Promise<Uint8Array> {
    const turn = this.chain.then(() => {
      signal.throwIfAborted();
      return this.seek(seconds);
    });
    this.chain = turn.catch(() => undefined);
    return turn;
  }

  async close(): Promise<void> {
    this.stop(new MpvFrameError('mpv was closed'));
    if (this.dir) await rm(this.dir, { recursive: true, force: true }).catch(() => undefined);
  }

  private async launch(): Promise<Uint8Array> {
    const { spawn, input, seconds, width, height } = this.options;
    this.dir = await mkdtemp(join(tmpdir(), 'miauwatch-thumbs-'));
    const socket = join(this.dir, 'mpv.sock');
    const output = join(this.dir, 'frame.jpg');
    const child = spawn('mpv', mpvThumbnailArgs(input, seconds, socket, output, width, height), {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    this.child = child;
    this.stderr = collectStderr(child.stderr);
    const started = new Promise<void>((resolve, reject) => {
      child.once('spawn', resolve);
      child.once('error', error =>
        reject(
          (error as NodeJS.ErrnoException).code === 'ENOENT'
            ? new MpvUnavailableError()
            : new MpvFrameError(`mpv could not start: ${error.message}`)
        )
      );
    });
    child.once('exit', code =>
      this.stop(
        new MpvFrameError(`mpv stopped (${code ?? 'killed'}): ${this.stderr() || 'no output'}`)
      )
    );
    await started;
    const frame = await this.waitForFrame(undefined, () => false);
    this.shownAt = seconds;
    this.ipc = await this.connect(socket);
    return frame;
  }

  /** Connect to mpv's IPC socket (it exists once mpv is up, which its first frame proves). */
  private connect(socket: string): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const ipc = connect(socket);
      let received = '';
      ipc.setEncoding('utf8');
      ipc.on('data', (chunk: string) => {
        received += chunk;
        for (let end = received.indexOf('\n'); end !== -1; end = received.indexOf('\n')) {
          const line = received.slice(0, end);
          received = received.slice(end + 1);
          try {
            const message = JSON.parse(line) as { event?: string };
            if (message.event === 'playback-restart') this.playbackRestarts += 1;
          } catch {
            // Not a message: ignored
          }
        }
      });
      ipc.once('connect', () => resolve(ipc));
      ipc.once('error', error => {
        reject(new MpvFrameError(`mpv's socket is unavailable: ${error.message}`));
        this.stop(new MpvFrameError(`mpv's socket failed: ${error.message}`));
      });
      ipc.once('close', () => this.stop(new MpvFrameError("mpv's socket closed")));
    });
  }

  private async seek(seconds: number): Promise<Uint8Array> {
    if (this.stopped || !this.ipc) throw this.stopError;
    const output = join(this.dir, 'frame.jpg');
    if (this.shownAt === seconds) return readFile(output);
    const before = await identity(output);
    const restartsBefore = this.playbackRestarts;
    this.ipc.write(`${JSON.stringify({ command: ['seek', seconds, 'absolute+keyframes'] })}\n`);
    let readySince: number | undefined;
    const frame = await this.waitForFrame(before, () => {
      if (this.playbackRestarts === restartsBefore) return false;
      readySince ??= performance.now();
      return performance.now() - readySince >= SAME_FRAME_GRACE_MS;
    });
    this.shownAt = seconds;
    return frame;
  }

  /**
   * Wait until the frame file differs from `before` (a new one was renamed into place), or
   * `settled` says the one on disk is the answer; fails when mpv stops or the timeout passes.
   */
  private waitForFrame(before: string | undefined, settled: () => boolean): Promise<Uint8Array> {
    const output = join(this.dir, 'frame.jpg');
    if (this.stopped) return Promise.reject(this.stopError);
    return new Promise<Uint8Array>((resolve, reject) => {
      let poll: ReturnType<typeof setTimeout> | undefined;
      const finish = (error?: Error, frame?: Uint8Array) => {
        clearTimeout(timeout);
        clearTimeout(poll);
        this.stopListeners.delete(onStop);
        if (error) reject(error);
        else resolve(frame!);
      };
      const onStop = (error: Error) => finish(error);
      const timeout = setTimeout(() => {
        const error = new MpvFrameError('mpv took too long to show the frame', true);
        finish(error);
        // Stuck on bytes that don't come: a fresh mpv starts with the next frame
        this.stop(error);
      }, this.options.timeoutMs);
      timeout.unref?.();
      this.stopListeners.add(onStop);
      const check = async () => {
        if (this.stopped) return;
        const now = await identity(output);
        if (now !== undefined && (now !== before || settled())) {
          // Read what was renamed into place; a rename meanwhile replaces it whole, never in part
          readFile(output).then(
            frame => finish(undefined, frame),
            (error: Error) => finish(error)
          );
          return;
        }
        poll = setTimeout(() => void check(), POLL_MS);
      };
      void check();
    });
  }

  private stop(error: Error): void {
    if (this.stopped) return;
    this.stopped = true;
    this.stopError = error;
    for (const listener of this.stopListeners) listener(error);
    this.stopListeners.clear();
    this.ipc?.destroy();
    const child = this.child;
    if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    for (const listener of this.exitListeners) listener();
    this.exitListeners.clear();
  }
}

/** Which file is at `path` now (each atomic write renames a new one into place). */
async function identity(path: string): Promise<string | undefined> {
  try {
    const info = await stat(path);
    return `${info.ino}:${info.mtimeMs}:${info.size}`;
  } catch {
    return undefined;
  }
}
