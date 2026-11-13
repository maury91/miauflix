# Media load service

Bun service implementing the `media-load` 1.2 contract on port 3004. It is the torrent engine: it runs WebTorrent, owns the encrypted storage (sources, files, claims, budgets and reclamation, in its own SQLite database), serves verified byte ranges to the backend (`read`), and answers tracker scrapes. It also builds TV remuxes of stored files with FFmpeg (`requestRemux`, `readRemux`: HLS with audio a Samsung TV decodes, stored encrypted next to the source; see the [TV remux plan](../../docs/plans/tv-remux-plan.md)). Playback sessions, live audio conversion and subtitles stay in the backend. See [Service contracts](../../docs/architecture/service-contract-v2.md) for the protocol and [Encrypted chunk storage](docs/chunk-stores.md) for the on-disk format.

On first start the service waits for the backend to hand over the storage that older backends recorded (`importStorage`, then `completeImport`); until then it reports `configuring` and refuses engine calls.

`swarmStats({ hash })` returns seeders (`complete`) and leechers (`incomplete`) for a v1 or v2 info hash. Requests arriving within 50 ms share one multi-hash scrape per tracker group: up to 70 hashes per UDP packet, 20 per HTTP request. Each count is the highest any tracker reported, results are reused for 60 seconds, and a hash no tracker answers within 5 seconds fails with `scrape_timeout`. UDP trackers receive raw hash bytes and HTTP trackers hex strings, in separate clients (`bittorrent-tracker` 11 sends an array of hex strings over UDP as text).

From the repository root:

```sh
bun install
npm run build:libs
npm run start:media-load
npm test --workspace @miauflix/media-load-service
```

Bootstrap environment: `MEDIA_LOAD_PORT` (3004; an empty or invalid value also means 3004), `MEDIA_LOAD_HOST` (0.0.0.0), `MEDIA_LOAD_DATA_DIR` (then `DATA_DIR`, then `./data`) for its database, `MEDIA_LOAD_DEFAULT_DOWNLOAD_PATH` (the download directory advertised while `DOWNLOAD_PATH` is unset) and `MEDIA_LOAD_LEGACY_DOWNLOAD_PATH` (an extra mount for importing downloads recorded under another path).

The backend discovers and pushes the `MEDIA_LOAD` configuration group, including the download, storage and tracker settings in [`src/config/schema.ts`](src/config/schema.ts). `SCRAPE_TRACKERS` (comma-separated announce URLs) lives there; `ws://` and `wss://` entries are ignored. An explicitly empty value means no trackers (swarm stats are unavailable); only a missing key falls back to the defaults. The service is in standby until the backend applies its configuration.

`bittorrent-tracker` loads WebRTC through its WebSocket tracker, so `node-datachannel`'s native binary must be installed. The Docker images run `npm rebuild node-datachannel` after `bun install --ignore-scripts`.

Tests mock `bittorrent-tracker` with `mock.module`, so they make no network calls.
