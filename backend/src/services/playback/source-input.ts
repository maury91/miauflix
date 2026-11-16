import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import type { Socket } from 'node:net';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';

import type { MediaLoadClientService } from '@services/media-load/media-load-client.service';

import type { PlaybackTarget } from './playback-target';

/** ffprobe read budget: container headers fit in it, so a probe waits on few torrent pieces. */
export const PROBE_SIZE_BYTES = 2 * 1024 * 1024;

/**
 * Whether the reader's latest request waits for the file's bytes (`waiting`: they are still being
 * downloaded) or receives them (`flowing`).
 */
export type SourceReadState = 'flowing' | 'waiting';

/** A body that sends nothing for this long between reads is waiting on the download again. */
export const SOURCE_STALL_MS = 1000;

/** A private loopback capability exposes only this file; no arbitrary URLs or plaintext files. */
export async function openSourceInput(
  mediaLoad: MediaLoadClientService,
  target: PlaybackTarget,
  speculative = false,
  onRead?: (state: SourceReadState) => void,
  stallMs = SOURCE_STALL_MS
) {
  const path = `/${randomBytes(24).toString('hex')}`;
  const sockets = new Set<Socket>();
  /** Only the latest request speaks for the reader: an earlier one may still be draining. */
  let latestRequest = 0;
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
    const requestNumber = ++latestRequest;
    onRead?.('waiting');
    try {
      const result = await mediaLoad.streamFile(target, range, speculative);
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
      const stopTracking = onRead
        ? trackReads(readable, stallMs, state => {
            if (requestNumber === latestRequest) onRead(state);
          })
        : undefined;
      response.once('close', () => readable.destroy());
      try {
        await pipeline(readable, response);
      } finally {
        stopTracking?.();
      }
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

/**
 * Reports `flowing` when bytes arrive and `waiting` when the body then sends nothing for `stallMs`
 * (the next bytes are still being downloaded), each only on a change. A body held back by its
 * consumer (paused by backpressure, or with bytes already buffered) is not stalled.
 */
function trackReads(
  readable: Readable,
  stallMs: number,
  report: (state: SourceReadState) => void
): () => void {
  let state: SourceReadState = 'waiting';
  let timer: ReturnType<typeof setTimeout> | undefined;
  const set = (next: SourceReadState) => {
    if (next === state) return;
    state = next;
    report(next);
  };
  const watch = () => {
    timer = setTimeout(() => {
      timer = undefined;
      if (readable.destroyed || readable.readableEnded) return;
      if (readable.readableFlowing === false || readable.readableLength > 0) watch();
      else set('waiting');
    }, stallMs);
    timer.unref?.();
  };
  const onData = () => {
    set('flowing');
    if (timer !== undefined) clearTimeout(timer);
    watch();
  };
  readable.on('data', onData);
  return () => {
    readable.off('data', onData);
    if (timer !== undefined) clearTimeout(timer);
  };
}
