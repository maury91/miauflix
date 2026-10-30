import type {
  BuiltInErrorCode,
  BytesDef,
  CallDef,
  Contract,
  ErrorOf,
  EventDef,
  FilterOf,
  InputOf,
  ItemOf,
  OutputOf,
  PayloadOf,
  StreamDef,
} from './define.js';

/* ---------- caller side ---------- */

export interface RequestOptions {
  signal?: AbortSignal;
  /** Overrides the transport's default timeout for this request. */
  timeoutMs?: number;
}

type Args<I, Rest> = [I] extends [void]
  ? [input?: undefined, options?: Rest]
  : [input: I, options?: Rest];

export type CallClient<I, O> = (...args: Args<I, RequestOptions>) => Promise<O>;
export type StreamClient<I, T> = (...args: Args<I, { signal?: AbortSignal }>) => AsyncIterable<T>;

export interface SubscribeOptions<F> {
  filter?: F;
  /**
   * Runs every time the subscription becomes live after a gap (it could not attach when created,
   * the connection dropped, or the service left `ready`): events emitted in between are lost, so
   * re-read the state they describe.
   */
  onResync?: () => void;
}

export interface EventClient<T, F> {
  on(listener: (payload: T) => void, options?: SubscribeOptions<F>): () => void;
}

export interface BytesRequestInit {
  headers?: HeadersInit;
  signal?: AbortSignal;
}

export interface BytesClient<I> {
  /** Absolute signed URL. Minted locally: no request is made. */
  url(input: I, options?: { ttlSeconds?: number }): string;
  /** Signed path relative to the service origin (for edge offload such as `X-Accel-Redirect`). */
  path(input: I, options?: { ttlSeconds?: number }): string;
  /** Fetches the bytes. Error codes reject with `ContractError`. */
  open(input: I, init?: BytesRequestInit): Promise<Response>;
}

type ClientOf<D> =
  D extends CallDef<infer I, infer O, string>
    ? CallClient<I, O>
    : D extends StreamDef<infer I, infer T, string>
      ? StreamClient<I, T>
      : D extends EventDef<infer T, infer F>
        ? EventClient<T, F>
        : D extends BytesDef<infer I, string>
          ? BytesClient<I>
          : never;

export type Client<C extends Contract> = {
  readonly [K in keyof C['methods']]: ClientOf<C['methods'][K]>;
};

/* ---------- service side ---------- */

export interface CallContext<E extends string> {
  signal: AbortSignal;
  /** Fails the request with one of the method's declared codes. */
  fail(code: E | BuiltInErrorCode, message?: string): never;
}

export interface BytesContext<E extends string> extends CallContext<E> {
  /** Request headers (Range, If-Range, …). */
  headers: Headers;
}

export type CallImpl<D> = (
  input: InputOf<D>,
  ctx: CallContext<ErrorOf<D>>
) => OutputOf<D> | Promise<OutputOf<D>>;
export type StreamImpl<D> = (
  input: InputOf<D>,
  ctx: CallContext<ErrorOf<D>>
) => AsyncIterable<ItemOf<D>>;
/** Starts delivering events to `emit`; returns the unsubscribe function. */
export type EventImpl<D> = (
  emit: (payload: PayloadOf<D>) => void,
  filter: FilterOf<D> | undefined
) => () => void;
export type BytesImpl<D> = (
  input: InputOf<D>,
  ctx: BytesContext<ErrorOf<D>>
) => Response | Promise<Response>;

type ImplOf<D> =
  D extends CallDef<unknown, unknown, string>
    ? CallImpl<D>
    : D extends StreamDef<unknown, unknown, string>
      ? StreamImpl<D>
      : D extends EventDef<unknown, unknown>
        ? EventImpl<D>
        : D extends BytesDef<unknown, string>
          ? BytesImpl<D>
          : never;

export type Impl<C extends Contract> = { [K in keyof C['methods']]: ImplOf<C['methods'][K]> };
