import { implementedMinor, requestSignal, type Transport } from './client.js';
import { ContractError } from './errors.js';
import { type ServiceHello, type ServiceStatus, STATUS_CHANGED } from './management.js';
import {
  CONTROL_PATH,
  decodeBinary,
  F,
  type Frame,
  HEARTBEAT_MS,
  HEARTBEAT_TIMEOUT_MS,
  PROTOCOL_VERSION,
  STREAM_WINDOW,
  toBytes,
} from './protocol.js';
import { signedBytesPath } from './tickets.js';
import type { SubscribeOptions } from './types.js';

export interface ConnectOptions {
  /** Service origin, e.g. `http://catalog:3001`. */
  url: string | (() => string);
  token?: string;
  /** Key for `bytes` URLs; sent to the service on every connection. */
  ticketKey?: string;
  /** Default timeout for calls. */
  timeoutMs?: number | (() => number);
  /** Defaults to the global `WebSocket` (Bun, Node 22+). */
  WebSocket?: typeof WebSocket;
}

export type ConnectionState = 'connecting' | 'ready' | 'closed';

export interface RemoteConnection {
  readonly transport: Transport;
  readonly state: ConnectionState;
  /** The service's hello of the current connection. */
  readonly hello: ServiceHello | null;
  /** Last status pushed by the service (null until the first one). */
  readonly status: ServiceStatus | null;
  onState(listener: (state: ConnectionState, error?: Error) => void): () => void;
  onStatus(listener: (status: ServiceStatus) => void): () => void;
  /** Resolves once the connection is ready (rejects after `timeoutMs`). */
  ready(timeoutMs?: number): Promise<void>;
  /** Drops the socket and connects again (for example after the URL changed). */
  reconnect(): void;
  close(): void;
}

type PendingCall = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  cleanup: () => void;
};

type StreamState = {
  queue: unknown[];
  done: boolean;
  error: Error | null;
  wake: (() => void) | null;
};

type Subscription = {
  method: string;
  listener: (payload: unknown) => void;
  options?: SubscribeOptions<unknown>;
  wireId: number | null;
  attachedBefore: boolean;
};

const unavailable = () => new ContractError('unavailable', 'Service is not connected');

/** Remote transport: one multiplexed WebSocket with reconnect, heartbeat and re-subscription. */
export const connect = (options: ConnectOptions): RemoteConnection => {
  const Socket = options.WebSocket ?? globalThis.WebSocket;
  const resolveUrl = () => (typeof options.url === 'function' ? options.url() : options.url);
  const defaultTimeout = () =>
    typeof options.timeoutMs === 'function' ? options.timeoutMs() : options.timeoutMs;

  let socket: WebSocket | null = null;
  let state: ConnectionState = 'connecting';
  let hello: ServiceHello | null = null;
  let status: ServiceStatus | null = null;
  let closedByUser = false;
  let retryMs = 500;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let lastSeen = 0;
  let nextId = 1;

  const calls = new Map<number, PendingCall>();
  const streams = new Map<number, StreamState>();
  const subscriptions = new Set<Subscription>();
  const subscriptionsByWireId = new Map<number, Subscription>();
  const stateListeners = new Set<(state: ConnectionState, error?: Error) => void>();
  const statusListeners = new Set<(status: ServiceStatus) => void>();

  const setState = (next: ConnectionState, error?: Error) => {
    if (state === next) return;
    state = next;
    for (const listener of stateListeners) listener(next, error);
  };

  const send = (frame: Frame): boolean => {
    if (!socket || socket.readyState !== 1) return false;
    socket.send(JSON.stringify(frame));
    return true;
  };

  const attach = (subscription: Subscription) => {
    if (state !== 'ready' || subscription.wireId !== null) return;
    const id = nextId++;
    subscription.wireId = id;
    subscriptionsByWireId.set(id, subscription);
    send([F.sub, id, subscription.method, subscription.options?.filter ?? null]);
    if (subscription.attachedBefore) subscription.options?.onResync?.();
    subscription.attachedBefore = true;
  };

  const detach = (subscription: Subscription, notify: boolean) => {
    if (subscription.wireId === null) return;
    subscriptionsByWireId.delete(subscription.wireId);
    if (notify) send([F.cancel, subscription.wireId]);
    subscription.wireId = null;
  };

  // Management status, followed internally to re-attach subscriptions when the service is ready.
  const statusSubscription: Subscription = {
    method: STATUS_CHANGED,
    listener: payload => {
      status = payload as ServiceStatus;
      for (const listener of statusListeners) listener(status);
      // Leaving `ready` drops the data plane: detach, so `ready` re-attaches with a resync.
      for (const subscription of subscriptions)
        if (status.state === 'ready') attach(subscription);
        else detach(subscription, true);
    },
    wireId: null,
    attachedBefore: false,
  };

  const failAll = (error: Error) => {
    for (const pending of calls.values()) {
      pending.cleanup();
      pending.reject(error);
    }
    calls.clear();
    for (const stream of streams.values()) {
      stream.error = error;
      stream.wake?.();
    }
    streams.clear();
    subscriptionsByWireId.clear();
    statusSubscription.wireId = null;
    for (const subscription of subscriptions) subscription.wireId = null;
  };

  const onFrame = (frame: Frame) => {
    const [type, id = 0, a, b] = frame;
    switch (type) {
      case F.hello: {
        const info = a as ServiceHello;
        if (info.protocol !== PROTOCOL_VERSION) {
          socket?.close(4400, 'Unsupported protocol');
          return;
        }
        hello = info;
        send([F.init, 0, { token: options.token, ticketKey: options.ticketKey }]);
        return;
      }
      case F.ready:
        retryMs = 500;
        setState('ready');
        attach(statusSubscription);
        for (const subscription of subscriptions) attach(subscription);
        return;
      case F.ping:
        send([F.pong]);
        return;
      case F.ok: {
        const pending = calls.get(id);
        if (!pending) return;
        calls.delete(id);
        pending.cleanup();
        pending.resolve(a);
        return;
      }
      case F.err: {
        const error = new ContractError(String(a), String(b ?? a));
        const pending = calls.get(id);
        if (pending) {
          calls.delete(id);
          pending.cleanup();
          pending.reject(error);
          return;
        }
        const stream = streams.get(id);
        if (stream) {
          stream.error = error;
          stream.wake?.();
          return;
        }
        // A rejected subscription waits for the next `ready` status.
        const subscription = subscriptionsByWireId.get(id);
        if (subscription) {
          subscriptionsByWireId.delete(id);
          subscription.wireId = null;
        }
        return;
      }
      case F.item: {
        const stream = streams.get(id);
        if (!stream) return;
        stream.queue.push(a);
        stream.wake?.();
        return;
      }
      case F.end: {
        const stream = streams.get(id);
        if (!stream) return;
        stream.done = true;
        stream.wake?.();
        return;
      }
      case F.event:
        if (id === statusSubscription.wireId) statusSubscription.listener(a);
        else subscriptionsByWireId.get(id)?.listener(a);
        return;
    }
  };

  const scheduleReconnect = () => {
    if (closedByUser || retryTimer) return;
    const delay = retryMs + Math.floor(Math.random() * 250);
    retryMs = Math.min(8_000, retryMs * 2);
    retryTimer = setTimeout(() => {
      retryTimer = null;
      open();
    }, delay);
  };

  function open() {
    if (closedByUser) return;
    setState('connecting');
    let url: URL;
    try {
      url = new URL(CONTROL_PATH, `${resolveUrl().replace(/\/+$/, '')}/`);
    } catch (error) {
      setState('closed', error as Error);
      scheduleReconnect();
      return;
    }
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new Socket(url.href);
    ws.binaryType = 'arraybuffer';
    socket = ws;
    lastSeen = Date.now();

    ws.onmessage = event => {
      if (socket !== ws) return;
      lastSeen = Date.now();
      if (typeof event.data === 'string') {
        let frame: Frame;
        try {
          frame = JSON.parse(event.data) as Frame;
        } catch {
          return;
        }
        if (Array.isArray(frame)) onFrame(frame);
        return;
      }
      const { type, id, payload } = decodeBinary(toBytes(event.data as ArrayBuffer));
      if (type === F.ok) onFrame([F.ok, id, payload]);
    };
    ws.onclose = event => {
      if (socket !== ws) return;
      socket = null;
      if (heartbeat) clearInterval(heartbeat);
      heartbeat = null;
      const error = new Error(
        `Connection closed (${event.code}${event.reason ? `: ${event.reason}` : ''})`
      );
      failAll(unavailable());
      setState('closed', error);
      scheduleReconnect();
    };
    ws.onerror = () => {
      // onclose follows and handles the retry.
    };
    heartbeat = setInterval(() => {
      if (Date.now() - lastSeen > HEARTBEAT_TIMEOUT_MS) ws.close(4408, 'Heartbeat timeout');
      else send([F.ping]);
    }, HEARTBEAT_MS);
    (heartbeat as { unref?: () => void }).unref?.();
  }

  const httpBase = () => resolveUrl().replace(/\/+$/, '');

  const transport: Transport = {
    call(method, input, requestOptions) {
      if (state !== 'ready') return Promise.reject(unavailable());
      const id = nextId++;
      const request = requestSignal(
        requestOptions?.signal,
        requestOptions?.timeoutMs ?? defaultTimeout()
      );
      return new Promise((resolve, reject) => {
        const onAbort = () => {
          if (!calls.delete(id)) return;
          send([F.cancel, id]);
          request.cleanup();
          reject(
            new ContractError(
              request.timedOut() ? 'timeout' : 'cancelled',
              request.timedOut() ? `${method} timed out` : `${method} was cancelled`
            )
          );
        };
        request.signal.addEventListener('abort', onAbort, { once: true });
        calls.set(id, {
          resolve,
          reject,
          cleanup: () => {
            request.signal.removeEventListener('abort', onAbort);
            request.cleanup();
          },
        });
        if (!send([F.call, id, method, input ?? null])) {
          calls.get(id)?.cleanup();
          calls.delete(id);
          reject(unavailable());
        }
      });
    },

    stream(method, input, streamOptions) {
      return (async function* () {
        if (state !== 'ready') throw unavailable();
        const id = nextId++;
        const stream: StreamState = { queue: [], done: false, error: null, wake: null };
        streams.set(id, stream);
        const onAbort = () => {
          stream.error = new ContractError('cancelled', `${method} was cancelled`);
          stream.wake?.();
        };
        streamOptions?.signal?.addEventListener('abort', onAbort, { once: true });
        send([F.call, id, method, input ?? null]);
        let consumed = 0;
        try {
          while (true) {
            if (stream.queue.length) {
              yield stream.queue.shift();
              if (++consumed >= STREAM_WINDOW / 2) {
                send([F.credit, id, consumed]);
                consumed = 0;
              }
              continue;
            }
            if (stream.error) throw stream.error;
            if (stream.done) return;
            await new Promise<void>(resolve => (stream.wake = resolve));
            stream.wake = null;
          }
        } finally {
          streamOptions?.signal?.removeEventListener('abort', onAbort);
          if (streams.delete(id) && !stream.done) send([F.cancel, id]);
        }
      })();
    },

    subscribe(method, listener, subscribeOptions) {
      const subscription: Subscription = {
        method,
        listener,
        options: subscribeOptions,
        wireId: null,
        attachedBefore: false,
      };
      subscriptions.add(subscription);
      attach(subscription);
      // Whether or not it attached now, any later attach follows a gap the caller must resync.
      subscription.attachedBefore = true;
      return () => {
        subscriptions.delete(subscription);
        detach(subscription, true);
      };
    },

    bytesPath(method, input, ttlSeconds) {
      if (!options.ticketKey) throw new Error('bytes URLs need a ticketKey');
      return signedBytesPath(options.ticketKey, method, input, ttlSeconds);
    },

    bytesUrl(method, input, ttlSeconds) {
      return `${httpBase()}${this.bytesPath(method, input, ttlSeconds)}`;
    },

    async bytesOpen(method, input, init) {
      const response = await fetch(this.bytesUrl(method, input), {
        headers: init?.headers,
        signal: init?.signal,
      });
      const code = response.headers.get('x-contract-error');
      if (!code) return response;
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new ContractError(code, body?.error ?? code);
    },

    minor: (name, major) => implementedMinor(hello?.contracts, name, major),
  };

  open();

  return {
    transport,
    get state() {
      return state;
    },
    get hello() {
      return hello;
    },
    get status() {
      return status;
    },
    onState(listener) {
      stateListeners.add(listener);
      return () => stateListeners.delete(listener);
    },
    onStatus(listener) {
      statusListeners.add(listener);
      return () => statusListeners.delete(listener);
    },
    ready(timeoutMs = 15_000) {
      if (state === 'ready') return Promise.resolve();
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          remove();
          reject(new ContractError('unavailable', 'Service did not become reachable'));
        }, timeoutMs);
        const remove = this.onState(next => {
          if (next !== 'ready') return;
          clearTimeout(timer);
          remove();
          resolve();
        });
      });
    },
    reconnect() {
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
      retryMs = 500;
      const current = socket;
      if (current) current.close(4000, 'Reconnecting');
      else open();
    },
    close() {
      closedByUser = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (heartbeat) clearInterval(heartbeat);
      const current = socket;
      socket = null;
      current?.close(1000, 'Closed');
      failAll(unavailable());
      setState('closed');
    },
  };
};
