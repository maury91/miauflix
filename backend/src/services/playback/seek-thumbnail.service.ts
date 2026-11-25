import { type ChildProcess, spawn as spawnProcess } from 'node:child_process';

import { logger } from '@logger';

import type { MediaLoadClientService } from '@services/media-load/media-load-client.service';

import { MpvFrameError, MpvFrameWorker, MpvUnavailableError } from './mpv-frame-worker';
import type { PlaybackTarget } from './playback-target';
import { openSourceInput } from './source-input';
import { collectStderr } from './stderr-tail';

/** Thumbnails are taken on this grid, in seconds: the player asks for the same moments again. */
export const THUMBNAIL_STEP_SECONDS = 10;
/** The largest frame sent, in pixels: enough for a preview above the seek bar on a TV. */
const THUMBNAIL_WIDTH = 384;
const THUMBNAIL_HEIGHT = 216;
/** Thumbnails kept in memory, across viewers (each is about 10-25 kB). */
const CACHE_ENTRIES = 600;
/** FFmpeg processes taking thumbnails at once, across viewers; the TV's strip asks for five. */
const MAX_PROCESSES = 3;
/** mpvs kept open at once, one per file being scrubbed (each holds a decoder, tens of MB). */
const MAX_WORKERS = 3;
/** An mpv nobody asked a frame of for this long is closed; the next frame starts another. */
const WORKER_IDLE_MS = 5 * 60_000;
/** A frame whose bytes take longer than this to download is given up on. */
const TIMEOUT_MS = 20_000;
/** A JPEG larger than this is not a thumbnail. */
const MAX_BYTES = 512 * 1024;

export class SeekThumbnailError extends Error {
  constructor(
    message: string,
    readonly status: 404 | 503 | 504 = 503
  ) {
    super(message);
    this.name = 'SeekThumbnailError';
  }
}

/**
 * FFmpeg arguments for one small JPEG of the keyframe at or before `seconds`: the input seeks to it
 * by the container's index and only keyframes are decoded, so a frame costs one GOP's bytes and one
 * picture's decode, never the frames between.
 */
export function seekThumbnailArgs(input: string, seconds: number): string[] {
  return [
    '-nostdin',
    '-v',
    'error',
    '-rw_timeout',
    '15000000',
    '-protocol_whitelist',
    'http,tcp',
    '-format_whitelist',
    'matroska,webm,mov,avi,asf,flv,ogg,mpegts',
    // One picture: a decoder thread per core would only cost memory and start-up
    '-threads',
    '1',
    '-skip_frame',
    'nokey',
    '-ss',
    String(seconds),
    '-noaccurate_seek',
    '-i',
    input,
    '-map',
    '0:v:0',
    '-an',
    '-sn',
    '-frames:v',
    '1',
    '-vf',
    `scale=w=${THUMBNAIL_WIDTH}:h=${THUMBNAIL_HEIGHT}:force_original_aspect_ratio=decrease:force_divisible_by=2`,
    '-pix_fmt',
    'yuvj420p',
    '-c:v',
    'mjpeg',
    '-q:v',
    '6',
    '-f',
    'image2pipe',
    'pipe:1',
  ];
}

/** One byte range FFmpeg read from the file, timed from the start of its capture. */
interface ReadTiming {
  range: string;
  status: number;
  /** When FFmpeg asked for it. */
  atMs: number;
  /** Until media-load answered (it waits for torrent pieces it doesn't have yet). */
  answerMs: number;
  /** Until the last byte FFmpeg took from it (it closes a read once it has what it needs). */
  lastByteMs: number;
  bytes: number;
}

const elapsed = (since: number) => Math.round(performance.now() - since);

/**
 * `mediaLoad` with each read timed into `reads`. Measuring only: it tells the probe's reads
 * (the start of the file, the index) from the seek's and shows which ones wait for the download.
 */
function timedReads(
  mediaLoad: MediaLoadClientService,
  started: number,
  reads: ReadTiming[]
): Pick<MediaLoadClientService, 'streamFile'> {
  return {
    async streamFile(target, rangeHeader, speculative) {
      const atMs = elapsed(started);
      const response = await mediaLoad.streamFile(target, rangeHeader, speculative);
      const read: ReadTiming = {
        range: rangeHeader ?? 'all',
        status: response.status,
        atMs,
        answerMs: elapsed(started),
        lastByteMs: elapsed(started),
        bytes: 0,
      };
      reads.push(read);
      if (!response.body) return response;
      const counted = response.body.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
          transform(chunk, controller) {
            read.bytes += chunk.byteLength;
            read.lastByteMs = elapsed(started);
            controller.enqueue(chunk);
          },
        })
      );
      return new Response(counted, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    },
  };
}

/** `mediaLoad` with the bytes it sends counted into `counter`. */
function countedReads(
  mediaLoad: MediaLoadClientService,
  counter: { bytes: number }
): Pick<MediaLoadClientService, 'streamFile'> {
  return {
    async streamFile(target, rangeHeader, speculative) {
      const response = await mediaLoad.streamFile(target, rangeHeader, speculative);
      if (!response.body) return response;
      const counted = response.body.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
          transform(chunk, controller) {
            counter.bytes += chunk.byteLength;
            controller.enqueue(chunk);
          },
        })
      );
      return new Response(counted, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    },
  };
}

/** An mpv kept open on one file, with the loopback input it reads. */
interface WorkerSlot {
  /** Resolves once mpv showed its first frame; rejects if it couldn't start. */
  ready: Promise<MpvFrameWorker>;
  /** Bytes read from media-load so far. */
  reads: { bytes: number };
  idle?: ReturnType<typeof setTimeout>;
  close: () => Promise<void>;
}

interface PendingFrame {
  value: Promise<Uint8Array>;
  /** Requests waiting for it; the last one to give up stops it. */
  waiting: number;
  controller: AbortController;
}

/**
 * Preview frames for the player's seek bar, taken on demand like mpv's thumbfast: the moment asked
 * for snaps to the 10-second grid and the JPEG is kept in memory. An mpv kept open on the file (a
 * speculative read, which yields to playback) seeks to the keyframe there, so only the first frame
 * of a file pays for starting it and reading the file's index; it closes after a few idle minutes.
 * A request the player gave up on (its tile scrolled away, the pointer moved on) leaves the queue.
 *
 * Without mpv installed, each frame is a short FFmpeg run instead: a few at once, across viewers,
 * and a request given up on stops its FFmpeg.
 */
export class SeekThumbnailService {
  private readonly cache = new Map<string, Uint8Array>();
  /** Frames being taken, shared by everyone asking for the same one. */
  private readonly pending = new Map<string, PendingFrame>();
  private readonly processes = new Set<ChildProcess>();
  private running = 0;
  private readonly queue: Array<() => void> = [];
  /** mpvs by file, least recently used first. */
  private readonly workers = new Map<string, WorkerSlot>();
  private closed = false;

  constructor(
    private readonly mediaLoad: MediaLoadClientService,
    private readonly spawn: typeof spawnProcess = spawnProcess,
    private readonly timeoutMs = TIMEOUT_MS,
    private readonly maxProcesses = MAX_PROCESSES,
    /** `ffmpeg` takes every frame with a short FFmpeg run; `mpv` falls back to it when missing. */
    private engine: 'ffmpeg' | 'mpv' = 'mpv',
    private readonly workerIdleMs = WORKER_IDLE_MS
  ) {}

  /** The moment a request for `seconds` is answered with. */
  static snap(seconds: number): number {
    return Math.max(0, Math.floor(seconds / THUMBNAIL_STEP_SECONDS) * THUMBNAIL_STEP_SECONDS);
  }

  /** The JPEG for `seconds` of the target's file. Aborting `signal` gives up on it. */
  async thumbnail(
    target: PlaybackTarget,
    seconds: number,
    signal: AbortSignal
  ): Promise<Uint8Array> {
    const at = SeekThumbnailService.snap(seconds);
    const key = `${target.source.id}:${target.filePath}:${at}`;
    const cached = this.cache.get(key);
    if (cached) {
      // Most recently used last
      this.cache.delete(key);
      this.cache.set(key, cached);
      return cached;
    }
    if (this.closed) throw new SeekThumbnailError('Thumbnails are unavailable.');
    signal.throwIfAborted();
    let shared = this.pending.get(key);
    if (!shared) {
      const controller = new AbortController();
      const created: PendingFrame = {
        value: Promise.resolve(new Uint8Array()),
        waiting: 0,
        controller,
      };
      const forget = () => {
        if (this.pending.get(key) === created) this.pending.delete(key);
      };
      created.value = this.take(target, at, controller.signal)
        .then(image => {
          // Closed meanwhile: nothing more is kept
          if (this.closed) return image;
          this.cache.set(key, image);
          if (this.cache.size > CACHE_ENTRIES) {
            const oldest = this.cache.keys().next().value;
            if (oldest !== undefined) this.cache.delete(oldest);
          }
          return image;
        })
        .finally(forget);
      // Nobody may be waiting by the time it fails
      created.value.catch(() => undefined);
      shared = created;
      this.pending.set(key, shared);
    }
    const frame = shared;
    frame.waiting += 1;
    let onAbort: (() => void) | undefined;
    try {
      return await Promise.race([
        frame.value,
        new Promise<never>((_, reject) => {
          onAbort = () => {
            reject(signal.reason);
            if (--frame.waiting > 0) return;
            // A later request for this moment starts afresh instead of joining a cancelled one
            if (this.pending.get(key) === frame) this.pending.delete(key);
            frame.controller.abort();
          };
          signal.addEventListener('abort', onAbort, { once: true });
        }),
      ]);
    } finally {
      if (onAbort) signal.removeEventListener('abort', onAbort);
      if (!signal.aborted) frame.waiting -= 1;
    }
  }

  private async take(target: PlaybackTarget, at: number, signal: AbortSignal): Promise<Uint8Array> {
    if (this.engine === 'mpv') {
      try {
        return await this.mpvFrame(target, at, signal);
      } catch (error) {
        if (!(error instanceof MpvUnavailableError)) throw error;
        logger.warn('SeekThumbnailService', 'mpv is not installed: thumbnails use FFmpeg runs');
        this.engine = 'ffmpeg';
      }
    }
    return this.ffmpegFrame(target, at, signal);
  }

  /** The frame from the file's mpv, started (at this frame) if none is open. */
  private async mpvFrame(
    target: PlaybackTarget,
    at: number,
    signal: AbortSignal
  ): Promise<Uint8Array> {
    const started = performance.now();
    const file = `${target.source.id}:${target.filePath}`;
    let slot = this.workers.get(file);
    let result = 'failed';
    let bytesBefore = slot?.reads.bytes ?? 0;
    const startsWorker = !slot;
    try {
      let image: Uint8Array;
      if (slot) {
        // Most recently used last
        this.workers.delete(file);
        this.workers.set(file, slot);
        try {
          const worker = await slot.ready;
          image = await worker.frame(at, signal);
        } catch (error) {
          // The open mpv died under this request (not stuck, which a fresh one would be too):
          // the frame is taken by a fresh one
          if (!(error instanceof MpvFrameError) || error.timedOut || signal.aborted) throw error;
          const opened = this.openWorker(file, target, at);
          slot = opened.slot;
          bytesBefore = 0;
          image = await opened.frame;
        }
      } else {
        const opened = this.openWorker(file, target, at);
        slot = opened.slot;
        bytesBefore = 0;
        image = await opened.frame;
      }
      this.keepAlive(file, slot);
      result = 'ok';
      return image;
    } catch (error) {
      if (signal.aborted) result = 'aborted';
      if (error instanceof MpvUnavailableError) throw error;
      if (error instanceof MpvFrameError) {
        if (error.timedOut) {
          result = 'timeout';
          throw new SeekThumbnailError('The frame took too long to download.', 504);
        }
        throw new SeekThumbnailError(`The frame could not be read: ${error.message}`);
      }
      throw error;
    } finally {
      logger.info('SeekThumbnailService', 'Thumbnail frame timing', {
        engine: 'mpv',
        sourceId: target.source.id,
        seconds: at,
        totalMs: elapsed(started),
        startedWorker: startsWorker,
        readBytes: (slot?.reads.bytes ?? 0) - bytesBefore,
        result,
      });
    }
  }

  /** Start an mpv on the file at `at`; its first frame is that one. */
  private openWorker(
    file: string,
    target: PlaybackTarget,
    at: number
  ): { slot: WorkerSlot; frame: Promise<Uint8Array> } {
    // Room for this one: the least recently used goes
    while (this.workers.size >= MAX_WORKERS) {
      const [oldest, slot] = this.workers.entries().next().value as [string, WorkerSlot];
      this.workers.delete(oldest);
      void slot.close();
    }
    const reads = { bytes: 0 };
    let closeInput: () => Promise<void> = async () => undefined;
    let worker: MpvFrameWorker | undefined;
    /** Closed while starting (evicted, or the service closed): what started is closed at once. */
    let gone = false;
    const starting = (async () => {
      const input = await openSourceInput(countedReads(this.mediaLoad, reads), target, true);
      closeInput = input.close;
      if (gone) throw new MpvFrameError('mpv was closed');
      const opened = await MpvFrameWorker.start({
        spawn: this.spawn,
        input: input.url,
        seconds: at,
        width: THUMBNAIL_WIDTH,
        height: THUMBNAIL_HEIGHT,
        timeoutMs: this.timeoutMs,
      });
      worker = opened.worker;
      if (gone) throw new MpvFrameError('mpv was closed');
      return opened;
    })();
    const slot: WorkerSlot = {
      ready: starting.then(opened => opened.worker),
      reads,
      close: async () => {
        gone = true;
        clearTimeout(slot.idle);
        if (this.workers.get(file) === slot) this.workers.delete(file);
        await worker?.close();
        await closeInput();
      },
    };
    // Nobody may be waiting by the time it fails
    slot.ready.catch(() => undefined);
    this.workers.set(file, slot);
    const frame = starting.then(
      opened => {
        opened.worker.onExit(() => void slot.close());
        return opened.frame;
      },
      async (error: unknown) => {
        await slot.close();
        throw error;
      }
    );
    return { slot, frame };
  }

  /** Close the file's mpv once nobody asked it for a frame for a while. */
  private keepAlive(file: string, slot: WorkerSlot): void {
    clearTimeout(slot.idle);
    if (this.workers.get(file) !== slot) return;
    slot.idle = setTimeout(() => void slot.close(), this.workerIdleMs);
    slot.idle.unref?.();
  }

  /**
   * Wait for a free FFmpeg slot, then take the frame. A finished capture hands its slot straight
   * to the next request in the queue, so a caller arriving meanwhile can't take it as well.
   */
  private async ffmpegFrame(
    target: PlaybackTarget,
    at: number,
    signal: AbortSignal
  ): Promise<Uint8Array> {
    const asked = performance.now();
    if (this.running >= this.maxProcesses) {
      await new Promise<void>((resolve, reject) => {
        const go = () => {
          signal.removeEventListener('abort', leave);
          resolve();
        };
        const leave = () => {
          const index = this.queue.indexOf(go);
          if (index !== -1) this.queue.splice(index, 1);
          reject(signal.reason);
        };
        signal.addEventListener('abort', leave, { once: true });
        this.queue.push(go);
      });
    } else this.running += 1;
    // The slot is this request's now, whatever happens next
    try {
      if (this.closed) throw new SeekThumbnailError('Thumbnails are unavailable.');
      return await this.capture(target, at, signal, elapsed(asked));
    } finally {
      const next = this.queue.shift();
      if (next) next();
      else this.running -= 1;
    }
  }

  private async capture(
    target: PlaybackTarget,
    seconds: number,
    signal: AbortSignal,
    queuedMs: number
  ): Promise<Uint8Array> {
    signal.throwIfAborted();
    const started = performance.now();
    const reads: ReadTiming[] = [];
    const timing = {
      queuedMs,
      openMs: 0,
      spawnMs: 0,
      firstOutputMs: undefined as number | undefined,
      exitMs: undefined as number | undefined,
      outputBytes: 0,
      result: 'failed',
    };
    const input = await openSourceInput(timedReads(this.mediaLoad, started, reads), target, true);
    timing.openMs = elapsed(started);
    let child: ChildProcess | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const kill = () => child?.kill('SIGKILL');
    try {
      signal.throwIfAborted();
      child = this.spawn('ffmpeg', seekThumbnailArgs(input.url, seconds), {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      timing.spawnMs = elapsed(started);
      this.processes.add(child);
      signal.addEventListener('abort', kill, { once: true });
      let timedOut = false;
      timer = setTimeout(() => {
        timedOut = true;
        kill();
      }, this.timeoutMs);
      timer.unref?.();
      const stderr = collectStderr(child.stderr);
      const chunks: Buffer[] = [];
      let size = 0;
      let tooLarge = false;
      child.stdout?.on('data', (chunk: Buffer) => {
        timing.firstOutputMs ??= elapsed(started);
        size += chunk.length;
        if (size > MAX_BYTES) {
          tooLarge = true;
          kill();
        } else chunks.push(chunk);
      });
      const running = child;
      const code = await new Promise<number | null>((resolve, reject) => {
        running.once('error', () =>
          reject(new SeekThumbnailError('FFmpeg is unavailable. Install FFmpeg on the backend.'))
        );
        running.once('close', resolve);
      });
      timing.exitMs = elapsed(started);
      timing.outputBytes = size;
      if (signal.aborted) timing.result = 'aborted';
      signal.throwIfAborted();
      if (timedOut) timing.result = 'timeout';
      if (timedOut) throw new SeekThumbnailError('The frame took too long to download.', 504);
      if (tooLarge || code !== 0)
        throw new SeekThumbnailError(
          `The frame could not be read: ${tooLarge ? 'too large' : stderr() || `FFmpeg exited with ${code}`}`
        );
      // Past the last keyframe FFmpeg succeeds with nothing to show
      if (size === 0) throw new SeekThumbnailError('There is no frame at this position.', 404);
      timing.result = 'ok';
      return new Uint8Array(Buffer.concat(chunks, size));
    } finally {
      if (timer) clearTimeout(timer);
      signal.removeEventListener('abort', kill);
      if (child) {
        if (child.exitCode === null && child.signalCode === null) kill();
        this.processes.delete(child);
      }
      await input.close();
      this.logTiming(target, seconds, started, timing, reads);
    }
  }

  /**
   * One line per FFmpeg run: where its time went (queue, start-up, each read of the file, decode),
   * to tell the probe and the download apart from FFmpeg itself.
   */
  private logTiming(
    target: PlaybackTarget,
    seconds: number,
    started: number,
    timing: Record<string, unknown>,
    reads: ReadTiming[]
  ): void {
    const readBytes = reads.reduce((total, read) => total + read.bytes, 0);
    const waitingMs = reads.reduce((total, read) => total + read.answerMs - read.atMs, 0);
    logger.info('SeekThumbnailService', 'Thumbnail frame timing', {
      engine: 'ffmpeg',
      sourceId: target.source.id,
      seconds,
      totalMs: elapsed(started),
      ...timing,
      firstReadMs: reads[0]?.atMs,
      readCount: reads.length,
      readBytes,
      /** Summed time media-load took to answer the reads (waiting for pieces). */
      waitingMs,
      reads: reads
        .slice(0, 12)
        .map(
          read =>
            `${read.range} ${read.status} @${read.atMs} answer+${read.answerMs - read.atMs} ` +
            `last+${read.lastByteMs - read.atMs} ${Math.round(read.bytes / 1024)}kB`
        ),
    });
  }

  close(): void {
    this.closed = true;
    // Queued requests leave the queue instead of starting FFmpeg once a slot frees
    for (const frame of this.pending.values()) frame.controller.abort();
    this.pending.clear();
    for (const child of this.processes) child.kill('SIGKILL');
    for (const slot of [...this.workers.values()]) void slot.close();
    this.workers.clear();
    this.cache.clear();
  }
}
