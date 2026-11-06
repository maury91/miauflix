# Bun Compatibility

Miauflix originally ran on Bun and moved to Node.js in `a2f8046c` ("Move from Bun to Node.js, implement magnet service"). This page tracks what still blocks moving back, so the migration can be picked up once Bun catches up.

## Status (checked 2026-10-24)

| Component                                | Version tested | Works on Bun? | Notes                                                           |
| ---------------------------------------- | -------------- | ------------- | --------------------------------------------------------------- |
| Bun                                      | 1.4.0          | —             | macOS arm64                                                     |
| WebTorrent (default)                     | 2.8.4          | ❌ Crashes    | `utp-native` calls `uv_timer_init` (see below)                  |
| WebTorrent `utp:false`                   | 2.8.4          | ✅            | DHT, trackers, metadata, `createReadStream`, `destroy()` OK     |
| `node:dgram` (DHT)                       | —              | ✅            | Missing in early Bun, now supported                             |
| `fs-native-extensions`, `utf-8-validate` | —              | ✅            | Native addons load fine                                         |
| `node-datachannel` (WebRTC)              | —              | ✅            | Loads on linux/arm64 (2026-11-05); needs `trustedDependencies`  |
| TypeORM + SQLite                         | —              | ❓ Not tested |                                                                 |
| Jest test suite                          | —              | ❓ Not tested | Would likely need porting to `bun test` or running Jest on Node |
| Full backend                             | —              | ❓ Not tested | Only WebTorrent was tested, in a standalone script              |

### Rechecked 2026-11-05: WebTorrent 3.0.21 on linux/arm64

Bun 1.4.0 in a linux/arm64 container ran WebTorrent 3.0.21 with this repo's `node_modules`. Metadata arrived in 0.6–1.9 s and the first 4 MB of Sintel streamed. Three findings:

- **uTP is already off on arm64, under Node too.** `utp-native` ships no `linux-arm64` prebuild, so WebTorrent silently runs without uTP in the arm64 images. The x64 crash below was not re-checked, because emulating x64 locally is too slow.
- **Bun blocks dependency install scripts.** A Bun workspace that uses WebTorrent must list `node-datachannel` in `trustedDependencies`, since it downloads its binary in a postinstall.
- **`bittorrent-tracker` alone needs `node-datachannel` too.** Its client loads the WebSocket tracker, which loads WebRTC, even when only UDP and HTTP trackers are used. The service images install with `npm ci --ignore-scripts`, so they run `npm rebuild node-datachannel` afterwards to fetch the prebuilt binary (glibc in `services/media-load/Dockerfile`, musl in the Alpine `services/Dockerfile`). Both were checked on linux/arm64 on 2026-11-06.
- The backend now uses the `maury91/webtorrent` fork (Hayase's `aio` branch, still 3.0.21), which switches to `@thaunknown/utp-native`. That addon has no `linux-arm64` prebuild either.

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

## Migration checklist (once unblocked)

1. Re-run the smoke test with uTP enabled.
2. Boot the full backend on Bun (`bun backend/src/app.ts` or equivalent) and exercise login, source search and `/api/stream/:token`.
3. Verify TypeORM/SQLite and `node-datachannel` under Bun.
4. Decide on the test runner (keep Jest on Node, or port to `bun test`).
5. Update `backend.Dockerfile`, CI workflows, and `.husky/pre-commit` (all switched from Bun to Node in `a2f8046c`).
