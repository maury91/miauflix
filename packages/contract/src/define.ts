/**
 * Contract definitions. A contract is a plain object whose generic parameters exist only at type
 * level: at runtime every method is `{ kind, ...options }`, which is all the transports need.
 */

/** Error codes every method can fail with, on top of the ones it declares. */
export type BuiltInErrorCode =
  | 'unavailable'
  | 'not_configured'
  | 'cancelled'
  | 'timeout'
  | 'bad_request'
  /** The connected service implements an older minor version without this method. */
  | 'unsupported'
  | 'internal';

interface SinceOption {
  /**
   * Minor version of the contract that added the method. Calling it on a service with an older
   * minor fails with `unsupported` without a round trip, so callers can degrade.
   */
  since?: number;
}

export interface CallOptions extends SinceOption {
  /** Share one in-flight request between callers asking for the same input. */
  dedupe?: boolean;
  /** Callable while the service is not ready (for example state the host pushes at boot). */
  ungated?: boolean;
}

export type StreamOptions = SinceOption;
export type EventOptions = SinceOption;

export interface BytesOptions<E extends string> extends SinceOption {
  /** HTTP status sent for a declared error code (built-in codes have defaults). */
  status?: Partial<Record<E, number>>;
}

interface Phantom<T> {
  /** Type-level only, never set. */
  readonly _types?: T;
  /** Minor version that added the method (0: since the major version itself). */
  readonly since: number;
}

export interface CallDef<I, O, E extends string>
  extends Phantom<{ input: I; output: O; error: E }> {
  readonly kind: 'call';
  readonly dedupe: boolean;
  readonly ungated: boolean;
}

export interface StreamDef<I, T, E extends string>
  extends Phantom<{ input: I; item: T; error: E }> {
  readonly kind: 'stream';
}

export interface EventDef<T, F> extends Phantom<{ payload: T; filter: F }> {
  readonly kind: 'event';
}

export interface BytesDef<I, E extends string> extends Phantom<{ input: I; error: E }> {
  readonly kind: 'bytes';
  readonly status: Partial<Record<string, number>>;
}

// `any` here only widens the constraint; concrete contracts keep their exact types.

export type MethodDef =
  | CallDef<any, any, any>
  | StreamDef<any, any, any>
  | EventDef<any, any>
  | BytesDef<any, any>;

export type Methods = Record<string, MethodDef>;

/** `major.minor`: minors only add; a new major may break, and is only made adjacent-compatible. */
export type ContractVersion = `${number}.${number}`;

export interface Contract<N extends string = string, M extends Methods = Methods> {
  readonly name: N;
  readonly version: ContractVersion;
  readonly major: number;
  readonly minor: number;
  readonly methods: M;
}

export const parseVersion = (version: string): { major: number; minor: number } => {
  const match = /^(\d+)\.(\d+)$/.exec(version);
  if (!match) throw new Error(`Invalid contract version '${version}' (expected major.minor)`);
  return { major: Number(match[1]), minor: Number(match[2]) };
};

export const contract = <const N extends string, const M extends Methods>(
  name: N,
  version: ContractVersion,
  methods: M
): Contract<N, M> => {
  if (!/^[$a-z][a-z0-9-]*$/.test(name)) throw new Error(`Invalid contract name '${name}'`);
  const { major, minor } = parseVersion(version);
  for (const [method, def] of Object.entries(methods))
    if (def.since > minor)
      throw new Error(`${name}.${method} is since ${major}.${def.since}, after ${version}`);
  return Object.freeze({ name, version, major, minor, methods: Object.freeze(methods) });
};

/** Request/response. `E` lists the error codes the method may fail with. */
export const call = <I, O, E extends string = never>(options: CallOptions = {}) =>
  ({
    kind: 'call',
    dedupe: options.dedupe ?? false,
    ungated: options.ungated ?? false,
    since: options.since ?? 0,
  }) as CallDef<I, O, E>;

/** A sequence of items with backpressure and cancellation. */
export const stream = <I, T, E extends string = never>(options: StreamOptions = {}) =>
  ({ kind: 'stream', since: options.since ?? 0 }) as StreamDef<I, T, E>;

/** Pushed by the service to every subscriber; `F` is the subscription filter. */
export const event = <T, F = void>(options: EventOptions = {}) =>
  ({ kind: 'event', since: options.since ?? 0 }) as EventDef<T, F>;

/** A raw byte response (HTTP, Range-aware) reachable through a signed URL. */
export const bytes = <I, E extends string = never>(options: BytesOptions<E> = {}) =>
  ({ kind: 'bytes', status: { ...options.status }, since: options.since ?? 0 }) as BytesDef<I, E>;

/** Wire name of a method: `<contract>@<major>.<method>`, so adjacent majors can coexist. */
export const methodName = (target: Pick<Contract, 'name' | 'major'>, method: string): string =>
  `${target.name}@${target.major}.${method}`;

/* ---------- type helpers ---------- */

type TypesOf<D> = D extends Phantom<infer T> ? T : never;
export type InputOf<D> = TypesOf<D> extends { input: infer I } ? I : never;
export type OutputOf<D> = TypesOf<D> extends { output: infer O } ? O : never;
export type ItemOf<D> = TypesOf<D> extends { item: infer T } ? T : never;
export type ErrorOf<D> = TypesOf<D> extends { error: infer E extends string } ? E : never;
export type PayloadOf<D> = TypesOf<D> extends { payload: infer T } ? T : never;
export type FilterOf<D> = TypesOf<D> extends { filter: infer F } ? F : never;
