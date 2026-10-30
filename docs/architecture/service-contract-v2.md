# Service contract v2

Status: steps 1–3 and 6 of the migration path (§12) are implemented: `@miauflix/contract`,
`@miauflix/contracts`, the list service and the media catalog run on it, and
`@miauflix/service-contracts` and `RemoteServiceManager` are gone. Streaming and sources (steps
4–5) are still in-process in the backend. §1 describes the system as it was before.

## 1. How it works today

| Piece        | Where                                                                                                     | What it does                                                                                                                                            |
| ------------ | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schemas      | `packages/service-contracts/src/{management,catalog,list}/v1.ts`                                          | Zod schemas, with types inferred from them. Paths and HTTP methods are **not** part of the contract: they are string literals in each client and router |
| Discovery    | `GET /service` manifest → capability `basePath` + management paths                                        | Polled every 15 s, plus an SSE status stream                                                                                                            |
| Management   | `/status`, `/configuration/schema`, `/configuration/test`, `PUT /configuration`                           | The backend owns config and pushes a full snapshot (again after a `standby` restart)                                                                    |
| Calls        | `RemoteServiceManager.request(schema, path, init)`                                                        | A `fetch` for each call: JSON body, `response.json()`, then `schema.safeParse()`                                                                        |
| Service side | `media-catalog/src/http/router.ts`, `list-service/src/index.ts` (an `if` chain)                           | Parses the request with Zod and **also** `schema.parse()`s its own response before sending it                                                           |
| Push         | Catalog artwork: a separate WebSocket, one JSON message per update, parsed with Zod                       | Hand-written reconnect, heartbeat and "stream ready" resync in `CatalogClientService`                                                                   |
| Errors       | HTTP status: 404 means `notFound()`, 503 means `ServiceNotConfiguredError`, 400 on config means rejection | Each meaning is encoded by hand at every call site                                                                                                      |
| Jobs         | `bunqueue` queue names live in the contracts package                                                      | —                                                                                                                                                       |

Streaming and sources are still in-process in the backend. `DownloadService.streamFile()`
returns a `Response` whose body is an `EncryptedFileReader` stream, and ffmpeg
(`audio-playback.service.ts`) reads the media **over HTTP** (`-protocol_whitelist http,tcp`).

### Costs and friction

1. **Every payload is validated twice.** The service `parse()`s its output, then the backend
   `safeParse()`s it. For `media/batch` (up to 50 full `MovieDetail`/`TVShowDetail` objects)
   that means walking every field of every item twice per call, on both runtimes.
2. **The contract is only half typed.** Nothing ties `'/media/batch'` + `POST` to
   `batchRequestSchema`/`batchResponseSchema`. A typo or a mismatch shows up only at runtime.
3. **Three transports for one service:** HTTP calls, SSE status and a WebSocket for artwork,
   each with its own reconnect logic, on top of 15 s polling.
4. **Each client repeats the same boilerplate:** `path()`, `JSON.stringify`, headers, the
   in-flight dedup map, and `ConfigurableService` methods that only forward to the manager.
5. **Nothing covers byte streams.** Once WebTorrent becomes a service, the obvious move is to
   proxy `Response.body` through Node, which puts every video byte through the backend's event
   loop a second time.
6. **Services only run remotely.** They use `Bun.serve` and `bun:sqlite`, and the backend runs
   on Node. Embedding them as npm modules needs them to be runtime-neutral (see §9).

## 2. Goals mapped to decisions

| Goal                 | Decision                                                                                                                                                                                 |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Low overhead         | One multiplexed WebSocket per service carries the control plane. Bytes go over plain HTTP that can bypass the backend. No runtime validation between trusted ends. JSON codec, pluggable |
| Type safe            | The contract is a TS object with phantom types. Client and server types are derived from it, including method names, inputs, outputs, error codes, events and streams                    |
| Type light           | No Zod on the internal hot path. Validation stays at the **trust boundary** (browser → backend) and is opt-in in dev/tests                                                               |
| WebSockets           | Events and subscriptions are first-class (`event<T, Filter>()`) on the shared socket                                                                                                     |
| Streaming            | `stream<In, Item>()` for object streams (backpressure + cancel). `bytes<In>()` for media                                                                                                 |
| Easy to read and use | A contract file reads like an interface. Calling one looks like `await catalog.getMovie({ id, lang })`                                                                                   |
| Embeddable as npm    | Every service is a `defineService()` value. The host either `mount`s it (in-process, direct calls) or `connect`s to it (remote), and both return the same typed client                   |
| Seamless piping      | `bytes` procedures produce **signed URLs minted locally**, so the edge proxy or ffmpeg reads straight from the streaming service. In-process mode hands over the `ReadableStream` itself |

## 3. Defining a contract

Two packages:

- `packages/contract` (`@miauflix/contract`): the runtime. Contract builders, the typed client,
  the service runtime, the local and WebSocket transports, `serve()` for Bun and Node, signed
  `bytes` tickets and the management contract. No dependencies (`ws` only on Node, loaded lazily).
- `packages/contracts` (`@miauflix/contracts`): every service contract (`catalog`, `lists`, …)
  with its payload types as plain interfaces, plus shared constants (`MAX_BATCH_ITEMS`,
  `SEARCH_GENRE_KEY_PATTERN`, the catalog job names). One package rather than one per contract,
  until a contract is published on its own.

```ts
// packages/contracts/src/catalog.ts (excerpt)
import { call, contract, event } from '@miauflix/contract';

export interface MediaRef {
  mediaType: 'movie' | 'tv';
  mediaId: number;
}
// … MovieDetail, TVShowDetail, SeasonDetail: plain interfaces, no zod

export const catalog = contract('catalog', '2.0', {
  getMovie: call<{ mediaId: number; language: string }, MovieDetail, 'not_found'>({ dedupe: true }),
  batch: call<{ items: MediaRef[]; language: string; artworkPriority: … }, BatchResponse>(),
  ensureBackdropFocus: call<MediaRef, BackdropFocus, 'not_found' | 'no_backdrop'>(),
  artwork: event<ArtworkUpdate>(),
  /** The host pushes it at boot, possibly before the service is ready. */
  setWatching: call<{ mediaIds: number[] }, void>({ ungated: true }),
  // …
});
```

Builders (`call`, `stream`, `event`, `bytes`) return `{ kind, …options }` at runtime. Their
generic parameters live in a phantom `_types?` property that is never set. From a contract the
package derives `Client<C>` (what callers get) and `Impl<C>` (what a service must implement; a
missing or mis-typed method is a compile error, see the type checks at the end of
`packages/contract/src/contract.test.ts`).

Call options:

- `dedupe`: concurrent calls with the same input share one request (callers passing their own
  `signal` never share).
- `ungated`: callable while the service is not ready. Every other data-plane method is rejected
  with `not_configured` until it is, so implementations do not check readiness themselves.

### Versioning

A contract version is `major.minor` (`'2.0'`, `'2.3'`). The rule is that the backend and a service
one major apart always still work together, so either side can be deployed first:

| backend | service | result                                                     |
| ------- | ------- | ---------------------------------------------------------- |
| v1      | v2      | works: the v2 service still implements v1                  |
| v2      | v1      | works, maybe degraded: the v2 backend adapts the v1 client |
| v3      | v1      | does not work (reported as an incompatible service)        |
| v1      | v3      | does not work                                              |

- **Minor** (`2.0` → `2.1`): additive only. New methods carry `since: <minor>`; new fields are
  optional. A caller built against `2.1` calling a `since: 1` method on a `2.0` service gets
  `unsupported` without a round trip (the transport knows the minor from `hello`), so it can
  degrade. Old callers never see the new methods.
- **Major** (`2.x` → `3.0`): the only place a breaking change goes. The next release of the
  service implements both majors side by side (`.implement(catalogV2, …).implement(catalogV3, …)`;
  each major at most once), and the backend talks the new major when offered and the previous
  one through an adapter otherwise. Once every deployment has moved, the next major drops the
  oldest.
- The wire name of a method includes its major (`catalog@2.getMovie`), so two majors coexist on
  one connection and in one process. `hello.contracts` lists every version a service implements
  (`{ catalog: ['2.3', '3.0'] }`).
- The backend side is declared once per remote service:

  ```ts
  super(configurationService, {
    serviceName: 'CATALOG',
    contract: catalog, // 3.x
    previous: previousMajor(catalogV2, v2 => ({ ...adaptedMethods })), // Client<catalog> on top of v2
    …
  });
  ```

  Negotiation runs on every (re)connection. `client` follows the major picked; subscriptions stay
  on the major that was active when they were made.

The switch from the old HTTP API to this protocol is the one exception: it has no bridge, so the
backend and the services of that release are deployed together. The window applies from there on.

### What happens to Zod

- Browser → backend routes keep `zValidator`. That is the untrusted edge. The few schemas the
  backend and the frontend used from the old package now live next to the route or client that
  needs them.
- Configuration _schemas_ (`ServiceConfigSchema` groups and variables) are UI data, not
  validation, so they stay as plain objects.
- Services keep zod only for data they do not control (provider responses such as Trakt's).
- `validated(contract, impl, schemas)` wraps an implementation with any `{ parse }` schemas, for
  tests and development. Production code does not use it.

## 4. Using it

### Service side

```ts
// services/media-catalog/src/service.ts (excerpt)
export const createCatalogService = (context: ServiceContext) =>
  defineService({
    info: { id: 'media-catalog', name: 'Media Catalog', description: '…', version },
    configuration: context.config, // ServiceConfiguration: schema, test, apply, clear
    status: () => buildStatus(context), // pushed to the host on change
    ready: () => context.config.state === 'ready' && context.catalog !== null,
    onError: (method, error) => logger.error('MediaCatalog', `${method} failed`, error),
  }).implement(catalog, {
    getMovie: async ({ mediaId, language }, ctx) =>
      (await catalog().getMovie(mediaId, language)) ?? ctx.fail('not_found'),
    artwork: emit => catalog().onArtworkUpdate(emit),
    // …
  });

// services/media-catalog/src/index.ts (standalone process)
const server = await serve(createCatalogService(context), { hostname, port });
```

`ctx.fail(code)` only accepts the codes declared for that method plus the built-in ones.
Anything else an implementation throws reaches the caller as `internal` (its message is not
leaked) and is reported to `onError`.

### Backend side

`backend/src/services/remote/remote-service.ts` (`RemoteService<C>`) is the host for one remote
service. It implements `ConfigurableService` once for every service: the connection, the
contract version check, registering the configuration schema, delivering the stored snapshot
(again when the service reports `standby`), status, and configuration test/apply/clear. A
configuration test against a draft service URL runs over a short-lived connection of its own.

Its `client` is the typed client, gated so data-plane calls fail fast with
`ServiceNotConfiguredError` while the service is not ready. `CatalogClientService` and
`ListClientService` remain as thin subclasses that keep the backend's calling conventions
(positional arguments, `null` for `not_found`), so their callers did not change:

```ts
export class CatalogClientService extends RemoteService<typeof catalog> {
  getMovie(mediaId: number, language: string) {
    return orNull(this.client.getMovie({ mediaId, language }));
  }
  onArtwork(listener) {
    return this.client.artwork.on(listener, { onResync: () => this.announceResync() });
  }
  // …
}
```

Embedding a service in the backend (`localTransport(service)`) needs no code change in the
callers either. It is not used yet: the list and catalog services are Bun-only (§9).

## 5. Wire protocol (remote mode)

### 5.1 Control plane: one WebSocket per service connection

The backend opens a WebSocket to `ws://service/_c` and keeps it open. Every call, stream, event
and management message is multiplexed on it. There is no per-call connection, header parsing or
routing table, and the HTTP router disappears.

Frames are compact JSON arrays (`[type, id, a, b]`):

| type | name   | direction | payload                                                              |
| ---- | ------ | --------- | -------------------------------------------------------------------- |
| 0    | hello  | S→B       | `{ protocol: 3, service, version, contracts: { catalog: ['2.0'] } }` |
| 1    | auth   | B→S       | `{ token }` (shared secret; first frame, otherwise close 4401)       |
| 2    | call   | B→S       | `[2, id, "catalog@2.getMovie", input]`                               |
| 3    | ok     | S→B       | `[3, id, output]`                                                    |
| 4    | err    | S→B       | `[4, id, code, message]`                                             |
| 5    | item   | S→B       | `[5, id, item]` (stream item)                                        |
| 6    | end    | S→B       | `[6, id]`                                                            |
| 7    | cancel | B→S       | `[7, id]` (AbortSignal fired, or the stream consumer broke the loop) |
| 8    | credit | B→S       | `[8, id, n]` (stream backpressure: the server may send n more items) |
| 9    | sub    | B→S       | `[9, id, "catalog@2.artwork", filter]`                               |
| 10   | event  | S→B       | `[10, id, payload]`                                                  |
| 11   | unsub  | B→S       | `[11, id]`                                                           |
| 12   | status | S→B       | `ServiceStatus` (pushed on change, replaces polling and SSE)         |

- **Ids** are per-connection incrementing integers. Calls and subscriptions share the id space.
- **Binary results** (`Uint8Array` outputs such as a `.torrent` file) travel as one binary
  frame `[u32 id][bytes]` instead of base64 inside JSON.
- **Reconnect** is built into the host. It uses exponential backoff with jitter, re-sends
  `auth`, then the config snapshot when the service reports `standby`, then re-subscribes every
  live subscription. Each subscription can pass `onResync`, which replaces today's
  `onArtworkStreamReady` + snapshot dance.
- **Liveness** relies on WebSocket ping/pong. A dead socket rejects in-flight calls with
  `unavailable` and marks the service `error`. No HTTP polling.
- **Codec:** JSON by default. In JS, `JSON.parse`/`stringify` are native and hard to beat for
  object-heavy payloads. The codec is negotiated in `hello`, so msgpackr can be benchmarked and
  enabled later without touching contracts.
- **Method names** are strings. Interning them to integer ids at handshake would save a few
  bytes per frame. That is not worth it until measurements say otherwise.

### 5.2 Data plane: plain HTTP for `bytes`

Media bytes do **not** go over the WebSocket. They need HTTP `Range`, they must be readable by
the browser `<video>` element and by ffmpeg, and they must not block the control plane behind a
2 GB transfer (head-of-line blocking).

A `bytes<In>()` procedure is served at `GET /_b/<method>?t=<ticket>` with full Range support.
The **ticket** is `base64url(JSON(input)) + "." + exp + "." + HMAC-SHA256(secret, method|input|exp)`.

- The backend **mints tickets locally**, because it holds the per-service secret it sent in the
  config snapshot. Producing a URL takes zero round-trips.
- The service verifies the HMAC and expiry. It does not call back to the backend.
- Authorization (playback grant, user, rate limit) stays in the backend. The ticket proves
  "the backend authorized exactly this input until exp".

## 6. Streaming in detail: the piping requirement

```ts
export const streaming = contract('streaming', 1, {
  media: bytes<
    { sourceId: number; file: string; claim: 'playback' | 'inspect' },
    'unavailable' | 'fake'
  >(),
  metadataFile: call<{ link: string; hash: string; timeoutMs: number }, Uint8Array, 'timeout'>(),
  layout: call<{ source: SourceRef }, StorageLayout, 'timeout'>(),
  predownload: call<{ target: PlaybackTarget; claim: Claim }, boolean>(),
  release: call<{ sourceId: number; owner: string; kind?: ClaimKind }, void>(),
  health: call<{ sourceId: number; file?: string }, PlaybackHealth | null>(),
  stats: call<{ infoHash: string }, { broadcasters: number; watchers: number }>(),
  progress: event<DownloadProgress, { sourceIds?: number[] }>(),
  storage: event<StorageActivitySnapshot>(),
});
```

On the client, a `bytes` method has three faces, and the caller picks the cheapest one that
works:

```ts
interface BytesClient<I> {
  url(input: I, ttlSeconds?: number): string; // signed URL, no I/O
  open(input: I, range?: ByteRange, signal?: AbortSignal): Promise<ByteResponse>;
}
interface ByteResponse {
  status: 200 | 206;
  headers: Headers;
  body: ReadableStream<Uint8Array>;
}
```

The backend stream route uses one helper:

```ts
// GET /api/stream/:token
const grant = await playbackSessionService.verify(token); // auth stays here
const target = await streamService.resolvePlaybackTarget(grant);
return sendBytes(c, streaming.media, {
  sourceId: target.source.id,
  file: target.filePath,
  claim: 'playback',
});
```

`sendBytes` picks the path by deployment, without the route knowing which one:

| Mode                                      | What happens                                                                                                                                              | Bytes through backend  |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| **In-process** (single image)             | `open()` calls the implementation directly and returns the `EncryptedFileReader` `ReadableStream` as the `Response` body, as `streamFile` does today      | once (the same as now) |
| **Remote + edge offload** (Caddy present) | The backend answers `X-Accel-Redirect: /_b/media?t=…`. Caddy intercepts it with `handle_response` and serves the body from the streaming service directly | **zero**               |
| **Remote, no edge** (port 3000 exposed)   | `open()` forwards the `Range` header to `/_b/media`, and the upstream body is returned unchanged as the `Response` body (no decode, no re-chunking)       | once (pass-through)    |

Caddy side (in `docker-compose.https.yml`'s Caddyfile):

```caddy
reverse_proxy miauflix:3000 {
  @accel header X-Accel-Redirect *
  handle_response @accel {
    rewrite {rp.header.X-Accel-Redirect}
    reverse_proxy miauflix-streaming:4000 { flush_interval -1 }
  }
}
```

**ffmpeg** (`audio-playback.service.ts`) gets `streaming.media.url(input)` directly. In remote
mode it reads from the streaming service. In-process mode returns a loopback URL that the host
exposes for mounted services (`/_svc/streaming/_b/media?t=…`, bound to localhost only). The
audio service no longer goes through `/api/stream`.

Playback admission (active stream counts, pausing speculative downloads, releasing when the
body closes) already lives inside `streamFile`. It moves into the streaming service unchanged,
because the service sees the HTTP connection open and close in all three modes.

## 7. Object streams

Use object streams for results that arrive incrementally, not for media:

```ts
export const sources = contract('sources', 1, {
  search: stream<
    { media: MediaRef; season?: number; episode?: number },
    SourceCandidate,
    'not_configured'
  >(),
  forMovie: call<{ id: number }, ContentSource[]>(),
  verify: call<{ sourceId: number }, VerifyResult>(),
  availability: event<AvailabilityChange, { refs?: MediaRef[] }>(),
});

for await (const candidate of sources.search({ media }, { signal: AbortSignal.timeout(3_000) })) {
  if (good(candidate)) break; // break sends `cancel`, the service stops searching
}
```

- The implementation is an `async function*` (or returns an `AsyncIterable`).
- Backpressure is credit based. The client grants 64 items up front and tops up as it consumes.
  In-process, it is the plain async iterator with no buffering.
- This replaces "on-demand search with a 3 s timeout" polling (`isOnDemandSearchPending`). The
  caller takes whatever arrives before the deadline.

## 8. Errors

- Each method declares its error codes (`'not_found'`, `'timeout'`, …). Every method also has
  the built-in codes `unavailable` (not connected), `not_configured` (the service is in
  standby), `cancelled` and `internal`.
- The client throws `ContractError<Code>`, and `isContractError(e, 'not_found')` narrows it.
  Today's `notFound: () => null` and the 503 → `ServiceNotConfiguredError` mapping become one
  rule in the host.
- `ServiceNotConfiguredError` is produced by the host from `not_configured`, so existing
  backend handling keeps working.

## 9. Embedding services as npm modules

`defineService()` returns a plain object, so the same package works in both modes:

- **Standalone:** `serve(service, { port })` provides the WebSocket control plane plus `/_b/*`.
- **Embedded:** `host.mount(service)` calls `start(ctx)` in-process and wires the client
  straight to the returned implementation. No serialization, no sockets, and events are direct
  callbacks. One rule protects this: **inputs and outputs are treated as immutable** (the remote
  path copies, the local one does not). The dev wrapper can `Object.freeze` deeply to catch
  violations.

`ctx` is the whole surface a service gets from its host: `config`, `dataDir`, `log`, `fail`,
`jobs` (queue access) and `peers`, typed clients of other contracts. The sources service asks
for `peers.use(streaming)` to fetch torrent metadata. In a single image that is an in-process
call. Split across containers, it is a direct service-to-service socket that skips the backend.

**Runtime: decided.** Services are **runtime-neutral**, and everything moves to Bun gradually.
WebTorrent is the only known blocker. Concretely:

- The contract's runtime-specific part is **transport only**: `serve` and the WebSocket. On Bun
  they use `Bun.serve`, on Node they use `node:http` + `ws`. The runtime is detected once
  (`typeof Bun`). Contract code and service code never import either directly. The contract
  knows nothing about storage.
- Storage is each service's own business. A service only needs to run on Node if it is
  **mounted** in the Node backend. That is optional: a Bun-only service can always run remotely
  (or as a second process in the same image) until the backend is on Bun. When a service does
  want to be mountable on Node, choosing the SQLite driver is a local detail of its `db` module:
  Drizzle already supports `bun:sqlite` and `better-sqlite3`. No shared layer is needed.
- CI runs a service's tests on Node only if that service is meant to be mountable there.
- The streaming service is the last one to move. Splitting it into its own service is what
  unblocks the rest: the backend can switch to Bun while the streaming service stays on Node,
  running remotely (or mounted, for as long as the backend itself is on Node). It moves once
  WebTorrent (`node-datachannel`, `utp-native`) works on Bun.

This means the single-image deployment runs on whichever runtime the backend uses. Until
WebTorrent runs on Bun, a Bun backend has to run streaming as a separate Node process: the
same image can start two processes, and that is still a single image.

## 10. Data ownership

**Decided:** each service owns its data. The backend keeps **minimal tables** with the bare
minimum, the same as it already does for the catalog and list services. When an endpoint needs
more than that, the backend calls the service.

The rule for what the backend keeps a column for:

1. It needs the value **in SQL**: to filter, sort, join or paginate (for example "titles with an
   available source", "stored offline").
2. It needs the value **to authorize** a request (for example which source and file a playback
   grant is pinned to).
3. Everything else is fetched from the service when an endpoint needs it.

Mirrored columns are kept current by the service's events. On reconnect the host calls the
subscription's `onResync`, which re-reads the mirrored state for the ids the backend holds, so
events missed while disconnected are not lost.

Contracts expose **batch reads** (`items: Id[]` → results) for anything an endpoint may need for
a whole page, so a list of 40 titles is one call and not 40.

### Streaming

| Owned by the streaming service                                          | Kept by the backend                                                                        |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Storage rows: location, encrypted layout, file list, piece verification | `sourceId`, plus an `offline` flag (filters the "available offline" view)                  |
| Download claims (playback, prefetch, warmup), with owners and expiry    | nothing: claims are created and released by calls (`predownload`, `release`)               |
| Active stream counts, pausing and resuming speculative downloads        | nothing                                                                                    |
| Progress, peers, speed, health                                          | nothing: read with `health`/`progress`, or pushed to the browser from the `progress` event |
| The source key used to encrypt chunks                                   | nothing: it arrives in the config snapshot, like today                                     |

The playback grant keeps `sourceId` + `filePath`, because the backend authorizes on them. Then
`streaming.media.url({ sourceId, file })` is all the stream route needs.

`StorageService.withSourceLock` and `setPlaybackActive` stop being shared between the backend
and the download code. They become internal to the streaming service, which is what makes the
split possible.

### Sources

| Owned by the sources service                                                               | Kept by the backend                                                                      |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Every candidate with its provider data, metadata, verification state, seeders and leechers | `sourceId`, media ref, quality, `availability` (`available` / `pending` / `unavailable`) |
| Discovery and verification jobs and their schedules                                        | nothing                                                                                  |

The backend keeps the availability and quality columns because the browse badges and the
notifications (filtering by quality, "Notify me" when a source appears) need them in queries.
The `availability` event updates them. Full source lists, file lists and stats are fetched with
`sources.forMovie`/`forEpisode` when the details page or the source picker asks for them.

## 11. Deployment shapes

```
Single image:   browser ─ Caddy ─ backend[ catalog | lists | sources | streaming (mounted) ]

Split:          browser ─ Caddy ─┬─ backend ═ws═ catalog, lists, sources, streaming
                                 └──────────── streaming /_b/*   (X-Accel offload, bytes only)
                sources ═ws═ streaming (peer)
```

A service runs in-process or remote depending only on whether `*_SERVICE_URL` is set. The code
is the same in both cases.

## 12. Migration path

1. ✅ Build `@miauflix/contract` (define, client/impl types, local transport, WS transport,
   `bytes` + tickets, dev validation, the Bun/Node `serve` and WebSocket adapters), with tests
   that run the same suite against both transports and both runtimes.
2. ✅ Port the **list service**. It is small and has no push or bytes.
3. ✅ Port the **catalog**: calls + the `artwork` event. The hand-written artwork socket, the SSE
   status stream and the 15 s polling are gone.
4. Extract **streaming** behind the `streaming` contract while still mounted in-process. That
   validates the boundary before any network is involved. Then add the `X-Accel` path.
5. Extract **sources** the same way, using `peers.use(streaming)`.
6. ✅ Remove `@miauflix/service-contracts` and `RemoteServiceManager` (the config store moved to
   `@miauflix/service-configuration`).
7. Move the backend to Bun, with streaming running as a separate Node process. Move streaming
   to Bun once WebTorrent runs on it.

Step 4 is where the real work is. The boundary is narrow: about 15 `DownloadService` methods
used from 14 files, plus `StorageService` reads (inventory, per-source storage, the layout event).
`services/playback/torrent-input.ts` already hands ffmpeg a private loopback URL per file, which
`bytes` URLs replace. What still needs a decision: `PlaybackTarget` carries the whole
`ContentSource` entity (including the `.torrent` file buffer), which cannot cross the wire as is,
and the storage tables cascade from `content_source`.

Steps 4 and 5 both move data. `DownloadService` reads and writes `StorageService`
and `ContentSource` rows. Following §10, the storage rows, claims and source details move into
each service's own database, and the backend tables shrink to the mirrored columns. Production
data moves with **data migrations**: the service imports the rows on its first start, then a
backend migration drops the moved columns, both safe to rerun. Do not ask users to wipe their
database.

## 13. Open questions

- Should the backend's own browser realtime gateway use the same frame format, so service
  events can be forwarded to browsers without re-encoding? It is tempting, but the browser edge
  is untrusted and needs validation and auth per message.
- What is the ticket TTL for long movies? Today the playback grant's `expiresAt` already bounds
  the stream. Tickets can reuse it, and ranges requested later re-hit the backend and get a
  fresh ticket.
- Should jobs (`bunqueue`) stay a host-provided `ctx.jobs`, or become contract-level `job<P>()`
  definitions so the backend can enqueue a service's jobs with type safety?
