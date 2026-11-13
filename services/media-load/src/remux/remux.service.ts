import { type ChildProcess, spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { setPriority } from 'node:os';
import { join } from 'node:path';

import type {
  RemuxPlan,
  RemuxPriority,
  RemuxSidecar,
  RemuxStatus,
} from '@miauflix/service-contracts';

import type { Encryption } from '../lib/encryption';
import { ErrorWithStatus } from '../lib/errors';
import { logger } from '../lib/logger';
import type { Storage } from '../storage/types';
import { PRIORITY_RANK, type RemuxRecord, type RemuxRepository } from './remux.repository';
import {
  buildPlaylist,
  parsePlaylist,
  PLAYLIST_NAME,
  type PlaylistSegment,
  remuxArgs,
  SEGMENT_PATTERN,
  sidecarFor,
} from './remux-command';

/** Niceness of a remux nobody is waiting for, and of one a viewer is waiting for. */
const BACKGROUND_NICE = 19;
const WATCHING_NICE = 0;
/** How often queued remuxes of files still downloading are looked at again. */
const RETRY_MS = 60_000;
/** Progress events at most this often per remux; state changes always go out. */
const PROGRESS_EVENT_MS = 2_000;
/** A finished remux must last as long as its source, within this many seconds. */
const DURATION_TOLERANCE_SECONDS = 1.5;
/** How long uploads FFmpeg sent before exiting may take to arrive. */
const SETTLE_MS = 5_000;
/** FFmpeg's last error lines kept for a failed remux. */
const STDERR_TAIL = 2_000;

export interface RemuxServiceDeps {
  repository: RemuxRepository;
  encryption: Encryption;
  storage: {
    getStorageBySource(sourceId: number): Promise<Storage | null>;
    reconcileAllocation(sourceId: number): Promise<unknown>;
    markAsAccessed(sourceId: number): Promise<void>;
    on(event: 'delete', listener: (storage: Storage) => void): unknown;
  };
  isFileComplete(sourceId: number, filePath: string): Promise<boolean>;
  /** The source file's bytes, honouring `Range`, without counting as playback. */
  readSource(sourceId: number, filePath: string, range?: string): Promise<Response>;
  ffmpegPath?: string;
  retryMs?: number;
}

interface Job {
  record: RemuxRecord;
  token: string;
  dir: string;
  child: ChildProcess | null;
  /** Sidecar names the plan expects, with their tracks. */
  sidecars: Map<string, RemuxSidecar>;
  /** The segments FFmpeg's last playlist lists. */
  segments: PlaylistSegment[];
  ended: boolean;
  /** Why the job was stopped by us: it runs again (`requeue`) or its storage is gone (`drop`). */
  stopped: 'requeue' | 'drop' | null;
  stderr: string;
  lastEvent: number;
  /** Playlist and segment uploads, stored one after another in the order they arrived. */
  writes: Promise<unknown>;
  /** Sidecar uploads: each streams for the whole run, so they are not queued with the rest. */
  sidecarWrites: Set<Promise<unknown>>;
}

const contentType = (name: string): string =>
  name === PLAYLIST_NAME
    ? 'application/vnd.apple.mpegurl'
    : name.endsWith('.vtt')
      ? 'text/vtt; charset=utf-8'
      : name.endsWith('.mkv')
        ? 'video/x-matroska'
        : name.endsWith('.sup')
          ? 'application/octet-stream'
          : 'video/mp2t';

/** A byte range of `size` bytes, or null for the whole file; throws on an unsatisfiable one. */
const parseRange = (header: string | undefined, size: number): [number, number] | null => {
  const match = header?.match(/^bytes=(\d*)-(\d*)$/);
  if (!match || (!match[1] && !match[2])) return null;
  const [start, end] = match[1]
    ? [Number(match[1]), match[2] ? Math.min(Number(match[2]), size - 1) : size - 1]
    : [Math.max(0, size - Number(match[2])), size - 1];
  if (start > end || start >= size) throw new RangeError('unsatisfiable');
  return [start, end];
};

/**
 * TV remuxes of stored files, one at a time, highest priority first: FFmpeg reads the source
 * through a loopback server and uploads HLS segments, the playlist and subtitle sidecars back to
 * it with `PUT`; each file is stored encrypted under the source's storage directory, so it is
 * measured and removed with the source.
 */
export class RemuxService {
  private server: ReturnType<typeof Bun.serve> | null = null;
  private job: Job | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private scheduling = false;
  private rescan = false;
  private closed = false;
  private readonly listeners = new Set<(status: RemuxStatus) => void>();

  constructor(private readonly deps: RemuxServiceDeps) {
    deps.storage.on('delete', storage => this.storageRemoved(storage));
  }

  /** Requeue remuxes a previous process left running, and start the queue. */
  async start(): Promise<void> {
    for (const record of this.deps.repository.running()) await this.discard(record);
    this.schedule();
  }

  async close(): Promise<void> {
    this.closed = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    const job = this.job;
    if (job) {
      job.stopped = 'requeue';
      job.child?.kill('SIGKILL');
    }
    this.server?.stop(true);
    this.server = null;
  }

  onChange(listener: (status: RemuxStatus) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Queue a remux of a stored file, or raise the priority of the queued or running one. A viewer
   * waiting for it stops a lower-priority remux (which runs again later) and runs at normal
   * niceness.
   */
  async request(
    sourceId: number,
    filePath: string,
    plan: RemuxPlan,
    priority: RemuxPriority
  ): Promise<RemuxStatus> {
    const storage = await this.deps.storage.getStorageBySource(sourceId);
    if (!storage?.encryptedLayout?.files.some(file => file.path === filePath))
      throw new ErrorWithStatus(
        `Source ${sourceId} does not store this file`,
        'source_file_unavailable'
      );
    this.deps.repository.upsert(storage.id, filePath, plan, priority);
    const record = this.deps.repository.find(sourceId, filePath)!;
    const job = this.job;
    if (job && priority === 'watching') {
      if (job.record.id === record.id) {
        job.record.priority = 'watching';
        if (job.child?.pid) this.renice(job.child.pid, WATCHING_NICE);
      } else if (PRIORITY_RANK[job.record.priority] > PRIORITY_RANK.watching) {
        logger.info('Remux', `Pausing remux ${job.record.id} for one a viewer is waiting for`);
        job.stopped = 'requeue';
        job.child?.kill('SIGKILL');
      }
    }
    this.schedule();
    return this.status(record);
  }

  find(sourceId: number, filePath: string): RemuxStatus | null {
    const record = this.deps.repository.find(sourceId, filePath);
    return record ? this.status(record) : null;
  }

  /** A file of a remux: the playlist of the segments stored so far, a segment or a sidecar. */
  async read(sourceId: number, filePath: string, name: string, range?: string): Promise<Response> {
    const record = this.deps.repository.find(sourceId, filePath);
    if (!record || record.state === 'failed')
      throw new ErrorWithStatus('This file has no remux', 'remux_not_found');
    if (name === PLAYLIST_NAME) {
      void this.deps.storage.markAsAccessed(sourceId).catch(() => undefined);
      return new Response(this.playlist(record), {
        headers: { 'content-type': contentType(name), 'cache-control': 'no-cache' },
      });
    }
    const file = this.deps.repository.file(record.id, name);
    if (!file) throw new ErrorWithStatus('The remux has no such file', 'remux_not_found');
    const data = new Uint8Array(
      this.deps.encryption.decryptBuffer(
        await readFile(join(this.dirOf(record), this.diskName(name)))
      )
    );
    const headers: Record<string, string> = {
      'content-type': contentType(name),
      'accept-ranges': 'bytes',
      'cache-control': 'private, max-age=86400',
    };
    let bounds: [number, number] | null;
    try {
      bounds = parseRange(range, data.length);
    } catch {
      return new Response(null, {
        status: 416,
        headers: { ...headers, 'content-range': `bytes */${data.length}` },
      });
    }
    if (!bounds) return new Response(data, { headers });
    const [start, end] = bounds;
    return new Response(data.subarray(start, end + 1), {
      status: 206,
      headers: { ...headers, 'content-range': `bytes ${start}-${end}/${data.length}` },
    });
  }

  private playlist(record: RemuxRecord): string {
    const segments = this.deps.repository
      .files(record.id)
      .filter(file => file.kind === 'segment' && file.seq !== null && file.duration !== null)
      .sort((a, b) => a.seq! - b.seq!)
      .map(file => ({ name: file.name, duration: file.duration! }));
    return buildPlaylist(segments, record.state === 'complete');
  }

  private status(record: RemuxRecord): RemuxStatus {
    const subtitles = this.deps.repository
      .files(record.id)
      .flatMap(file => (file.kind === 'sidecar' && file.sidecar ? [file.sidecar] : []));
    return {
      sourceId: record.sourceId,
      filePath: record.filePath,
      state: record.state,
      priority: record.priority,
      readySeconds: record.readySeconds,
      durationSeconds: record.plan.durationSeconds,
      bytes: record.bytes,
      subtitles,
      ...(record.error ? { error: record.error } : {}),
    };
  }

  private emit(recordId: number): void {
    const record = this.deps.repository.findById(recordId);
    if (!record) return;
    const status = this.status(record);
    for (const listener of this.listeners) {
      try {
        listener(status);
      } catch (error) {
        logger.warn('Remux', 'Remux listener failed', error);
      }
    }
  }

  private dirOf(record: Pick<RemuxRecord, 'location' | 'id'>): string {
    return join(record.location, 'remux', String(record.id));
  }

  /** A file's name on disk: keyed, so names say nothing about what the directory holds. */
  private diskName(name: string): string {
    return createHash('sha256')
      .update(this.deps.encryption.encryptString(name, true))
      .digest('hex')
      .slice(0, 32);
  }

  private renice(pid: number, nice: number): void {
    try {
      setPriority(pid, nice);
    } catch (error) {
      logger.debug('Remux', `Could not set the remux's priority to ${nice}`, error);
    }
  }

  /** Start the next runnable remux when none runs. */
  private schedule(): void {
    if (this.closed) return;
    // A request while the queue is being looked at is picked up when the current pass ends.
    this.rescan = true;
    if (this.scheduling) return;
    this.scheduling = true;
    void this.drain()
      .catch(error => logger.error('Remux', 'Remux scheduling failed', error))
      .finally(() => {
        this.scheduling = false;
      });
  }

  /** Run remuxes, one after another, until none is runnable. */
  private async drain(): Promise<void> {
    while (this.rescan && !this.closed) {
      this.rescan = false;
      if (await this.next()) this.rescan = true;
    }
  }

  /** Run the first runnable remux; false when there is none. */
  private async next(): Promise<boolean> {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    const queued = this.deps.repository.queued();
    for (const record of queued) {
      if (!(await this.deps.isFileComplete(record.sourceId, record.filePath))) continue;
      await this.run(record);
      return true;
    }
    // Files still downloading are looked at again later.
    if (queued.length && !this.closed)
      this.retryTimer = setTimeout(() => this.schedule(), this.deps.retryMs ?? RETRY_MS);
    return false;
  }

  private loopback(): ReturnType<typeof Bun.serve> {
    this.server ??= Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      // Off: FFmpeg streams each sidecar as one upload for the whole run, and a sparse track
      // (PGS) sends nothing for minutes.
      idleTimeout: 0,
      maxRequestBodySize: 512 * 1024 * 1024,
      fetch: request => this.handle(request),
    });
    return this.server;
  }

  private async handle(request: Request): Promise<Response> {
    const [, token, name] = new URL(request.url).pathname.split('/');
    const job = this.job;
    if (!job || !token || token !== job.token || !name) return new Response(null, { status: 404 });
    if (request.method === 'GET' || request.method === 'HEAD') {
      if (name !== 'input') return new Response(null, { status: 404 });
      return this.deps.readSource(
        job.record.sourceId,
        job.record.filePath,
        request.headers.get('range') ?? undefined
      );
    }
    if (request.method !== 'PUT' && request.method !== 'POST')
      return new Response(null, { status: 405 });
    const body = request.arrayBuffer();
    let write: Promise<void>;
    if (job.sidecars.has(name)) {
      // A sidecar upload lasts until FFmpeg ends: queued, it would hold back every segment.
      write = body.then(async data => this.store(job, name, new Uint8Array(data)));
      const settled = write.catch(() => undefined);
      job.sidecarWrites.add(settled);
      void settled.then(() => job.sidecarWrites.delete(settled));
    } else {
      // Queued before the body is read, so uploads are stored in the order they arrived.
      write = job.writes.then(async () => this.store(job, name, new Uint8Array(await body)));
      job.writes = write.catch(() => undefined);
    }
    try {
      await write;
      return new Response(null, { status: 201 });
    } catch (error) {
      logger.warn('Remux', `Could not store remux file ${name}`, error);
      return new Response(null, { status: 500 });
    }
  }

  /** Keep an uploaded file: segments and sidecars encrypted; the playlist read. */
  private async store(job: Job, name: string, body: Uint8Array): Promise<void> {
    if (job.stopped) return;
    const { repository } = this.deps;
    if (name === PLAYLIST_NAME) {
      const { segments, ended } = parsePlaylist(new TextDecoder().decode(body));
      job.segments = segments;
      job.ended ||= ended;
      this.place(job);
      return;
    }
    const sidecar = job.sidecars.get(name);
    const kind = SEGMENT_PATTERN.test(name) ? 'segment' : sidecar ? 'sidecar' : null;
    if (!kind) throw new Error(`Unexpected remux file ${name}`);
    const path = join(job.dir, this.diskName(name));
    const encrypted = this.deps.encryption.encryptBuffer(body);
    await writeFile(`${path}.part`, encrypted);
    await rename(`${path}.part`, path);
    repository.addFile(job.record.id, {
      name,
      kind,
      size: encrypted.length,
      ...(sidecar ? { sidecar } : {}),
    });
    // FFmpeg uploads the playlist before the segment it adds: place it once both are here.
    if (kind === 'segment') this.place(job);
    if (kind === 'sidecar') this.emit(job.record.id);
  }

  /**
   * Give the playlist's segments their place, up to the first one not stored yet, so the served
   * playlist only lists stored segments, and record how many seconds are ready.
   */
  private place(job: Job): void {
    const { repository } = this.deps;
    let ready = 0;
    for (const [seq, segment] of job.segments.entries()) {
      const file = repository.file(job.record.id, segment.name);
      if (!file) break;
      if (file.seq !== seq || file.duration !== segment.duration)
        repository.placeSegment(job.record.id, segment.name, seq, segment.duration);
      ready += segment.duration;
    }
    repository.setProgress(job.record.id, ready);
    if (Date.now() - job.lastEvent >= PROGRESS_EVENT_MS) {
      job.lastEvent = Date.now();
      this.emit(job.record.id);
    }
  }

  private async run(record: RemuxRecord): Promise<void> {
    const { repository } = this.deps;
    const server = this.loopback();
    const job: Job = {
      record,
      token: randomBytes(16).toString('hex'),
      dir: this.dirOf(record),
      child: null,
      sidecars: new Map(
        record.plan.subtitles.map(track => {
          const sidecar = sidecarFor(track);
          return [sidecar.name, sidecar];
        })
      ),
      segments: [],
      ended: false,
      stopped: null,
      stderr: '',
      lastEvent: 0,
      writes: Promise.resolve(),
      sidecarWrites: new Set(),
    };
    this.job = job;
    try {
      await rm(job.dir, { recursive: true, force: true });
      await mkdir(job.dir, { recursive: true });
      repository.setState(record.id, 'running');
      this.emit(record.id);
      const base = `http://127.0.0.1:${server.port}/${job.token}`;
      const started = Date.now();
      logger.info('Remux', `Remuxing source ${record.sourceId} for the TV (${record.priority})`);
      const code = await new Promise<number | null>((resolve, reject) => {
        const child = spawn(
          this.deps.ffmpegPath ?? 'ffmpeg',
          remuxArgs(`${base}/input`, base, record.plan),
          { stdio: ['ignore', 'ignore', 'pipe'] }
        );
        job.child = child;
        if (child.pid)
          this.renice(child.pid, record.priority === 'watching' ? WATCHING_NICE : BACKGROUND_NICE);
        child.stderr?.on('data', (chunk: Buffer) => {
          job.stderr = (job.stderr + chunk.toString()).slice(-STDERR_TAIL);
        });
        child.on('error', reject);
        child.on('close', resolve);
      });
      await this.settle(job);
      if (job.stopped === 'drop') return;
      if (job.stopped === 'requeue') {
        await this.discard(record);
        return;
      }
      const problem =
        code === 0 ? this.verify(job) : `FFmpeg exited with ${code}: ${job.stderr.trim()}`;
      if (problem) {
        logger.warn('Remux', `Remux of source ${record.sourceId} failed: ${problem}`);
        await this.discard(record, problem);
      } else {
        repository.setState(record.id, 'complete');
        logger.info(
          'Remux',
          `Remuxed source ${record.sourceId} in ${Math.round((Date.now() - started) / 1000)}s`
        );
        this.emit(record.id);
      }
      await this.deps.storage.reconcileAllocation(record.sourceId).catch(() => undefined);
    } catch (error) {
      if (!job.stopped) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn('Remux', `Remux of source ${record.sourceId} failed: ${message}`);
        await this.discard(record, message).catch(() => undefined);
      }
    } finally {
      this.job = null;
    }
  }

  /**
   * Wait for the uploads FFmpeg sent before exiting: it does not wait for the last ones to be
   * received, so they can reach the loopback server after the process is gone.
   */
  private async settle(job: Job): Promise<void> {
    const deadline = Date.now() + SETTLE_MS;
    for (;;) {
      await Promise.all([job.writes, ...job.sidecarWrites]);
      if (job.stopped || Date.now() >= deadline) return;
      const names = new Set(this.deps.repository.files(job.record.id).map(file => file.name));
      const expected = [...job.segments.map(segment => segment.name), ...job.sidecars.keys()];
      if (expected.every(name => names.has(name))) return;
      await Bun.sleep(50);
    }
  }

  /** Why a finished remux is not complete, or null when it is. */
  private verify(job: Job): string | null {
    const files = this.deps.repository.files(job.record.id);
    const names = new Set(files.map(file => file.name));
    if (!job.ended) return 'The playlist was not closed';
    const missing = [...job.sidecars.keys()].filter(name => !names.has(name));
    if (missing.length) return `Missing subtitle files: ${missing.join(', ')}`;
    const segments = files.filter(file => file.kind === 'segment');
    if (!segments.length || segments.some(file => file.seq === null))
      return 'A segment is missing from the playlist';
    const record = this.deps.repository.findById(job.record.id);
    const expected = job.record.plan.durationSeconds;
    if (
      record &&
      expected > 0 &&
      Math.abs(record.readySeconds - expected) > DURATION_TOLERANCE_SECONDS
    )
      return `It lasts ${record.readySeconds.toFixed(1)}s instead of ${expected.toFixed(1)}s`;
    return null;
  }

  /** Delete a remux's files: queued again, or failed with `error`. */
  private async discard(record: RemuxRecord, error?: string): Promise<void> {
    await rm(this.dirOf(record), { recursive: true, force: true });
    if (!this.deps.repository.findById(record.id)) return;
    this.deps.repository.reset(record.id);
    if (error) this.deps.repository.setState(record.id, 'failed', error);
    this.emit(record.id);
  }

  /** A removed source takes its remuxes (rows cascade, files go with its directory). */
  private storageRemoved(storage: Storage): void {
    const job = this.job;
    if (job?.record.storageId !== storage.id) return;
    job.stopped = 'drop';
    job.child?.kill('SIGKILL');
  }
}
