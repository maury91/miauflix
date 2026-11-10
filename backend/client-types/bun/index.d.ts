/**
 * The parts of Bun's API the backend uses, for the client type build only (tsconfig.client.json):
 * its type bundler fails on `bun-types`. The client types never expose these.
 */
declare module 'bun' {
  export const password: {
    hash(
      password: string | Uint8Array,
      options: { algorithm: 'bcrypt'; cost: number }
    ): Promise<string>;
    verify(password: string | Uint8Array, hash: string): Promise<boolean>;
  };

  export interface ServerWebSocket<T> {
    data: T;
    readonly readyState: number;
    send(data: string): number;
    close(code?: number, reason?: string): void;
  }

  export interface WebSocketHandler<T> {
    maxPayloadLength?: number;
    open?(socket: ServerWebSocket<T>): void | Promise<void>;
    message(socket: ServerWebSocket<T>, message: string | Buffer): void | Promise<void>;
    close?(socket: ServerWebSocket<T>, code: number, reason: string): void | Promise<void>;
  }

  export interface Server<T> {
    upgrade(request: Request, options?: { data?: T }): boolean;
  }
}
