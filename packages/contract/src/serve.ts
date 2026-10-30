import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';

import { CONTROL_PATH } from './protocol.js';
import type { ConnectionHandler, Service } from './service.js';

export interface ServeOptions {
  hostname?: string;
  port: number;
  /** Handles HTTP requests the service does not (anything but `/health` and `/_b/*`). */
  fallback?: (request: Request) => Response | Promise<Response>;
}

export interface RunningServer {
  readonly port: number;
  stop(): Promise<void>;
}

const MAX_FRAME_BYTES = 16 * 1024 * 1024;

const handleHttp = (service: Service, options: ServeOptions, request: Request) => {
  const path = new URL(request.url).pathname;
  if (options.fallback && path !== '/health' && !path.startsWith('/_b/'))
    return options.fallback(request);
  return service.fetch(request);
};

/** Serves a service standalone on the current runtime (Bun or Node). */
export const serve = (service: Service, options: ServeOptions): Promise<RunningServer> =>
  'Bun' in globalThis ? serveBun(service, options) : serveNode(service, options);

/* ---------- Bun ---------- */

type BunSocket = {
  data: { session?: ConnectionHandler };
  send(data: string | Uint8Array): number;
  close(code?: number, reason?: string): void;
};

type BunServer = {
  port: number;
  stop(closeActive?: boolean): Promise<void> | void;
  upgrade(req: Request, options: { data: object }): boolean;
};

const serveBun = async (service: Service, options: ServeOptions): Promise<RunningServer> => {
  const bun = (globalThis as unknown as { Bun: { serve(config: object): BunServer } }).Bun;
  const server = bun.serve({
    hostname: options.hostname,
    port: options.port,
    // Byte streams may wait for data (a torrent piece) longer than the default 10 s.
    idleTimeout: 255,
    fetch(request: Request, srv: BunServer) {
      if (new URL(request.url).pathname === CONTROL_PATH) {
        if (srv.upgrade(request, { data: {} })) return undefined;
        return new Response('WebSocket upgrade required', { status: 426 });
      }
      return handleHttp(service, options, request);
    },
    websocket: {
      maxPayloadLength: MAX_FRAME_BYTES,
      idleTimeout: 120,
      open(ws: BunSocket) {
        ws.data.session = service.accept({
          send: data => void ws.send(data),
          close: (code, reason) => ws.close(code, reason),
        });
      },
      message(ws: BunSocket, message: string | Uint8Array) {
        ws.data.session?.onMessage(message);
      },
      close(ws: BunSocket) {
        ws.data.session?.onClose();
      },
    },
  });
  return {
    port: server.port,
    stop: async () => {
      await server.stop(true);
      await service.stop();
    },
  };
};

/* ---------- Node ---------- */

const toRequest = (req: IncomingMessage, res: ServerResponse): Request => {
  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableFinished) controller.abort();
  });
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) for (const item of value) headers.append(key, item);
    else if (value !== undefined) headers.set(key, value);
  }
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  return new Request(`http://${req.headers.host ?? 'localhost'}${req.url ?? '/'}`, {
    method: req.method,
    headers,
    signal: controller.signal,
    ...(hasBody ? { body: Readable.toWeb(req) as ReadableStream, duplex: 'half' } : {}),
  } as RequestInit);
};

/** Writes a fetch `Response` to a Node response, streaming the body untouched. */
export const writeResponse = async (response: Response, res: ServerResponse): Promise<void> => {
  const headers: Record<string, string | string[]> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });
  res.writeHead(response.status, headers);
  if (!response.body) {
    res.end();
    return;
  }
  const body = Readable.fromWeb(response.body as NodeReadableStream);
  res.on('close', () => body.destroy());
  body.on('error', () => res.destroy());
  body.pipe(res);
};

const serveNode = async (service: Service, options: ServeOptions): Promise<RunningServer> => {
  const { WebSocketServer } = await import('ws');
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME_BYTES });

  const server = createServer((req, res) => {
    void (async () => {
      try {
        await writeResponse(await handleHttp(service, options, toRequest(req, res)), res);
      } catch {
        if (!res.headersSent) res.writeHead(500).end();
        else res.destroy();
      }
    })();
  });
  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (new URL(req.url ?? '/', 'http://localhost').pathname !== CONTROL_PATH) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, ws => {
      const session = service.accept({
        send: data => ws.send(data),
        close: (code, reason) => ws.close(code, reason),
      });
      ws.on('message', (data, isBinary) => {
        const buffer = Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as ArrayBuffer);
        session.onMessage(isBinary ? new Uint8Array(buffer) : buffer.toString('utf8'));
      });
      ws.on('close', () => session.onClose());
      ws.on('error', () => ws.terminate());
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, options.hostname, () => resolve());
  });
  const address = server.address();
  return {
    port: typeof address === 'object' && address ? address.port : options.port,
    stop: async () => {
      for (const client of wss.clients) client.terminate();
      const closed = new Promise<void>(resolve => server.close(() => resolve()));
      server.closeAllConnections();
      await closed;
      await service.stop();
    },
  };
};
