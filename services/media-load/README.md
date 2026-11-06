# Media load service

Bun service implementing the `media-load` 1.0 contract on port 3004. It is the torrent engine. Today it answers tracker scrapes; WebTorrent downloads, encrypted storage and byte ranges move here in later minor versions (see `plan/media-load-service.md`). Playback sessions, FFmpeg and subtitles stay in the backend.

`swarmStats({ hash })` returns seeders (`complete`) and leechers (`incomplete`) for a v1 or v2 info hash. Requests arriving within 50 ms share one multi-hash scrape per tracker group: up to 70 hashes per UDP packet, 20 per HTTP request. Each count is the highest any tracker reported, results are reused for 60 seconds, and a hash no tracker answers within 5 seconds fails with `scrape_timeout`. UDP trackers receive raw hash bytes and HTTP trackers hex strings, in separate clients (`bittorrent-tracker` 11 sends an array of hex strings over UDP as text).

From the repository root:

```sh
npm install
npm run build:libs
npm run start:media-load
npm test --workspace @miauflix/media-load-service
```

Bootstrap environment: `MEDIA_LOAD_PORT` (3004) and `MEDIA_LOAD_HOST` (0.0.0.0). The service keeps no data yet.

The backend discovers and pushes the `MEDIA_LOAD` configuration group. `SCRAPE_TRACKERS` (comma-separated announce URLs) lives there; `ws://` and `wss://` entries are ignored. The service is in standby until the backend applies its configuration.

`bittorrent-tracker` loads WebRTC through its WebSocket tracker, so `node-datachannel`'s native binary must be installed. The Docker images run `npm rebuild node-datachannel` after `npm ci --ignore-scripts`.

Tests mock `bittorrent-tracker` with `mock.module`, so they make no network calls.
