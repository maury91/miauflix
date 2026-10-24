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
| `node-datachannel` (WebRTC)              | —              | ❓ Not tested |                                                                 |
| TypeORM + SQLite                         | —              | ❓ Not tested |                                                                 |
| Jest test suite                          | —              | ❓ Not tested | Would likely need porting to `bun test` or running Jest on Node |
| Full backend                             | —              | ❓ Not tested | Only WebTorrent was tested, in a standalone script              |

## The blocker: `utp-native`

With default options, Bun panics right after `new WebTorrent()`:

```
panic(main thread): unsupported uv function: uv_timer_init
```

`node_modules/utp-native/binding.cc` uses libuv timers directly. Bun implements only part of the libuv API for N-API addons; progress is tracked in [oven-sh/bun#18546](https://github.com/oven-sh/bun/issues/18546).

### Workaround

Pass `utp: false` in the WebTorrent options in `backend/src/services/download/download.service.ts`. Trade-off: uTP peers become unreachable (only TCP and WebRTC remain), which can reduce the peer count on some torrents.

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
