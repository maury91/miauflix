import { setTimeout as delay } from 'node:timers/promises';
import { checkServerIdentity } from 'node:tls';

import { SingleFlight, withAbort } from '../util/single-flight';
import { isInternalHost, publicAddress, type ResolveHost, resolveHost } from './destination';

export type Fetch = typeof globalThis.fetch;
export interface HttpOptions extends RequestInit {
  timeoutMs?: number;
  maxBytes?: number;
  minIntervalMs?: number;
  perMinute?: number;
  /** Maximum wait for minute tokens; ordinary minIntervalMs spacing is always honored. */
  maxRateWaitMs?: number;
  requiresFlareSolverr?: boolean;
  /** Refuse loopback, link-local and private destinations (including redirects) unless allowlisted. */
  blockInternal?: boolean;
  allowHosts?: string[];
  /** Called immediately before each wire request, including redirects and retries. */
  beforeRequest?: () => void;
}
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly retryAfter: string | null
  ) {
    super(`Provider HTTP ${status}`);
  }
}
export class RateLimitError extends Error {
  constructor(public readonly retryAt: number) {
    super('Provider request rate limit reached');
  }
}
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
];
const isRedirect = (status: number) => [301, 302, 303, 307, 308].includes(status);
interface HostState {
  timestamps: number[];
  next: number;
  tail: Promise<void>;
  waiting: number;
}

export class HttpClient {
  private hosts = new Map<string, HostState>();
  private userAgent = 0;
  private readonly gets = new SingleFlight();
  constructor(
    private readonly config: { timeout: () => number; flareSolverr: () => string },
    private readonly fetchImpl: Fetch = globalThis.fetch,
    private readonly now = Date.now,
    private readonly resolve: ResolveHost = resolveHost
  ) {}

  async request(input: string, options: HttpOptions = {}): Promise<Response> {
    const signal = AbortSignal.any([
      ...(options.signal ? [options.signal] : []),
      AbortSignal.timeout(options.timeoutMs ?? this.config.timeout()),
    ]);
    const url = new URL(input);
    if ((options.method ?? 'GET').toUpperCase() !== 'GET')
      return this.follow(url, options, signal, 0);
    const key = JSON.stringify([
      url.href,
      [...new Headers(options.headers)],
      options.redirect,
      options.maxBytes,
      options.requiresFlareSolverr,
      options.perMinute,
      options.minIntervalMs,
      options.maxRateWaitMs,
      options.blockInternal,
      [...(options.allowHosts ?? [])].sort(),
    ]);
    const result = await this.gets.runCancelable(key, signal, sharedSignal =>
      this.follow(url, options, sharedSignal, 0)
    );
    return result.clone();
  }

  private validUrl(url: URL): void {
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
      throw new Error('Invalid provider URL');
  }

  private async gate(url: URL, options: HttpOptions, signal: AbortSignal): Promise<void> {
    // Spacing protects public sites; an internal host (mock, LAN indexer) has nothing to protect.
    if (isInternalHost(url.hostname)) {
      signal.throwIfAborted();
      options.beforeRequest?.();
      return;
    }
    const state = this.hosts.get(url.host) ?? {
      timestamps: [],
      next: 0,
      tail: Promise.resolve(),
      waiting: 0,
    };
    this.hosts.set(url.host, state);
    const maxWait = options.maxRateWaitMs ?? Infinity;
    const previous = state.tail;
    let release!: () => void;
    const slot = new Promise<void>(resolve => {
      release = resolve;
    });
    // A canceled queued caller must not let later callers bypass an earlier reservation.
    state.tail = previous.then(() => slot);
    state.waiting++;
    try {
      await withAbort(previous, signal);
      signal.throwIfAborted();
      state.timestamps = state.timestamps.filter(t => t > this.now() - 60_000);
      const perMinute = Math.max(1, Math.floor(options.perMinute ?? 90));
      const tokenWait = Math.max(
        0,
        state.timestamps.length >= perMinute
          ? state.timestamps[state.timestamps.length - perMinute] + 60_000 - this.now()
          : 0
      );
      if (tokenWait > maxWait) throw new RateLimitError(this.now() + tokenWait);
      // Ordinary request spacing is mandatory even when background token waits are disabled.
      const wait = Math.max(0, state.next - this.now(), tokenWait);
      if (wait) await delay(wait, undefined, { signal });
      signal.throwIfAborted();
      options.beforeRequest?.();
      state.timestamps.push(this.now());
      state.next = this.now() + (options.minIntervalMs ?? 0);
    } finally {
      state.waiting--;
      release();
    }
  }

  private async follow(
    url: URL,
    options: HttpOptions,
    signal: AbortSignal,
    depth: number
  ): Promise<Response> {
    this.validUrl(url);
    const guarded = options.blockInternal && !options.allowHosts?.includes(url.host);
    const address = guarded ? await publicAddress(url, this.resolve, signal) : undefined;
    await this.gate(url, options, signal);
    const headers = new Headers(options.headers);
    if (!headers.has('user-agent'))
      headers.set('user-agent', USER_AGENTS[this.userAgent++ % USER_AGENTS.length]);
    const init: BunFetchRequestInit = {
      method: options.method,
      body: options.body,
      signal,
      redirect: 'manual',
      headers,
    };
    const destination = new URL(url);
    if (address) {
      // Connect to the checked IP, retaining virtual hosting and TLS identity.
      destination.hostname = address.includes(':') ? `[${address}]` : address;
      headers.set('host', url.host);
      const hostname = url.hostname.replace(/^\[|\]$/g, '');
      init.tls = {
        serverName: hostname,
        checkServerIdentity: (_hostname, certificate) => checkServerIdentity(hostname, certificate),
      };
      // An ambient proxy could resolve the hostname again or redirect outside this guard.
      // An empty string means "no option" and keeps the environment proxy; `false` forces a direct connection.
      init.proxy = false as unknown as string;
    }
    const cap = options.maxBytes ?? 10 * 1024 * 1024;
    let response = await this.bounded(
      await withAbort(this.fetchImpl(destination, init), signal),
      cap,
      signal
    );
    if (
      options.requiresFlareSolverr ||
      ([403, 503].includes(response.status) &&
        /cf-chl|just a moment/i.test(await response.clone().text()))
    ) {
      const endpoint = this.config.flareSolverr();
      if (endpoint) {
        // The external solver follows redirects and resolves DNS outside our pinned connection.
        if (guarded) throw new Error('FlareSolverr is unavailable for guarded provider URLs');
        const solverUrl = new URL(`${endpoint.replace(/\/$/, '')}/v1`);
        this.validUrl(solverUrl);
        await this.gate(solverUrl, options, signal);
        const solver = await withAbort(
          this.fetchImpl(solverUrl, {
            method: 'POST',
            signal,
            headers: {
              'content-type': 'application/json',
              'user-agent': headers.get('user-agent')!,
            },
            body: JSON.stringify({
              cmd: 'request.get',
              url: url.href,
              maxTimeout: Math.min(options.timeoutMs ?? this.config.timeout(), 60_000),
            }),
          }),
          signal
        );
        // JSON escaping can expand every source byte sixfold; cap both the envelope and solution.
        const payload = (await (
          await this.bounded(solver, cap * 6 + 64 * 1024, signal)
        ).json()) as {
          status: string;
          solution?: { status: number; response: string; headers?: Record<string, string> };
        };
        if (
          payload.status !== 'ok' ||
          !payload.solution ||
          typeof payload.solution.response !== 'string'
        )
          throw new Error('FlareSolverr failed');
        if (Buffer.byteLength(payload.solution.response) > cap)
          throw new Error('Response exceeds byte limit');
        response = new Response(payload.solution.response, {
          status: payload.solution.status,
          headers: payload.solution.headers,
        });
      }
    }
    if (isRedirect(response.status) && response.headers.has('location')) {
      if (options.redirect === 'manual') return response;
      if (options.redirect === 'error') throw new Error('Provider redirect refused');
      if (depth >= 5) throw new Error('Too many redirects');
      const next = new URL(response.headers.get('location')!, url);
      const nextHeaders = new Headers(options.headers);
      if (next.origin !== url.origin)
        for (const key of ['authorization', 'cookie', 'proxy-authorization'])
          nextHeaders.delete(key);
      const get =
        response.status === 303 ||
        ([301, 302].includes(response.status) && options.method?.toUpperCase() === 'POST');
      if (get) {
        nextHeaders.delete('content-type');
        nextHeaders.delete('content-length');
      }
      return this.follow(
        next,
        { ...options, headers: nextHeaders, ...(get ? { method: 'GET', body: undefined } : {}) },
        signal,
        depth + 1
      );
    }
    return response;
  }

  private async bounded(response: Response, cap: number, signal: AbortSignal): Promise<Response> {
    if (Number(response.headers.get('content-length')) > cap) {
      void response.body?.cancel().catch(() => undefined);
      throw new Error('Response exceeds byte limit');
    }
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      if (reader)
        while (true) {
          const { done, value } = await withAbort(reader.read(), signal);
          if (done) break;
          length += value.byteLength;
          if (length > cap) throw new Error('Response exceeds byte limit');
          chunks.push(value);
        }
    } catch (error) {
      void reader?.cancel().catch(() => undefined);
      throw error;
    } finally {
      reader?.releaseLock();
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return new Response([204, 205, 304].includes(response.status) ? null : bytes, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  }

  async json<T>(url: string, options?: HttpOptions): Promise<T> {
    const response = await this.request(url, options);
    if (!response.ok) throw new HttpError(response.status, response.headers.get('retry-after'));
    return response.json() as Promise<T>;
  }
}
