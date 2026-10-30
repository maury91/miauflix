import { randomBytes } from 'node:crypto';

import { type Contract, type MethodDef, methodName } from './define.js';
import { BUILT_IN_STATUS, ContractError, toWireError } from './errors.js';
import {
  management,
  type ServiceConfigApplyResult,
  type ServiceConfigSchema,
  type ServiceConfigTestResult,
  type ServiceHello,
  type ServiceStatus,
  STATUS_CHANGED,
} from './management.js';
import {
  BYTES_PATH,
  encodeBinary,
  F,
  type Frame,
  HEARTBEAT_MS,
  HEARTBEAT_TIMEOUT_MS,
  PROTOCOL_VERSION,
  STREAM_WINDOW,
} from './protocol.js';
import { verifyTicket } from './tickets.js';
import type { CallContext, Impl } from './types.js';

export interface ServiceInfo {
  id: string;
  name: string;
  description: string;
  version: string;
}

/** The part of a service's configuration runtime the protocol drives. */
export interface ManagedConfiguration {
  getSchema(): ServiceConfigSchema;
  readonly ready: boolean;
  test(values: Record<string, string>): Promise<ServiceConfigTestResult>;
  applyRemote(values: Record<string, string>): Promise<ServiceConfigApplyResult>;
  clearRemote(): Promise<ServiceConfigApplyResult>;
  subscribe(listener: () => void): () => void;
}

export interface ServiceOptions {
  info: ServiceInfo;
  configuration: ManagedConfiguration;
  /**
   * Defaults to `ready`/`standby` from the configuration. A `ready` state is reported as
   * `configuring` while `ready()` is false, so `ready` always means the data plane serves calls.
   */
  status?: () => ServiceStatus | Promise<ServiceStatus>;
  /**
   * Whether data-plane methods may run. Defaults to `configuration.ready`. When it can change
   * without a configuration transition, call `notifyStatus()` after it does.
   */
  ready?: () => boolean;
  /** Shared secret a connection must present before anything else. Unset: no check. */
  token?: string;
  onStop?: () => void | Promise<void>;
  /** Unexpected failures (anything but a `ContractError`), which reach callers as `internal`. */
  onError?: (method: string, error: unknown) => void;
}

/** One side of a control-plane connection, as provided by the server adapter. */
export interface ServerConnection {
  send(data: string | Uint8Array): void;
  close(code?: number, reason?: string): void;
}

export interface ConnectionHandler {
  onMessage(data: string | Uint8Array): void;
  onClose(): void;
}

type Handler = { def: MethodDef; fn: (...args: never[]) => unknown };

const failer = (code: string, message?: string): never => {
  throw new ContractError(code, message);
};

const callContext = <E extends string>(signal: AbortSignal): CallContext<E> => ({
  signal,
  fail: failer,
});

/** A service definition: management plus the contracts it implements, transport-agnostic. */
export class Service {
  readonly info: ServiceInfo;
  private readonly handlers = new Map<string, Handler>();
  private readonly contracts: Record<string, string[]> = {};
  private readonly statusListeners = new Set<(status: ServiceStatus) => void>();
  private lastStatus: string | null = null;
  private ticketKey: string | null = null;
  private stopped = false;
  private readonly removeConfigListener: () => void;

  constructor(private readonly options: ServiceOptions) {
    this.info = options.info;
    const config = options.configuration;
    this.implement(management, {
      status: () => this.status(),
      statusChanged: emit => {
        this.statusListeners.add(emit);
        // `status` may come from a service callback: a failure must not become an unhandled rejection.
        void this.status()
          .then(status => {
            if (this.statusListeners.has(emit)) emit(status);
          })
          .catch(error => this.options.onError?.(STATUS_CHANGED, error));
        return () => this.statusListeners.delete(emit);
      },
      configSchema: () => config.getSchema(),
      testConfig: ({ values }) => config.test(values),
      applyConfig: ({ values }) => config.applyRemote(values),
      clearConfig: () => config.clearRemote(),
    });
    this.removeConfigListener = config.subscribe(() => this.notifyStatus());
  }

  implement<C extends Contract>(contract: C, impl: Impl<C>): this {
    const versions = (this.contracts[contract.name] ??= []);
    if (versions.some(version => version.startsWith(`${contract.major}.`)))
      throw new Error(`Contract ${contract.name} ${contract.major}.x is already implemented`);
    versions.push(contract.version);
    versions.sort((a, b) => parseFloat(a) - parseFloat(b));
    for (const [name, def] of Object.entries(contract.methods)) {
      const fn = (impl as Record<string, Handler['fn']>)[name];
      if (typeof fn !== 'function')
        throw new Error(`Missing implementation for ${contract.name}.${name}`);
      this.handlers.set(methodName(contract, name), { def, fn });
    }
    return this;
  }

  get hello(): ServiceHello {
    const contracts = Object.fromEntries(
      Object.entries(this.contracts).map(([name, versions]) => [name, [...versions]])
    );
    return { protocol: PROTOCOL_VERSION, ...this.info, contracts };
  }

  get token(): string | undefined {
    return this.options.token;
  }

  /** Key that signs `bytes` URLs; set by the connecting host (or the local transport). */
  setTicketKey(key: string): void {
    this.ticketKey = key;
  }

  ensureTicketKey(): string {
    this.ticketKey ??= randomBytes(32).toString('base64url');
    return this.ticketKey;
  }

  isReady(): boolean {
    return this.options.ready ? this.options.ready() : this.options.configuration.ready;
  }

  async status(): Promise<ServiceStatus> {
    const status = this.options.status
      ? await this.options.status()
      : { state: this.options.configuration.ready ? ('ready' as const) : ('standby' as const) };
    // Hosts attach subscriptions on `ready`: never announce it while data calls are still rejected.
    if (status.state !== 'ready' || this.isReady()) return status;
    return {
      ...status,
      state: 'configuring',
      message: status.message ?? `${this.info.name} is starting`,
    };
  }

  /** Pushes the current status to subscribers when it changed. */
  notifyStatus(): void {
    void this.status()
      .then(status => {
        const serialized = JSON.stringify(status);
        if (serialized === this.lastStatus) return;
        this.lastStatus = serialized;
        for (const listener of this.statusListeners) listener(status);
      })
      .catch(() => undefined);
  }

  /* ---------- dispatch, shared by every transport ---------- */

  private handler(method: string, kind: MethodDef['kind']): Handler {
    const handler = this.handlers.get(method);
    if (!handler || handler.def.kind !== kind)
      throw new ContractError('bad_request', `Unknown ${kind} '${method}'`);
    const ungated = method.startsWith('$@') || (handler.def.kind === 'call' && handler.def.ungated);
    if (!ungated && !this.isReady())
      throw new ContractError('not_configured', `${this.info.name} is not configured`);
    return handler;
  }

  kindOf(method: string): MethodDef['kind'] | undefined {
    return this.handlers.get(method)?.def.kind;
  }

  async invoke(method: string, input: unknown, signal: AbortSignal): Promise<unknown> {
    const { fn } = this.handler(method, 'call');
    return (fn as (i: unknown, c: CallContext<string>) => unknown)(input, callContext(signal));
  }

  openStream(method: string, input: unknown, signal: AbortSignal): AsyncIterable<unknown> {
    const { fn } = this.handler(method, 'stream');
    return (fn as (i: unknown, c: CallContext<string>) => AsyncIterable<unknown>)(
      input,
      callContext(signal)
    );
  }

  subscribe(method: string, filter: unknown, emit: (payload: unknown) => void): () => void {
    const { fn } = this.handler(method, 'event');
    return (fn as (e: (p: unknown) => void, f: unknown) => () => void)(emit, filter);
  }

  async openBytes(
    method: string,
    input: unknown,
    headers: Headers,
    signal: AbortSignal
  ): Promise<Response> {
    const { fn } = this.handler(method, 'bytes');
    return (fn as (i: unknown, c: unknown) => Response | Promise<Response>)(input, {
      ...callContext(signal),
      headers,
    });
  }

  /** Converts a thrown value to its wire form, reporting unexpected ones. */
  wireError(method: string, error: unknown): { code: string; message: string } {
    if (!(error instanceof ContractError)) this.options.onError?.(method, error);
    return toWireError(error);
  }

  bytesErrorStatus(method: string, code: string): number {
    const def = this.handlers.get(method)?.def;
    const declared = def?.kind === 'bytes' ? def.status[code] : undefined;
    return declared ?? BUILT_IN_STATUS[code as keyof typeof BUILT_IN_STATUS] ?? 500;
  }

  /* ---------- HTTP: /health and signed bytes ---------- */

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/health')
      return Response.json({ status: 'ok', state: this.isReady() ? 'ready' : 'standby' });
    if (!url.pathname.startsWith(BYTES_PATH))
      return Response.json({ error: 'Not found', code: 'bad_request' }, { status: 404 });
    if (request.method !== 'GET' && request.method !== 'HEAD')
      return Response.json({ error: 'Method not allowed', code: 'bad_request' }, { status: 405 });

    const method = decodeURIComponent(url.pathname.slice(BYTES_PATH.length));
    const fail = (code: string, message: string) =>
      Response.json(
        { error: message, code },
        { status: this.bytesErrorStatus(method, code), headers: { 'x-contract-error': code } }
      );
    if (!this.ticketKey) return fail('unavailable', 'No host has connected yet');
    const ticket = verifyTicket(this.ticketKey, method, url.searchParams.get('t') ?? '');
    if (!ticket.ok)
      return Response.json(
        {
          error: ticket.reason === 'expired' ? 'Link expired' : 'Invalid link',
          code: 'bad_request',
        },
        { status: 403, headers: { 'x-contract-error': 'bad_request' } }
      );
    try {
      return await this.openBytes(method, ticket.input, request.headers, request.signal);
    } catch (error) {
      const { code, message } = this.wireError(method, error);
      return fail(code, message);
    }
  }

  /* ---------- control plane ---------- */

  accept(connection: ServerConnection): ConnectionHandler {
    return new ServerSession(this, connection);
  }

  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    this.removeConfigListener();
    this.statusListeners.clear();
    await this.options.onStop?.();
  }
}

export const defineService = (options: ServiceOptions): Service => new Service(options);

type StreamState = { controller: AbortController; credit: number; wake: (() => void) | null };

class ServerSession implements ConnectionHandler {
  private authorized: boolean;
  private closed = false;
  private lastSeen = Date.now();
  private readonly calls = new Map<number, AbortController>();
  private readonly streams = new Map<number, StreamState>();
  private readonly subscriptions = new Map<number, () => void>();
  private readonly heartbeat: ReturnType<typeof setInterval>;

  constructor(
    private readonly service: Service,
    private readonly connection: ServerConnection
  ) {
    this.authorized = !service.token;
    this.send([F.hello, 0, service.hello]);
    this.heartbeat = setInterval(() => {
      if (Date.now() - this.lastSeen > HEARTBEAT_TIMEOUT_MS) {
        this.connection.close(4408, 'Heartbeat timeout');
        this.onClose();
      } else this.send([F.ping]);
    }, HEARTBEAT_MS);
    this.heartbeat.unref?.();
  }

  private send(frame: Frame | Uint8Array): void {
    if (this.closed) return;
    try {
      this.connection.send(frame instanceof Uint8Array ? frame : JSON.stringify(frame));
    } catch {
      // The adapter reports the close separately.
    }
  }

  onMessage(data: string | Uint8Array): void {
    this.lastSeen = Date.now();
    if (typeof data !== 'string') return; // clients send no binary frames
    let frame: Frame;
    try {
      frame = JSON.parse(data) as Frame;
    } catch {
      return;
    }
    if (!Array.isArray(frame)) return;
    const [type, id = 0, a, b] = frame;

    if (type === F.init) {
      const init = (a ?? {}) as { token?: string; ticketKey?: string };
      if (this.service.token && init.token !== this.service.token) {
        this.connection.close(4401, 'Unauthorized');
        return this.onClose();
      }
      this.authorized = true;
      if (init.ticketKey) this.service.setTicketKey(init.ticketKey);
      return this.send([F.ready, 0]);
    }
    if (!this.authorized) {
      this.connection.close(4401, 'Unauthorized');
      return this.onClose();
    }

    switch (type) {
      case F.ping:
        return this.send([F.pong]);
      case F.pong:
        return;
      case F.call:
        return this.service.kindOf(String(a)) === 'stream'
          ? void this.runStream(id, String(a), b)
          : void this.runCall(id, String(a), b);
      case F.credit: {
        const stream = this.streams.get(id);
        if (stream) {
          stream.credit += Number(a) || 0;
          stream.wake?.();
        }
        return;
      }
      case F.sub:
        return this.runSubscription(id, String(a), b);
      case F.cancel: {
        this.calls.get(id)?.abort();
        const stream = this.streams.get(id);
        if (stream) {
          stream.controller.abort();
          stream.wake?.();
        }
        this.subscriptions.get(id)?.();
        this.subscriptions.delete(id);
        return;
      }
    }
  }

  private async runCall(id: number, method: string, input: unknown): Promise<void> {
    const controller = new AbortController();
    this.calls.set(id, controller);
    try {
      const output = await this.service.invoke(method, input, controller.signal);
      if (controller.signal.aborted) return;
      this.send(
        output instanceof Uint8Array ? encodeBinary(F.ok, id, output) : [F.ok, id, output ?? null]
      );
    } catch (error) {
      if (controller.signal.aborted) return;
      const { code, message } = this.service.wireError(method, error);
      this.send([F.err, id, code, message]);
    } finally {
      this.calls.delete(id);
    }
  }

  private async runStream(id: number, method: string, input: unknown): Promise<void> {
    const state: StreamState = {
      controller: new AbortController(),
      credit: STREAM_WINDOW,
      wake: null,
    };
    this.streams.set(id, state);
    const { signal } = state.controller;
    try {
      for await (const item of this.service.openStream(method, input, signal)) {
        while (state.credit <= 0 && !signal.aborted)
          await new Promise<void>(resolve => (state.wake = resolve));
        state.wake = null;
        if (signal.aborted) break;
        state.credit -= 1;
        this.send([F.item, id, item]);
      }
      if (!signal.aborted) this.send([F.end, id]);
    } catch (error) {
      if (signal.aborted) return;
      const { code, message } = this.service.wireError(method, error);
      this.send([F.err, id, code, message]);
    } finally {
      this.streams.delete(id);
    }
  }

  private runSubscription(id: number, method: string, filter: unknown): void {
    try {
      const unsubscribe = this.service.subscribe(method, filter ?? undefined, payload =>
        this.send([F.event, id, payload])
      );
      this.subscriptions.set(id, unsubscribe);
    } catch (error) {
      const { code, message } = this.service.wireError(method, error);
      this.send([F.err, id, code, message]);
    }
  }

  onClose(): void {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.heartbeat);
    for (const controller of this.calls.values()) controller.abort();
    for (const stream of this.streams.values()) {
      stream.controller.abort();
      stream.wake?.();
    }
    for (const unsubscribe of this.subscriptions.values()) unsubscribe();
    this.calls.clear();
    this.streams.clear();
    this.subscriptions.clear();
  }
}
