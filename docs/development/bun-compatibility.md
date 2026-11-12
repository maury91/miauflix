# Bun Compatibility

Miauflix originally ran on Bun and moved to Node.js in `a2f8046c` ("Move from Bun to Node.js, implement magnet service"). The services moved back first; the backend followed on 2026-11-08 (see [The backend on Bun](#the-backend-on-bun-2026-11-08)). WebTorrent, now in the media-load service, still runs without uTP.

## Status (checked 2026-10-24)

| Component                                | Version tested | Works on Bun? | Notes                                                              |
| ---------------------------------------- | -------------- | ------------- | ------------------------------------------------------------------ |
| Bun                                      | 1.4.0          | —             | macOS arm64                                                        |
| WebTorrent (default)                     | 2.8.4          | ❌ Crashes    | `utp-native` calls `uv_timer_init` (see below)                     |
| WebTorrent `utp:false`                   | 2.8.4          | ✅            | DHT, trackers, metadata, `createReadStream`, `destroy()` OK        |
| `node:dgram` (DHT)                       | —              | ⚠️            | Works, but hostnames on `udp4` sockets may resolve to IPv6 (below) |
| `fs-native-extensions`, `utf-8-validate` | —              | ✅            | Native addons load fine                                            |
| `node-datachannel` (WebRTC)              | —              | ✅            | Loads on linux/arm64 (2026-11-05); needs `trustedDependencies`     |
| TypeORM + SQLite (`sqlite3`)             | 0.3.27 / 5.1.7 | ✅            | Columns typed with a type alias need an explicit `type` (below)    |
| Backend test suite                       | —              | ✅            | `bun test --isolate` with a Jest compatibility preload (below)     |
| Full backend                             | —              | ✅            | Since 2026-11-08; runs its sources, not a `bun build` bundle       |

### Rechecked 2026-11-05: WebTorrent 3.0.21 on linux/arm64

Bun 1.4.0 in a linux/arm64 container ran WebTorrent 3.0.21 with this repo's `node_modules`. Metadata arrived in 0.6–1.9 s and the first 4 MB of Sintel streamed. Three findings:

- **uTP is already off on arm64, under Node too.** `utp-native` ships no `linux-arm64` prebuild, so WebTorrent silently runs without uTP in the arm64 images. The x64 crash below was not re-checked, because emulating x64 locally is too slow.
- **Bun blocks dependency install scripts.** A Bun workspace that uses WebTorrent must list `node-datachannel` in `trustedDependencies`, since it downloads its binary in a postinstall.
- **`bittorrent-tracker` alone needs `node-datachannel` too.** Its client loads the WebSocket tracker, which loads WebRTC, even when only UDP and HTTP trackers are used. The service images install with `bun install --ignore-scripts`, so they run `npm rebuild node-datachannel` afterwards to fetch the prebuilt binary (glibc in `services/media-load/Dockerfile`, musl in the Alpine `services/Dockerfile`, whose `services`, `catalog-services`, `sources` and `media-load` targets share that build stage; the `development` targets of the per-service Dockerfiles use glibc). Both were checked on linux/arm64 on 2026-11-06.
- The backend now uses the `maury91/webtorrent` fork (Hayase's `aio` branch, still 3.0.21), which switches to `@thaunknown/utp-native`. That addon has no `linux-arm64` prebuild either.

### Rechecked 2026-11-06: every discovery path in the media-load service

`services/media-load/scripts/webtorrent-probe.ts` checks each discovery path on its own, with the engine's options, under whichever runtime runs it. To run it in the dev container:

```bash
docker compose -f docker-compose.dev.yml run --rm --no-deps -T -v "$PWD/services/media-load/scripts:/workspace/services/media-load/scripts" media-load bun run scripts/webtorrent-probe.ts
```

Results under Bun 1.4.0 on linux/arm64:

| Path                                                           | Result                                                    |
| -------------------------------------------------------------- | --------------------------------------------------------- |
| The fork's APIs (`connectionBudget`, `setPriority`, throttles) | ✅                                                        |
| UDP trackers only                                              | ✅ metadata and 2 MB in 5 s over TCP peers                |
| HTTP tracker only (+ web seeds)                                | ✅ 1.5 s                                                  |
| DHT only                                                       | ✅ 7 s, 37 nodes (after the fix below; 0 before)          |
| Local TCP seed → leech                                         | ✅ 8 MB identical, the seeder uploads                     |
| Local WebRTC seed → leech (local WebSocket tracker)            | ✅ 12 s, WebRTC wire only                                 |
| Public WebRTC swarm (Sintel)                                   | ❌ also under Node: no peer in that swarm had metadata    |
| uTP                                                            | ❌ off under Bun (`utp: false`); no arm64 prebuild anyway |

Node 26 gave the same results, except for the DHT before the fix.

**DHT and IPv6.** On a `udp4` socket, Bun's `send()` to a hostname may resolve it to IPv6, and the send then fails with `EINVAL`. From this network only `dht.transmissionbt.com` answered, and it has an AAAA record, so the DHT never bootstrapped (0 peers where Node found 564). The service handles this in two ways:

- It calls `dns.setDefaultResultOrder('ipv4first')`.
- It resolves the DHT routers to every IPv4 address before WebTorrent starts (`services/media-load/src/engine/dht-bootstrap.ts`). With every address, bootstrap is stronger than plain hostnames give, which reach only the first address, even under Node.

**uTP stays off** (2026-11-06). A libuv-free `utp-native`, with JS-owned UDP and timer, runs under Bun, but uTP-first WebTorrent downloaded 2–4× slower than TCP-only on a public swarm. See `plan/utp-dgram/`.

**uTP on x64 is a real loss.** `@thaunknown/utp-native` has prebuilds for linux-x64, darwin and win32, so an x64 VPS running the old Node backend had uTP. Under Bun it would panic, so it stays off and only TCP and WebRTC peers remain.

### Cost under Bun and Node (2026-11-07)

`services/media-load/scripts/runtime-bench.ts` (`bun run …` / `node --expose-gc --import tsx …`), macOS arm64, Bun 1.4.0 against Node 22.22, two rounds each, with the engine's encrypted chunk store:

|                                              | Bun, uTP off                   | Node, uTP off                  | Node, uTP on                                            |
| -------------------------------------------- | ------------------------------ | ------------------------------ | ------------------------------------------------------- |
| Local seed → leech 512 MB (TCP, one process) | 103–109 MB/s, 5.4–5.6 CPU s/GB | 107–109 MB/s, 7.7–7.8 CPU s/GB | 59–60 MB/s (the transfer went over uTP), 17–18 CPU s/GB |
| Debian swarm, 60 s (757 MB)                  | 15.6–18.3 MB/s, 21–22 CPU s/GB | 18.7–18.9 MB/s, 28–31 CPU s/GB | 10.9–12.4 MB/s, 48–55 CPU s/GB                          |
| RSS peak / after the run                     | 888–1003 MB / 708–847 MB       | 1081–1108 MB / 275–596 MB      | 759–816 MB / 234–334 MB                                 |

- **Speed** is the same: Bun's one slower swarm run was swarm variance (its second run matched Node).
- **CPU** per GB is about 25–30% lower under Bun.
- **Memory:** peaks are similar (both hold the 512 MB transfer's buffers), but Bun keeps its RSS after the work is done where Node returns it. In the service's soak (the load test, 5 torrents, 12 min) RSS stayed between 217 and 325 MB with no trend, so it is retention, not a leak.
- uTP costs about twice the CPU per GB and is slower, under Node too.

## The blocker: `utp-native`

With default options, Bun panics right after `new WebTorrent()`:

```
panic(main thread): unsupported uv function: uv_timer_init
```

`node_modules/utp-native/binding.cc` uses libuv timers directly. Bun implements only part of the libuv API for N-API addons; progress is tracked in [oven-sh/bun#18546](https://github.com/oven-sh/bun/issues/18546).

### Workaround

Pass `utp: false` in the WebTorrent options. The media-load service does so under Bun (`services/media-load/src/engine/download.service.ts`). Trade-off: uTP peers become unreachable (only TCP and WebRTC remain), which can reduce the peer count on some torrents.

## How to re-check

Standalone smoke test (run from outside the repo, e.g. `/tmp`), with `bun <file>.mjs`:

```js
import WebTorrent from '<repo>/node_modules/webtorrent/index.js';

const client = new WebTorrent({ utp: process.env.UTP !== '0' });
client.on('error', e => console.log('client error', e.message));
// Sintel (CC-BY), WebTorrent's canonical test torrent
const magnet =
  'magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10&dn=Sintel' +
  '&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337&tr=wss%3A%2F%2Ftracker.openwebtorrent.com' +
  '&ws=https%3A%2F%2Fwebtorrent.io%2Ftorrents%2F';
const torrent = client.add(magnet, { path: '/tmp/wt-bun-test' });
torrent.on('ready', () => {
  const file = torrent.files.find(f => f.name.endsWith('.mp4'));
  let bytes = 0;
  file
    .createReadStream({ start: 0, end: 4 * 1024 * 1024 - 1 })
    .on('data', c => (bytes += c.length))
    .on('end', () => {
      console.log(`streamed ${bytes} bytes from ${torrent.numPeers} peers`);
      client.destroy(() => process.exit(0));
    });
});
setTimeout(() => process.exit(1), 90_000);
```

- `bun smoke.mjs` — if it streams 4 MB without the `uv_timer_init` panic, the blocker is gone.
- `UTP=0 bun smoke.mjs` — workaround path; should already pass.

## The backend on Bun (2026-11-08)

The backend runs on Bun 1.4.0 in development, tests and the Docker image. What changed, and what Bun does differently:

- **Server.** `Bun.serve` replaces `@hono/node-server`; `serveStatic` and `getConnInfo` come from `hono/bun`. Bun closes idle connections after 10 s by default, so `idleTimeout` is 255 s (the maximum): a stream may wait that long for its first pieces. Shutdown awaits `server.stop()`.
- **Realtime WebSocket.** Bun's own WebSockets replace `ws`: `Bun.serve` passes `/api/realtime` upgrades to `RealtimeGateway.upgrade()` and the sockets to its `websocket` handlers. A refused origin now gets a 403 response (the socket used to be dropped). Remote services use the global `WebSocket`.
- **Passwords.** `Bun.password` (bcrypt, cost 10) replaces the `bcrypt` package and verifies its hashes. Bun pre-hashes passwords longer than bcrypt's 72 bytes where the package truncated them, so a failed check retries with the first 72 bytes: users who chose such a password can still sign in.
- **Decorator metadata.** Bun compiles each file on its own, so a column typed with a type alias (`status: BackgroundJobStatus`) gets `Object` as its design type, which TypeORM rejects at startup (`tsc` resolved the alias to `String`). Such columns now name their type (`type: 'varchar'`, the type `String` mapped to, so the schema is unchanged): `BackgroundJob.status`, `MediaListItem.mediaType`, `Notification.type` and `StorageFileClaim.kind`.
- **No bundle.** `bun build` compiles modules reached through tsconfig `paths` (`@entities/...`) with standard decorators instead of the legacy ones `experimentalDecorators` asks for, and TypeORM's decorators then crash. The same file imported by a relative path is compiled correctly, and `bun run` handles both. So the image runs `backend/src/app.ts`, and the backend has no `build` script.
- **Client types.** `dts-bundle-generator` 9.5.1 fails on `bun-types` (`Cannot find symbol for node "TextEncoderEncodeIntoResult"`), so `tsconfig.client.json` builds the client types with Node's types and a stub of the `bun` module (`backend/client-types/bun`).
- **Response bodies.** `new Response('text')` has no `content-type` header under Bun. `parseResponseBody` used to read such a body as JSON, then again as text after the JSON failed, which throws (under Node too); it now reads the text once and tries JSON on it.

### Tests

`bun test --isolate` runs the backend suite (about 6 s for 95 files). `backend/src/__test-utils__/bun-jest.preload.ts` gives the tests the Jest behaviour they were written for:

- Manual mocks in `src/__mocks__` stand in for their module in every test, as Jest does for module names, unless the test calls `jest.unmock()` or imports the module by a relative path.
- Bun runs `jest.mock()` where it is written, after the imports. The preload reads the test file (`Bun.main`) and applies its top-level `jest.mock('module')` (no factory) and `jest.unmock('module')` calls first. A `jest.mock()` with a factory still runs in place; Bun updates the bindings of modules that already imported it.
- `jest.mock('module')` without a manual mock builds an automatic mock (functions and class methods become `jest.fn()`, each instance with its own method mocks, as in Jest). A factory returning a function or a plain object also becomes the default export, as with Jest's CommonJS interop.
- `jest.requireActual()` (a `?actual` query string loads a mocked file again, unmocked), `jest.requireMock()`, `jest.mocked()`.
- Fake timers are `@sinonjs/fake-timers` 13 (Jest 30's), with the async variants, which Bun lacks. `process.nextTick` and `queueMicrotask` are never faked.
- Bun binds `jest` in a test file to its own object unless the file imports from `bun:test`, so a loader plugin prefixes test files with an import of the test globals (on their first line, keeping line numbers).

Two Bun behaviours tests have to work around:

- `expect(promise).rejects` (and `.resolves`) waits for the promise where it is written: one kept to be awaited later blocks the test.
- `jest.spyOn(Date, 'now')` returns a spy without installing it while fake timers replace `Date`; use `jest.setSystemTime()`.

## Migration checklist (for the media-load service, once uTP is unblocked)

1. Re-run the smoke test with uTP enabled.
2. Turn uTP back on in `services/media-load/src/engine/download.service.ts` and compare peers and speed with TCP only.
