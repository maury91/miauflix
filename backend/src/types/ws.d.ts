declare module 'ws' {
  import { EventEmitter } from 'node:events';
  import type { IncomingMessage } from 'node:http';
  import type { Duplex } from 'node:stream';

  export default class WebSocket extends EventEmitter {
    static readonly OPEN: number;
    readonly readyState: number;
    send(data: string): void;
    close(code?: number, reason?: string): void;
  }

  export class WebSocketServer extends EventEmitter {
    constructor(options: { noServer: boolean; maxPayload?: number });
    handleUpgrade(
      request: IncomingMessage,
      socket: Duplex,
      head: Buffer,
      callback: (client: WebSocket) => void
    ): void;
    close(callback?: (error?: Error) => void): void;
  }
}
