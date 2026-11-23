import { type ChildProcess, spawn as spawnProcess } from 'node:child_process';

import type { MediaLoadClientService } from '@services/media-load/media-load-client.service';

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

interface PendingFrame {
  value: Promise<Uint8Array>;
  /** Requests waiting for it; the last one to give up stops it. */
  waiting: number;
  controller: AbortController;
}

/**
 * Preview frames for the player's seek bar, taken on demand like mpv's thumbfast: the moment asked
 * for snaps to the 10-second grid, FFmpeg decodes the keyframe there from the stored file (a
 * speculative read, which yields to playback) and the JPEG is kept in memory. A few FFmpegs run at
 * once, across viewers; the rest wait their turn, and a request the player gave up on (its tile
 * scrolled away, the pointer moved on) leaves the queue or stops its FFmpeg.
 */
export class SeekThumbnailService {
  private readonly cache = new Map<string, Uint8Array>();
  /** Frames being taken, shared by everyone asking for the same one. */
  private readonly pending = new Map<string, PendingFrame>();
  private readonly processes = new Set<ChildProcess>();
  private running = 0;
  private readonly queue: Array<() => void> = [];
  private closed = false;

  constructor(
    private readonly mediaLoad: MediaLoadClientService,
    private readonly spawn: typeof spawnProcess = spawnProcess,
    private readonly timeoutMs = TIMEOUT_MS,
    private readonly maxProcesses = MAX_PROCESSES
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

  /**
   * Wait for a free FFmpeg slot, then take the frame. A finished capture hands its slot straight
   * to the next request in the queue, so a caller arriving meanwhile can't take it as well.
   */
  private async take(target: PlaybackTarget, at: number, signal: AbortSignal): Promise<Uint8Array> {
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
      return await this.capture(target, at, signal);
    } finally {
      const next = this.queue.shift();
      if (next) next();
      else this.running -= 1;
    }
  }

  private async capture(
    target: PlaybackTarget,
    seconds: number,
    signal: AbortSignal
  ): Promise<Uint8Array> {
    signal.throwIfAborted();
    const input = await openSourceInput(this.mediaLoad, target, true);
    let child: ChildProcess | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const kill = () => child?.kill('SIGKILL');
    try {
      signal.throwIfAborted();
      child = this.spawn('ffmpeg', seekThumbnailArgs(input.url, seconds), {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
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
      signal.throwIfAborted();
      if (timedOut) throw new SeekThumbnailError('The frame took too long to download.', 504);
      if (tooLarge || code !== 0)
        throw new SeekThumbnailError(
          `The frame could not be read: ${tooLarge ? 'too large' : stderr() || `FFmpeg exited with ${code}`}`
        );
      // Past the last keyframe FFmpeg succeeds with nothing to show
      if (size === 0) throw new SeekThumbnailError('There is no frame at this position.', 404);
      return new Uint8Array(Buffer.concat(chunks, size));
    } finally {
      if (timer) clearTimeout(timer);
      signal.removeEventListener('abort', kill);
      if (child) {
        if (child.exitCode === null && child.signalCode === null) kill();
        this.processes.delete(child);
      }
      await input.close();
    }
  }

  close(): void {
    this.closed = true;
    // Queued requests leave the queue instead of starting FFmpeg once a slot frees
    for (const frame of this.pending.values()) frame.controller.abort();
    this.pending.clear();
    for (const child of this.processes) child.kill('SIGKILL');
    this.cache.clear();
  }
}
