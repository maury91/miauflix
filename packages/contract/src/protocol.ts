/**
 * Control-plane frames, sent as JSON arrays `[type, id, ...]` over one WebSocket per connection.
 * Binary call results travel as a binary message: `[u8 type][u32 id, big endian][payload]`.
 */
export const PROTOCOL_VERSION = 3;
export const CONTROL_PATH = '/_c';
export const BYTES_PATH = '/_b/';

export const F = {
  /** S→C `[0, 0, ServiceHello]` */
  hello: 0,
  /** C→S `[1, 0, { token?, ticketKey? }]` */
  init: 1,
  /** C→S `[2, id, method, input]` */
  call: 2,
  /** S→C `[3, id, output]` */
  ok: 3,
  /** S→C `[4, id, code, message]` */
  err: 4,
  /** S→C `[5, id, item]` */
  item: 5,
  /** S→C `[6, id]` */
  end: 6,
  /** C→S `[7, id]` aborts a call, stream or subscription */
  cancel: 7,
  /** C→S `[8, id, n]` lets the service send n more stream items */
  credit: 8,
  /** C→S `[9, id, method, filter]` */
  sub: 9,
  /** S→C `[10, id, payload]` */
  event: 10,
  /** S→C `[11, 0]` the connection is authorized and ready */
  ready: 11,
  /** both ways `[12]` */
  ping: 12,
  /** both ways `[13]` */
  pong: 13,
} as const;

export type Frame = [type: number, id?: number, a?: unknown, b?: unknown];

/** Stream items the client grants up front, and the batch it tops up with. */
export const STREAM_WINDOW = 64;
export const HEARTBEAT_MS = 20_000;
export const HEARTBEAT_TIMEOUT_MS = 60_000;

export const encodeBinary = (type: number, id: number, payload: Uint8Array): Uint8Array => {
  const out = new Uint8Array(5 + payload.byteLength);
  const view = new DataView(out.buffer);
  view.setUint8(0, type);
  view.setUint32(1, id);
  out.set(payload, 5);
  return out;
};

export const decodeBinary = (
  data: Uint8Array
): { type: number; id: number; payload: Uint8Array } => {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return { type: view.getUint8(0), id: view.getUint32(1), payload: data.subarray(5) };
};

export const toBytes = (data: ArrayBuffer | ArrayBufferView): Uint8Array =>
  data instanceof Uint8Array
    ? data
    : ArrayBuffer.isView(data)
      ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
      : new Uint8Array(data);
