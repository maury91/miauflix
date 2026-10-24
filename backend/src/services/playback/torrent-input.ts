import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import type { Socket } from 'node:net';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';

import type { DownloadService } from '@services/download/download.service';

import type { PlaybackTarget } from './playback-target';

/** ffprobe read budget: container headers fit in it, so a probe waits on few torrent pieces. */
export const PROBE_SIZE_BYTES = 2 * 1024 * 1024;

/** A private loopback capability exposes only this file; no arbitrary URLs or plaintext files. */
export async function openTorrentInput(
  downloadService: DownloadService,
  target: PlaybackTarget,
  speculative = false
) {
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
      const result = await downloadService.streamFile(target, range, speculative);
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
