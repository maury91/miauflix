# Service contracts

Miauflix uses typed, versioned contracts for communication between the backend and its catalog, list, source and media-load services. Each service owns its implementation, configuration schema, and persistent data. The backend owns the public browser API and calls these internal services through typed clients.

See [System overview](system-overview.md) for ownership and deployment, and [External synchronization and query fallback](external-sync-and-query-fallback.md) for request-time data loading.

## Runtime and contract packages

| Package                           | Responsibility                                                                                                                                               |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@miauflix/contract`              | Contract builders, typed clients and implementations, service dispatch, local and WebSocket transports, management operations, and signed byte-response URLs |
| `@miauflix/service-contracts`     | Catalog, list, source and media-load procedure definitions, payload types, and catalog job names                                                             |
| `@miauflix/service-configuration` | Service configuration storage and lifecycle support                                                                                                          |

The application backend runs on Node.js. The catalog, list, source and media-load services run as separate Bun processes. Their clients use configured service URLs. The contract runtime also supports direct in-process transport; selecting that transport requires wiring a service instance explicitly, rather than leaving a service URL empty.

## Contract definitions

A contract declares its name, `major.minor` version, and methods. The builders describe four operation kinds:

- **`call<Input, Output, Error>()`:** a request with one result.
- **`stream<Input, Item, Error>()`:** an asynchronous sequence with cancellation and backpressure.
- **`event<Payload, Filter>()`:** a subscription to pushed updates.
- **`bytes<Input, Error>()`:** an HTTP byte response accessible through a signed URL or an `open()` call.

The runtime objects contain method kinds and options; TypeScript generic types supply the input, output, and error contracts. `Client<C>` derives the caller interface and `Impl<C>` derives the implementation interface.

`dedupe: true` shares an in-flight call for identical JSON-serialized inputs. Calls with a caller-provided abort signal do not share, so one caller cannot cancel another's request. A call with `ungated: true` can run while a service is not ready; catalog `setWatching` uses this for startup state delivery.

Contract typing does not validate arbitrary data at runtime. Browser-facing routes validate their inputs, and service provider adapters validate external data where required. The contract runtime supplies a `validated` wrapper for explicit schema-based validation in tests or other selected contexts.

Implementation: [builders](../../packages/contract/src/define.ts), [typed client](../../packages/contract/src/client.ts), and [service dispatcher](../../packages/contract/src/service.ts).

## Application contracts

| Contract       | Version | Main operations                                                                                                                                     |
| -------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `catalog`      | `2.0`   | Movie/show/season details, search/discovery, external-ID resolution, batches, artwork snapshots/events, backdrop focus, and watching-set delivery   |
| `lists`        | `2.0`   | Public/personal/community lists, Trakt association, watchlist synchronization, and playback synchronization                                         |
| `sources`      | `1.3`   | Incremental candidate searches, torrent metadata lookup, provider/repository management, and Cardigann definition synchronization                   |
| `media-load`   | `1.0`   | Torrent engine: source descriptors, downloads and claims, warmups, verified byte ranges (`read`), storage inventory, tracker scrapes (`swarmStats`) |
| `$` management | `1.0`   | Service status, status events, configuration schema, testing, applying, and clearing configuration                                                  |

The source search stream emits candidate records and a coverage/retry summary. `sources.torrentFile` returns base64-encoded torrent metadata or `null` through a regular call. `media-load` is the torrent engine. It owns WebTorrent downloads, claims, encrypted media storage and its storage records, and answers tracker scrapes. The backend owns candidate persistence, torrent verification, playback sessions, FFmpeg and subtitles. It names sources by id and sends each source's descriptor with `putSource` (again after `unknown_source`). The ungated `attach` call delivers `SOURCE_SECURITY_KEY` before each configuration push, so the key never travels as a setting. `playbackChanged` mirrors the open streams and `layoutKnown` reports file lists as they become known.

Definitions: [catalog](../../packages/service-contracts/src/catalog.ts), [lists](../../packages/service-contracts/src/lists.ts), [sources](../../packages/service-contracts/src/sources.ts), [media-load](../../packages/service-contracts/src/media-load.ts), and [management](../../packages/contract/src/management.ts).

## Version negotiation

Wire method names include the contract major, for example `catalog@2.getMovie`. A service advertises the versions it implements in the connection handshake and can register adjacent majors side by side.

A method's `since` option identifies the minor version that provides it. Once the connected service's minor version is known, the typed client rejects calls or streams requiring a higher minor with `unsupported`. This allows callers to handle an unavailable optional capability without sending that operation.

The backend's `RemoteService` selects its requested major when offered. A previous-major adapter is used only when the particular client descriptor supplies one and the service offers that major. Other combinations are incompatible. Adjacent-major compatibility therefore depends on registered implementations and adapters, rather than being automatic for every service pair.

Negotiation runs on connection and reconnection. Existing subscriptions retain the major selected when they are created.

## WebSocket control plane

Each backend remote client maintains one multiplexed WebSocket to the service's `/_c` endpoint. Calls, object streams, events, and management operations share that connection.

The handshake is:

1. The service sends `hello` with protocol version, identity, and advertised contracts.
2. The client sends `init`, including an optional service token and byte-ticket signing key.
3. The service validates the initialization and sends `ready` for the connection.
4. The client follows management status and the backend performs contract/configuration discovery.

Connection readiness means the transport handshake succeeded. Service readiness is a separate lifecycle state used to gate data-plane operations.

Frames are JSON arrays with a type, request ID, and operation-specific payload. The protocol version is `3`.

| Frame                    | Purpose                                           |
| ------------------------ | ------------------------------------------------- |
| `hello`, `init`, `ready` | Connection handshake                              |
| `call`, `ok`, `err`      | Single-result operations and failures             |
| `item`, `end`, `credit`  | Object-stream items, completion, and flow control |
| `sub`, `event`           | Subscription attachment and pushed payloads       |
| `cancel`                 | Abort a call, stream, or subscription             |
| `ping`, `pong`           | Connection liveness                               |

Binary call results can use a binary message containing a one-byte type, a four-byte big-endian request ID, and the payload. This is distinct from a contract method whose declared result is a base64 string.

The client reconnects with exponential backoff and jitter. Pending calls and streams fail when their connection is lost; reconnecting does not replay those operations automatically. Live subscriptions reattach and can invoke `onResync` so the consumer fetches a snapshot after an event gap. Subscriptions rejected as not configured retry when readiness permits.

Heartbeats run every 20 seconds, with a 60-second liveness timeout. Object streams use a 64-item credit window. Consuming items replenishes credits; ending iteration or aborting cancels the operation.

Implementation: [protocol constants and frames](../../packages/contract/src/protocol.ts), [remote transport](../../packages/contract/src/remote.ts), and [server sessions](../../packages/contract/src/service.ts).

## Management and backend integration

`RemoteService<C>` centralizes connection management for the backend's catalog, list, and source clients. On discovery it:

1. Checks the offered contract version.
2. Retrieves the remote configuration schema and registers it with the backend configuration system.
3. Delivers an available saved configuration snapshot through management `applyConfig`.
4. Maps remote lifecycle status into the backend's service-status reporting.

A service reporting `standby` can receive its configuration snapshot again. Configuration tests against a draft service URL use a short-lived connection, leaving the saved live connection unchanged. Applying configuration and clearing it use management methods; persistent configuration and encryption remain the responsibility of the relevant configuration stores.

Remote lifecycle states are `standby`, `configuring`, `ready`, `degraded`, and `error`. The backend gates ordinary calls and streams until its remote service reports ready. It maps unavailable/not-configured call failures into `ServiceNotConfiguredError`; management and explicitly ungated calls have separate readiness handling.

Initialization gives a connection a bounded startup window while reconnection continues in the background. A reachable service with rejected configuration remains distinguishable from a missing or incompatible service.

Implementation: [backend remote service](../../backend/src/services/remote/remote-service.ts) and [configuration integration](../../backend/src/services/configuration/configuration.service.ts).

## Errors and cancellation

Methods declare domain errors alongside built-in codes: `unavailable`, `not_configured`, `cancelled`, `timeout`, `bad_request`, `unsupported`, and `internal`. Callers receive `ContractError` values. Implementations can use `ctx.fail(code)` for a typed failure and observe the supplied abort signal.

Unexpected exceptions are reported through the service error hook and serialized as internal errors, without exposing their original message. Timeouts and cancellation stop the caller's wait and propagate cancellation to the implementation; implementations must cooperate with the signal to stop their work.

## Byte responses

The runtime's `bytes` primitive exposes `url()`, `path()`, and `open()`. Signed paths use `/_b/<wire-method>?t=<payload>.<expiry>.<signature>`. The HMAC-SHA256 signature binds the method, serialized input, and expiry. A service checks the ticket before invoking its byte handler, which receives request headers and an abort signal. The default ticket lifetime is six hours unless the caller specifies another duration.

Remote `open()` performs an HTTP request to the service; local `open()` calls the byte handler directly. Local URL generation requires a host-provided `bytesBaseUrl` that serves the service's HTTP handler. Range behavior belongs to the byte implementation and its forwarded request headers.

Miauflix's backend serves `/api/stream/:token` by proxying `media-load`'s `read` bytes response, forwarding the viewer's `Range`. FFmpeg reads verified decrypted ranges from the backend's private loopback input, which opens the same call. The supplied Caddy configuration does not route video to a separate contract-based streaming service.

Implementation: [signed tickets](../../packages/contract/src/tickets.ts), [local transport](../../packages/contract/src/local.ts), [video route](../../backend/src/routes/stream.routes.ts), and [FFmpeg input](../../backend/src/services/playback/torrent-input.ts).

## Local transport and trust boundaries

`createClient(contract, localTransport(service))` invokes a `defineService()` implementation directly. Calls and iterators do not serialize or copy their inputs and outputs, so both sides must treat these values as immutable. Events use callbacks and track service readiness; reattachment can trigger resynchronization.

The contract runtime supplies Node and Bun hosting adapters. A particular service can still depend on its runtime's storage APIs, such as Bun SQLite. Runtime support in the transport does not make every application service portable between Node and Bun.

Internal contracts do not replace public authorization. Browser routes authenticate users, check administrator roles, and validate inputs before calling internal services. Internal service addresses belong on the trusted application network; exposing them publicly would bypass that application boundary.
