import { type ChildProcess, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import type { Socket } from 'node:net';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';

import type { MovieSource } from '@entities/movie-source.entity';
import type { DownloadService } from '@services/download/download.service';

import { FragmentedMp4Timeline } from './fragmented-mp4';

export interface PlaybackAudioTrack {
  index: number;
  language: string | null;
  title: string | null;
  codec: string | null;
  channels: number | null;
  isDefault: boolean;
}

export interface PlaybackDelivery {
  mode: 'audio-transcode' | 'direct';
  audioCodec: string | null;
  durationSeconds: number;
  mimeType: string;
  audioTracks?: PlaybackAudioTrack[];
  defaultAudioTrackIndex?: number;
}

export class AudioPlaybackError extends Error {
  constructor(
    message: string,
    readonly status: 422 | 503 = 503
  ) {
    super(message);
  }
}

interface ProbeResult {
  format?: { duration?: string };
  streams?: Array<{
    codec_type?: string;
    codec_name?: string;
    extradata?: string;
    channels?: number;
    tags?: { language?: string; title?: string };
    disposition?: { default?: number };
  }>;
}

/** Inspect actual streams and expose selectable audio tracks without changing video. */
export function deliveryFromProbe(probe: ProbeResult): PlaybackDelivery {
  const video = probe.streams?.find(stream => stream.codec_type === 'video');
  const audioTracks = (probe.streams ?? [])
    .filter(stream => stream.codec_type === 'audio')
    .map((stream, index) => ({
      index,
      language: stream.tags?.language ?? null,
      title: stream.tags?.title ?? null,
      codec: stream.codec_name ?? null,
      channels: stream.channels ?? null,
      isDefault: stream.disposition?.default === 1,
    }));
  const defaultAudioTrackIndex = audioTracks.find(track => track.isDefault)?.index ?? 0;
  const audio = audioTracks[defaultAudioTrackIndex];
  const durationSeconds = Number(probe.format?.duration);
  if (!video || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new AudioPlaybackError('The selected source has no usable video duration.', 422);
  }
  const audioCodec = audio?.codec ?? null;
  const compatible = !audio || ['aac', 'mp3', 'opus', 'vorbis', 'flac'].includes(audioCodec ?? '');
  const selectionRequiresConversion = video.codec_name === 'h264' && audioTracks.length > 1;
  if (compatible && !selectionRequiresConversion)
    return {
      mode: 'direct',
      audioCodec,
      durationSeconds,
      mimeType: '',
      audioTracks,
      defaultAudioTrackIndex,
    };
  if (video.codec_name !== 'h264') {
    throw new AudioPlaybackError('Audio conversion requires an H.264 video source.', 422);
  }
  // Matroska H.264 CodecPrivate is an AVCDecoderConfigurationRecord. Use the actual
  // profile/constraints/level so the browser can reject unsupported video explicitly.
  const avc = video.extradata?.match(/00000000:\s+([\da-f ]+)/i)?.[1].replace(/\s/g, '');
  if (!avc?.startsWith('01') || avc.length < 8) {
    throw new AudioPlaybackError('The selected source has no usable H.264 configuration.', 422);
  }
  return {
    mode: 'audio-transcode',
    audioCodec,
    audioTracks,
    defaultAudioTrackIndex,
    durationSeconds,
    mimeType: `video/mp4; codecs="avc1.${avc.slice(2, 8)}, mp4a.40.2"`,
  };
}

export function audioConversionArgs(
  input: string,
  startSeconds: number,
  audioTrackIndex = 0
): string[] {
  return [
    '-nostdin',
    '-v',
    'error',
    '-rw_timeout',
    '60000000',
    '-protocol_whitelist',
    'http,tcp',
    '-format_whitelist',
    'matroska,webm,mov,avi,asf,flv,ogg,mp3',
    '-ss',
    String(startSeconds),
    '-noaccurate_seek',
    '-copyts',
    '-start_at_zero',
    '-i',
    input,
    '-map',
    '0:v:0',
    '-map',
    `0:a:${audioTrackIndex}`,
    '-c:v',
    'copy',
    '-c:a',
    'aac',
    '-ac',
    '2',
    '-b:a',
    '192k',
    '-threads',
    '1',
    '-avoid_negative_ts',
    'disabled',
    // delay_moov preserves the original clock; empty_moov would reset every seek to zero.
    '-movflags',
    'delay_moov+frag_keyframe+default_base_moof',
    '-f',
    'mp4',
    'pipe:1',
  ];
}

interface ConversionJob {
  controller: AbortController;
  done: Promise<void>;
}

/** Bounded, disk-free audio conversion over the existing decrypted torrent range reader. */
export class AudioPlaybackService {
  private readonly probes = new Map<
    number,
    { expires: number; value: Promise<PlaybackDelivery> }
  >();
  private readonly jobs = new Map<string, ConversionJob>();
  private readonly processes = new Set<ChildProcess>();
  private closed = false;

  constructor(private readonly downloadService: DownloadService) {}

  async inspect(source: MovieSource): Promise<PlaybackDelivery> {
    if (this.closed) throw new AudioPlaybackError('Audio playback is shutting down.');
    const cached = this.probes.get(source.id);
    if (cached && cached.expires > Date.now()) return cached.value;
    if (this.probes.size >= 64) {
      for (const [id, entry] of this.probes)
        if (entry.expires <= Date.now()) this.probes.delete(id);
      if (this.probes.size >= 64) this.probes.delete(this.probes.keys().next().value!);
    }
    const value = this.probe(source).catch(error => {
      if (this.probes.get(source.id)?.value === value) this.probes.delete(source.id);
      throw error;
    });
    this.probes.set(source.id, { expires: Date.now() + 15 * 60_000, value });
    return value;
  }

  private async probe(source: MovieSource): Promise<PlaybackDelivery> {
    const input = await this.openInput(source);
    try {
      if (this.closed || this.processes.size >= 4)
        throw new AudioPlaybackError('Audio preparation is busy. Retry shortly.');
      const child = spawn(
        'ffprobe',
        [
          '-v',
          'error',
          '-rw_timeout',
          '30000000',
          '-protocol_whitelist',
          'http,tcp',
          '-format_whitelist',
          'matroska,webm,mov,avi,asf,flv,ogg,mp3',
          '-show_streams',
          '-show_format',
          '-show_data',
          '-show_entries',
          'stream=codec_type,codec_name,extradata,channels:stream_tags=language,title:stream_disposition=default:format=duration',
          '-of',
          'json',
          input.url,
        ],
        { stdio: ['ignore', 'pipe', 'pipe'] }
      );
      this.processes.add(child);
      let body = '';
      child.stdout.on('data', chunk => {
        body += chunk.toString();
        if (body.length > 1024 * 1024) child.kill('SIGKILL');
      });
      child.stderr.resume();
      const timeout = setTimeout(() => child.kill('SIGKILL'), 45_000);
      timeout.unref();
      try {
        await new Promise<void>((resolve, reject) => {
          child.once('error', () =>
            reject(new AudioPlaybackError('FFmpeg is unavailable. Install FFmpeg on the backend.'))
          );
          child.once('close', code =>
            code === 0
              ? resolve()
              : reject(
                  new AudioPlaybackError('The source audio could not be inspected. Retry playback.')
                )
          );
        });
        return deliveryFromProbe(JSON.parse(body) as ProbeResult);
      } finally {
        clearTimeout(timeout);
        this.processes.delete(child);
      }
    } finally {
      await input.close();
    }
  }

  async stream(
    source: MovieSource,
    owner: string,
    startSeconds: number,
    expiresAt: Date,
    signal: AbortSignal,
    audioTrackIndex?: number
  ): Promise<Response> {
    const delivery = await this.inspect(source);
    if (delivery.mode !== 'audio-transcode')
      throw new AudioPlaybackError('This source does not require audio conversion.', 422);
    if (
      !Number.isFinite(startSeconds) ||
      startSeconds < 0 ||
      startSeconds >= delivery.durationSeconds
    ) {
      throw new AudioPlaybackError('The requested playback position is outside the movie.', 422);
    }
    const selectedAudioTrack = audioTrackIndex ?? delivery.defaultAudioTrackIndex ?? 0;
    if (
      !Number.isInteger(selectedAudioTrack) ||
      !delivery.audioTracks?.some(track => track.index === selectedAudioTrack)
    ) {
      throw new AudioPlaybackError('The requested audio track is unavailable.', 422);
    }
    const previous = this.jobs.get(owner);
    previous?.controller.abort();
    const controller = new AbortController();
    let resolveDone!: () => void;
    const done = new Promise<void>(resolve => {
      resolveDone = resolve;
    });
    const job = { controller, done };
    this.jobs.set(owner, job);
    const abort = () => controller.abort();
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    let input: Awaited<ReturnType<AudioPlaybackService['openInput']>> | undefined;
    let child: ReturnType<typeof spawn> | undefined;
    let timeline: FragmentedMp4Timeline | undefined;
    let expiry: ReturnType<typeof setTimeout> | undefined;
    let killTimeout: ReturnType<typeof setTimeout> | undefined;
    let preparationTimeout: ReturnType<typeof setTimeout> | undefined;
    let cleaning: Promise<void> | undefined;
    const cleanup = (): Promise<void> =>
      (cleaning ??= (async () => {
        signal.removeEventListener('abort', abort);
        if (expiry) clearTimeout(expiry);
        if (preparationTimeout) clearTimeout(preparationTimeout);
        timeline?.destroy();
        if (child && child.exitCode === null && child.signalCode === null) {
          const stopped = new Promise<void>(resolve => child!.once('close', () => resolve()));
          child.kill('SIGTERM');
          killTimeout = setTimeout(() => child?.kill('SIGKILL'), 2000);
          killTimeout.unref();
          // Wake blocked pipe/network I/O instead of waiting for the input timeout.
          child.stdout?.destroy();
          await input?.close();
          await stopped;
        }
        if (killTimeout) clearTimeout(killTimeout);
        if (child) this.processes.delete(child);
        await input?.close();
        if (this.jobs.get(owner) === job) this.jobs.delete(owner);
        resolveDone();
      })());
    try {
      await previous?.done;
      if (controller.signal.aborted)
        throw new AudioPlaybackError('Audio preparation was cancelled.');
      if (this.closed || this.jobs.size > 2 || this.processes.size >= 4) {
        throw new AudioPlaybackError('Audio conversion is busy. Retry shortly.');
      }
      input = await this.openInput(source);
      if (controller.signal.aborted)
        throw new AudioPlaybackError('Audio preparation was cancelled.');
      child = spawn('ffmpeg', audioConversionArgs(input.url, startSeconds, selectedAudioTrack), {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      this.processes.add(child);
      child.stderr!.resume();
      controller.signal.addEventListener(
        'abort',
        () => {
          void cleanup();
        },
        { once: true }
      );
      expiry = setTimeout(abort, Math.max(1, expiresAt.getTime() - Date.now()));
      expiry.unref();
      const running = child;
      const exited = new Promise<number | null>(resolve =>
        running.once('close', code => resolve(code))
      );
      // Do not send a 200 response until the muxer has produced a usable output header.
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(
            new AudioPlaybackError(
              'Audio conversion timed out waiting for source data. Retry playback.'
            )
          );
          abort();
        }, 45_000);
        const finish = (error?: Error) => {
          clearTimeout(timeout);
          running.stdout!.removeListener('readable', readable);
          running.removeListener('error', failed);
          running.removeListener('close', closed);
          controller.signal.removeEventListener('abort', cancelled);
          if (error) reject(error);
          else resolve();
        };
        const readable = () => finish();
        const failed = () =>
          finish(new AudioPlaybackError('FFmpeg is unavailable. Install FFmpeg on the backend.'));
        const closed = () =>
          finish(
            new AudioPlaybackError('The source audio could not be converted. Retry playback.')
          );
        const cancelled = () => finish(new AudioPlaybackError('Audio preparation was cancelled.'));
        running.stdout!.once('readable', readable);
        running.once('error', failed);
        running.once('close', closed);
        controller.signal.addEventListener('abort', cancelled, { once: true });
      });
      timeline = new FragmentedMp4Timeline();
      preparationTimeout = setTimeout(abort, 45_000);
      preparationTimeout.unref();
      // Consume errors even if initialization fails before the response is returned.
      timeline.on('error', () => abort());
      running.stdout!.pipe(timeline);
      const timestampOffset = await timeline.initialized;
      clearTimeout(preparationTimeout);
      const iterator = timeline[Symbol.asyncIterator]();
      let cancelled = false;
      const body = new ReadableStream<Uint8Array>({
        async pull(output) {
          try {
            const next = await iterator.next();
            if (cancelled) return;
            if (next.done) {
              const code = await exited;
              if (code !== 0 || controller.signal.aborted)
                throw new Error('Audio conversion stopped before completion.');
              output.close();
              await cleanup();
            } else output.enqueue(next.value);
          } catch (error) {
            if (!cancelled) output.error(error);
            await cleanup();
          }
        },
        async cancel() {
          cancelled = true;
          abort();
          await cleanup();
          await iterator.return?.().catch(() => undefined);
        },
      });
      return new Response(body, {
        headers: {
          'Content-Type': 'video/mp4',
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
          'X-Playback-Timestamp-Offset': String(timestampOffset),
          'Access-Control-Expose-Headers': 'X-Playback-Timestamp-Offset',
        },
      });
    } catch (error) {
      await cleanup();
      throw error;
    }
  }

  /** A private loopback capability exposes only this source; no arbitrary URLs or plaintext files. */
  private async openInput(source: MovieSource) {
    const path = `/${randomBytes(24).toString('hex')}`;
    const sockets = new Set<Socket>();
    const server = createServer(async (request, response) => {
      if (request.url !== path || !['GET', 'HEAD'].includes(request.method ?? '')) {
        response.writeHead(404).end();
        return;
      }
      const range = request.headers.range;
      if (range && !/^bytes=\d+-\d*$/.test(range)) {
        response.writeHead(416).end();
        return;
      }
      try {
        const result = await this.downloadService.streamFile(source, range);
        if (response.destroyed || request.method === 'HEAD') {
          if (!response.destroyed) {
            result.headers.forEach((value, key) => response.setHeader(key, value));
            response.writeHead(result.status).end();
          }
          await result.body?.cancel();
          return;
        }
        result.headers.forEach((value, key) => response.setHeader(key, value));
        response.writeHead(result.status);
        if (!result.body) {
          response.end();
          return;
        }
        const readable = Readable.fromWeb(result.body as NodeReadableStream<Uint8Array>);
        response.once('close', () => readable.destroy());
        await pipeline(readable, response);
      } catch {
        if (!response.headersSent) response.writeHead(503).end();
        else response.destroy();
      }
    });
    server.on('connection', socket => {
      sockets.add(socket);
      socket.once('close', () => sockets.delete(socket));
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        server.removeListener('error', reject);
        resolve();
      });
    });
    const address = server.address() as { port: number };
    let closePromise: Promise<void> | undefined;
    return {
      url: `http://127.0.0.1:${address.port}${path}`,
      close: () =>
        (closePromise ??= new Promise<void>(resolve => {
          for (const socket of sockets) socket.destroy();
          server.close(() => resolve());
        })),
    };
  }

  async close(): Promise<void> {
    this.closed = true;
    for (const job of this.jobs.values()) job.controller.abort();
    for (const child of this.processes) child.kill('SIGKILL');
    await Promise.all([...this.jobs.values()].map(job => job.done));
    this.probes.clear();
  }
}
