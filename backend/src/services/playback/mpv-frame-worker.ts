import type { ChildProcess, spawn as spawnProcess } from 'node:child_process';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { connect, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { collectStderr } from './stderr-tail';

/** mpv could not be started at all (not installed) */
export class MpvUnavailableError extends Error {
  constructor() {
    super('mpv is not installed');
    this.name = 'MpvUnavailableError';
  }
}

/** A frame mpv did not deliver */
export class MpvFrameError extends Error {
  constructor(
    message: string,
    readonly timedOut = false,
    // When true, mpv had stopped before this frame's turn (another frame's failure)
    readonly beforeTurn = false
  ) {
    super(message);
    this.name = 'MpvFrameError';
  }
}

/** The moment asked for is at or past the end of the file: there is no frame there */
export class MpvPastEndError extends MpvFrameError {
  constructor(seconds: number, duration: number) {
    super(`${seconds}s is past the end of the file (${duration}s)`);
    this.name = 'MpvPastEndError';
  }
}

/** mpv arguments for a paused player that writes the frame it shows as a small JPEG */
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
    // Only this file: no references it names (other tracks, chapters, playlist entries)
    '--access-references=no',
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
 * A seek to the keyframe already shown may write no new frame: once mpv says this seek is done
 * (its `playback-restart`) and nothing came for this long, the frame on disk is the answer.
 */
const SAME_FRAME_GRACE_MS = 150;
/**
 * mpv may write a seek's frame before it reports the seek done: the turn waits this long for that
 * report, so it can't arrive during the next seek and pass for that one's.
 */
const RESTART_WAIT_MS = 250;
/**
 * A seek nobody waits for any more is let finish if it is quick (most take under 100 ms, and the
 * warm mpv is worth keeping); one still running after this is stuck on bytes, so mpv is stopped and
 * the frames queued behind it go to a fresh one.
 */
const ABANDONED_SEEK_MS = 1_000;
/** The `request_id` of the duration query (seeks count up from 1). */
const DURATION_REQUEST = -1;

interface Options {
  spawn: typeof spawnProcess;
  input: string;
  /** The first frame: mpv opens the file there ( initial seek ) */
  seconds: number;
  width: number;
  height: number;
  /** A frame taking longer than this (the bytes still downloading) is given up on */
  timeoutMs: number;
  /** Aborting it while mpv starts stops mpv at once */
  signal?: AbortSignal;
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
  /** The `request_id` of the latest seek sent. */
  private seekRequest = 0;
  /** The file's length, as mpv reported it once open (unknown for some streams). */
  private duration: number | undefined;
  private durationReply: ((value: number | undefined) => void) | undefined;
  /** mpv answered the latest seek: a `seek` event from now on is that seek's. */
  private seekAnswered = false;
  /** mpv started the latest seek (its `seek` event): a `playback-restart` from now on ends it. */
  private seekStarted = false;
  /**
   * mpv reported the latest seek done. An earlier seek's late report comes before this one
   * started, so it can't pass for this one's.
   */
  private seekDone = false;
  private stopped = false;
  private stopError: Error = new MpvFrameError('mpv is not running');
  private readonly stopListeners = new Set<(error: Error) => void>();
  private readonly exitListeners = new Set<() => void>();

  private constructor(private readonly options: Options) {}

  /** Start mpv on `options.input` and wait for its first frame (at `options.seconds`). */
  static async start(options: Options): Promise<{ worker: MpvFrameWorker; frame: Uint8Array }> {
    const worker = new MpvFrameWorker(options);
    const onAbort = () => worker.stop(new MpvFrameError('mpv was closed'));
    options.signal?.addEventListener('abort', onAbort, { once: true });
    try {
      if (options.signal?.aborted) onAbort();
      const frame = await worker.launch();
      return { worker, frame };
    } catch (error) {
      await worker.close();
      throw error;
    } finally {
      options.signal?.removeEventListener('abort', onAbort);
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

  /**
   * The JPEG for `seconds`, after the frames asked for before it. Aborting `signal` before its
   * turn drops it; during its turn, a seek still running after `ABANDONED_SEEK_MS` stops mpv.
   * `onTurn` is called as its turn starts.
   */
  frame(seconds: number, signal: AbortSignal, onTurn?: () => void): Promise<Uint8Array> {
    const turn = this.chain.then(() => {
      signal.throwIfAborted();
      if (this.stopped || !this.ipc)
        throw new MpvFrameError(`mpv stopped first: ${this.stopError.message}`, false, true);
      if (this.duration !== undefined && seconds >= this.duration)
        throw new MpvPastEndError(seconds, this.duration);
      onTurn?.();
      return this.seek(seconds, signal);
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
    // Stopped while the directory was made: no mpv is started
    if (this.stopped) throw this.stopError;
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
    const frame = await this.waitForFrame(undefined);
    this.shownAt = seconds;
    this.ipc = await this.connect(socket);
    this.duration = await this.askDuration();
    if (this.stopped) throw this.stopError;
    if (this.duration !== undefined && seconds >= this.duration)
      throw new MpvPastEndError(seconds, this.duration);
    return frame;
  }

  /** The file's duration from mpv (undefined when it doesn't know it, or stopped meanwhile). */
  private askDuration(): Promise<number | undefined> {
    return new Promise(resolve => {
      if (this.stopped) return resolve(undefined);
      const onStop = () => resolve(undefined);
      this.stopListeners.add(onStop);
      this.durationReply = value => {
        this.stopListeners.delete(onStop);
        this.durationReply = undefined;
        resolve(value);
      };
      const command = { command: ['get_property', 'duration'], request_id: DURATION_REQUEST };
      this.ipc!.write(`${JSON.stringify(command)}\n`);
    });
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
            const message = JSON.parse(line) as {
              event?: string;
              request_id?: number;
              data?: unknown;
            };
            if (message.request_id === DURATION_REQUEST)
              this.durationReply?.(
                typeof message.data === 'number' && message.data > 0 ? message.data : undefined
              );
            else if (message.request_id === this.seekRequest) this.seekAnswered = true;
            else if (message.event === 'seek' && this.seekAnswered) this.seekStarted = true;
            else if (message.event === 'playback-restart' && this.seekStarted) this.seekDone = true;
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

  private async seek(seconds: number, signal: AbortSignal): Promise<Uint8Array> {
    const output = join(this.dir, 'frame.jpg');
    if (this.shownAt === seconds) return readFile(output);
    const before = await identity(output);
    // Without the shown frame's identity, any file on disk would pass for the new one
    if (before === undefined) {
      const error = new MpvFrameError('the frame shown is missing');
      this.stop(error);
      throw error;
    }
    this.seekRequest += 1;
    this.seekAnswered = false;
    this.seekStarted = false;
    this.seekDone = false;
    const command = {
      command: ['seek', seconds, 'absolute+keyframes'],
      request_id: this.seekRequest,
    };
    this.ipc!.write(`${JSON.stringify(command)}\n`);
    const frame = await this.waitForFrame(before, signal);
    this.shownAt = seconds;
    return frame;
  }

  /**
   * Wait for the frame: mpv's first one (no `signal`), or the one a seek shows (with it). A seek's
   * frame is a new file renamed into place, kept once mpv reports the seek done (or after
   * `RESTART_WAIT_MS`); a seek reported done with no new file for `SAME_FRAME_GRACE_MS` landed on
   * the keyframe on disk. Fails when mpv stops or the timeout passes.
   */
  private waitForFrame(before: string | undefined, signal?: AbortSignal): Promise<Uint8Array> {
    const output = join(this.dir, 'frame.jpg');
    if (this.stopped) return Promise.reject(this.stopError);
    return new Promise<Uint8Array>((resolve, reject) => {
      let poll: ReturnType<typeof setTimeout> | undefined;
      let abandoned: ReturnType<typeof setTimeout> | undefined;
      let changed: { at: number; frame: Uint8Array } | undefined;
      let doneAt: number | undefined;
      const finish = (error?: Error, frame?: Uint8Array) => {
        clearTimeout(timeout);
        clearTimeout(poll);
        clearTimeout(abandoned);
        signal?.removeEventListener('abort', onAbort);
        this.stopListeners.delete(onStop);
        if (error) reject(error);
        else resolve(frame!);
      };
      const onStop = (error: Error) => finish(error);
      const onAbort = () => {
        abandoned = setTimeout(
          () => this.stop(new MpvFrameError('a frame nobody waits for any more is stuck', true)),
          ABANDONED_SEEK_MS
        );
        abandoned.unref?.();
      };
      if (signal?.aborted) onAbort();
      else signal?.addEventListener('abort', onAbort, { once: true });
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
        const now = Date.now();
        try {
          if (!changed) {
            const current = await identity(output);
            if (current !== undefined && current !== before) {
              // Read what was renamed into place; a rename meanwhile replaces it whole, never in part
              changed = { at: now, frame: await readFile(output) };
            }
          }
          if (!signal) {
            if (changed) return finish(undefined, changed.frame);
          } else if (changed) {
            if (this.seekDone || now - changed.at >= RESTART_WAIT_MS)
              return finish(undefined, changed.frame);
          } else if (this.seekDone) {
            doneAt ??= now;
            if (now - doneAt >= SAME_FRAME_GRACE_MS)
              return finish(undefined, await readFile(output));
          }
        } catch (error) {
          return finish(error as Error);
        }
        if (this.stopped) return;
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
