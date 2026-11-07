# Miauflix Detailed Changelog

Every change in full, for developers and self-hosters. The short version for users is in [CHANGELOG.md](CHANGELOG.md).

## Unreleased

### Features

- Profiles. A profile is an account signed in on the device (one session per account). After signing in, and whenever the app starts fresh (a new browser tab, a TV app launch), **Who's watching?** lists the device's profiles; the chosen one is kept in `sessionStorage` (`miauflix.currentSession`), so reloads, returning from the player and resuming the TV app keep it. Signing in (password or QR) adds a profile without switching to it, and logging out removes only that session. Switching drops the previous profile's cached lists, progress and notifications.
- Routes `/profiles`, `/profiles/manage`, `/profiles/new` and `/profiles/:userId/edit`. Home's sidebar shows the watching profile's avatar at the bottom (above Settings for admins). Like the bell, highlighting it opens a panel beside the rail (the profile's Plushie and name, **Switch profile**, **Edit profile** and **Logout**); Right or Enter moves into it, Left or Back returns to the rail. Switch profile opens Who's watching (Back returns without switching); Edit profile opens the editor, whose Save and Cancel come back to Home. Add profile appears only while an admin profile is signed in on the device: it creates an account (name, email, password, Plushie), signs it in on the device and returns to the selector with it focused. Manage profiles opens the editor. Manage profiles, the editor and Who's watching (when opened from Home) use the shared back rail of the other inner pages instead of Back or Done buttons, and the coding conventions name the back rail as the preferred way back. Storybook visual tests (`frontend/e2e/profiles.storybook.spec.ts`) capture Who's watching, Manage profiles, each editor tab and the sidebar's profile panel; the live Plushies are masked, since WebGL shading differs between machines. Logout signs the watching profile out of this device and keeps the account and its data.
- Avatars are [Plushies](https://github.com/prathje/plushies) (three.js, loaded on demand). The editor has Shape, Color & fabric, Face and Accessories tabs (fabrics, eyes, mouths, cheeks, moustaches, hats, glasses, pins and neckwear are picked from pictures, fabrics tinted with the fur colour; `npm run generate:profile-sprites` scales the original sheets in `assets/profile/` to 1x, 2x and 3x files in `frontend/public/assets/profile/` (not committed: the frontend's `build`, `build:tizen`, `dev`, `storybook` and `build-storybook` scripts generate them first, skipping when they are newer than the originals, and the Docker images copy the originals in for that), and each screen loads the one matching its density; items on transparent sheets are cut out by their own pixels, so a hat reaching into its neighbour's cell stays whole and does not show up next door). On the TV remote, the editor moves by rows (a shorter last row is still reached), keeps Left and Right within a row, crosses between the preview and the form only sideways (returning to where it left), enters the tabs on the selected one, and leaves the name, email and password fields with Up, Down or the keyboard's Done (Left and Right at either end of the text); Left and Right still adjust the Fine-tune sliders, a Fine-tune section (roundness, stuffing, eye size and spacing, face height, hat size) and Surprise me. Who's watching and the editor draw them live and animated (they move now and then and hop when focused); the TV build and browsers whose WebGL is not drawn by a GPU (refused with `failIfMajorPerformanceCaveat`, or a software renderer such as SwiftShader) show a picture instead, since a few animated software-drawn Plushies would take over the page; such browsers also leave drawing missing pictures to other devices. Saving renders the Plushie once to a 512×512 PNG that the server stores in the data directory (`avatars/<userId>.png`); a profile without a picture shows its colour. Shape tiles are filled with the chosen fabric in the fur colour: the middle of the fabric's picture, clipped to the shape by a CSS mask made from the shape's outline (an inline SVG), with a soft light and shade on top.
- Backend: `users` gains nullable `avatar` (the Plushie look as JSON) and `avatarRenderedAt` columns, added by schema synchronization (existing rows keep `null` until the `generateMissingAvatars` data migration gives each one a look). Every profile gets its Plushie once, from the editor's Surprise me generator: accounts created without a look (admin `POST /users`, the setup endpoint, the auto-created first admin) and, by the migration, accounts from before profiles. The option lists and the generator live in `@miauflix/service-contracts` (`profiles/v1` for the browser, which must not load the other contracts, and the package root for the backend), shared by the editor and the backend. A generated look has no picture yet: the first browser that can draw Plushies renders and uploads it (once per profile per app run), so TVs show it afterwards; until then a soft blob in the profile's colour stands in, without the initial letter it used to show. `UserDto` gains `avatar` and `avatarVersion`. New routes under `/api/auth`: `PATCH /session/profile` (`{ displayName?, avatar? }`, the session's own profile), `PUT /session/avatar` (`image/png`, at most 1 MB) and `GET /avatars/:userId` (any signed-in session). `POST /users` accepts optional `displayName` and `avatar` and answers 409 for an email that is taken. `GET /sessions` now validates up to 8 presented sessions (was 5), and the TV app sends up to 8. `GET /api/auth/avatars/:userId` takes the picture's `avatarVersion` as `?v=`, and only that versioned URL is cached for good (`immutable`); without it the response is `no-cache`, so a browser never keeps showing the picture from before a save. Changing a profile's look through `PATCH /session/profile` clears `avatarRenderedAt` (so `avatarVersion` becomes `null`) until the new picture is uploaded, so a TV never keeps the previous look's picture under the same version; the editor saves the look before uploading its picture. A picture render cut short (the profile list changing mid-render) is tried again instead of being skipped for the rest of the app run. Logout in the sidebar's profile panel ends every session of that profile on the device, so it leaves Who's watching even when it was signed in twice. Saving in the editor is blocked from the moment its picture starts drawing, so a second press cannot save (or create the profile) twice. The editor's preview and the profile panel no longer rely on `aspect-ratio` or `min()`, which the 2020 TVs lack. Logging out a profile signed in more than once ends its sessions one after the other, within the backend's one-logout-a-second limit (a turned-away logout is retried; a failed logout keeps the profile unless the server says its session is invalid, 401/403/404). A profile request whose session is refused removes only that profile from the device, not every profile. Adding a profile whose earlier attempt created the account but failed to sign it in now signs it in instead of answering that the email is taken. `PATCH /session/profile` no longer accepts `avatar: null`, so every profile keeps a look. The editor's focused tab shows a ring.

### Improvements

- Tracker scrapes are batched (`services/media-load/src/scrape/scrape-batcher.ts`, in the media-load service below). Requests made within 50 ms of each other share one multi-hash scrape per tracker group: up to 70 hashes in one UDP packet and 20 per HTTP request (about 1,400 URL characters). Previously each hash created its own `bittorrent-tracker` client. Concurrent requests for the same hash share one scrape, including requests that arrive after it was sent, and results are reused for 60 seconds (expired ones are swept at most once a minute). UDP trackers are given raw hash bytes and HTTP trackers hex strings in separate clients: `bittorrent-tracker` 11 packs an array of hex strings for UDP as ASCII text (40 bytes per hash), so a single shared client would send malformed UDP scrapes. `ws://` and `wss://` scrape trackers are ignored. Counts are now the highest seeders and leechers any tracker reported, not the first tracker's answer. Each hash settles on its own, when every tracker has answered it or 1 second after its first reply. A hash no tracker answers within 5 seconds still fails with `scrape_timeout`. v2 (64-hex) hashes are scraped by their first 20 bytes (BEP 52). The scrape timer is cleared when a scrape settles, and stopping the service fails waiting and in-flight scrapes at once with `scrape_unavailable`, without counting them as failed. The counters `activeScrapes`, `completedScrapes` and `failedScrapes` count hashes (`activeScrapes` includes hashes waiting to be sent); they moved from the backend's torrent diagnostics to the media-load status details.
- Torrent priorities. WebTorrent now comes from the `maury91/webtorrent` fork (Hayase's `aio` branch, still 3.0.21, pinned by commit `942f28ef`, now in `services/media-load/package.json`). The fork adds a shared `connectionBudget`, `torrent.setPriority()`, per-torrent `throttleDownloadSpeed`/`throttleUploadSpeed`, BEP 40 peer priority and uTP over IPv6. It replaces `utp-native` with `@thaunknown/utp-native`. The new `CONTENT_CONNECTION_BUDGET` setting (default 200) is the connection total shared by all torrents. Each torrent's share is its priority divided by the sum of every torrent's priority. Once the budget is used up, a torrent at its share takes no new peers, and no torrent loses peers it already has. `CONTENT_CONNECTION_LIMIT` stays a per-torrent limit. `DownloadService` sets priorities from `torrent-priority.ts`:
  - 10 while a file is streamed
  - otherwise the strongest live claim: playback 6, warmup 4, prefetch or watched 2, watchlist 1
  - 1 for seeding with no claim

  A torrent starts at its claim's priority. A playback start that joins a background start already in flight raises it. While a stream is still buffering (the existing speculative pause), torrents without a viewer are each capped at a quarter of `CONTENT_DOWNLOAD_LIMIT`. With no global limit (or one too large to be a finite number) they are not capped. Priorities are recomputed when a torrent's files become known, when claims are reconciled, when a stream opens or closes, and when the stream finishes buffering, with or without paused speculative downloads. Calls that arrive during a recompute are folded into one more pass.

- New Bun service `media-load` (`services/media-load`, port 3004), the first step of moving the torrent engine out of the backend (see `docs/architecture/service-contract-v2.md`). Contract `media-load` 1.0 (`packages/service-contracts/src/media-load.ts`) has one call, `swarmStats({ hash })`, which returns `{ complete, incomplete }` or fails with `invalid_hash`, `scrape_timeout` or `scrape_unavailable`; identical concurrent calls share one request (`dedupe`). The scrape batcher moved into the service. Backend changes:
  - The new `MEDIA_LOAD` configuration group holds `MEDIA_LOAD_SERVICE_URL` (default `http://localhost:3004`) and `MEDIA_LOAD_SERVICE_TIMEOUT_MS`.
  - `MediaLoadClientService` connects and pushes the configuration. It turns the contract's scrape errors back into `ErrorWithStatus` with the same codes, so the stats jobs still log a `scrape_timeout` at debug level.
  - `SourceMetadataFileService.getStats` calls the client. Without it, the call fails with `scrape_unavailable`.
  - `DownloadService.getStats` and the unused `StreamService.getStreamingStats` are removed.
  - `SCRAPE_TRACKERS` leaves the backend's `DOWNLOAD` group for the service's `MEDIA_LOAD` group. Stored and environment values keep working, since the backend pushes them to the service. An explicitly empty value turns scrapes off instead of falling back to the defaults. A tracker whose client throws while being set up (for example port 0) is treated like one that never answers.

  While the service is unreachable, stats jobs fail and are retried by the queue. Deployment:
  - The combined `miauflix-services` image starts the service and health-checks port 3004. With `docker-compose.vpn.yml`, its tracker traffic therefore goes through the VPN like before.
  - `docker-compose.yml` and `docker-compose.vpn.yml` set `MEDIA_LOAD_SERVICE_URL`. The dev and backend E2E compose files run it from `services/media-load/Dockerfile`.
  - `npm run dev` starts it, and `npm run start:media-load[:watch]` runs it alone.
  - Every Dockerfile copies the new workspace manifest.

  `bittorrent-tracker` loads WebRTC through its WebSocket tracker, so both service images run `npm rebuild node-datachannel` after `npm ci --ignore-scripts`. The setup wizard lists Media load with the advanced groups.

- The torrent engine moved into media-load (phase 3 of `plan/media-load-service.md`). `DownloadService`, the encrypted and file chunk stores, `EncryptedFileReader`, `TorrentDiagnostics`, the torrent priorities and `StorageService` now live in `services/media-load/src/{engine,chunk-stores,storage}`.
  - Storage records are in the service's own `bun:sqlite` database, `<MEDIA_LOAD_DATA_DIR>/media-load.sqlite`. The data directory is `MEDIA_LOAD_DATA_DIR`, else `DATA_DIR`, else `./data`. The database has the tables `source`, `storage` (one per source, with a foreign key to `source`), `storage_file`, `storage_file_claim` and `meta`, created by `PRAGMA user_version` migrations, and runs in WAL mode with foreign keys on.
  - File paths (deterministically, as the lookup column `k`), layouts and source descriptors are encrypted with the backend's `SOURCE_SECURITY_KEY`, in the format of its `EncryptionService`. The key reaches the service through the ungated `attach` call, which the backend makes before every configuration push (`RemoteService.beforeConfigure`). It is never sent as a setting. A canary row in `meta` makes the service refuse a database created with another key, and a running engine refuses another key.
  - Contract `media-load` 1.0 gained the engine calls `attach`, `putSource`, `sourceMetadataFile`, `predownload`, `isFileComplete`, `resolveLayout`, `mediaFiles`, `prepareSubtitleFiles`, `playbackHealth`, `releaseClaims`, `warmSource`, `pauseSource`, `promoteSource`, `isRangeVerified`, `rangeProgress`, `playbackActivity`, `storageStates`, `storageInventory` and `removeStorage`. It also gained the events `playbackChanged` and `layoutKnown`, and the bytes endpoint `read`, which honours `Range` and serves verified bytes only. Calls name sources by id. The backend sends a source's descriptor (hash, magnet link, size, `.torrent` file) once, again when the source gains its file, and again after the service answers `unknown_source`. Engine failures keep their codes (`torrent_not_ready`, `local_media_unavailable`, …) and become `ErrorWithStatus` again in the backend.
  - The backend's `MediaLoadClientService` keeps the method names the callers used: playback sessions, preparation, warmup, subtitles, audio conversion, background jobs and the stream and storage routes. Streams proxy the service's `read` response, and ffmpeg inputs read through the same call. Open streams are mirrored from `playbackChanged` (resynced with `playbackActivity` after a reconnect), so `hasActivePlayback()` stays synchronous. The mirror empties whenever the service is not ready. The service's `layoutKnown` events feed `SourceAvailabilityService`.
  - `GET /api/storage` labels the service's inventory with the backend's titles (`ContentSourceRepository.findWithMovies`), sorted by physical bytes, then reserved bytes, then title. `DELETE /api/storage/:sourceId` goes through `removeStorage`.
  - The download and storage settings (`CONTENT_DOWNLOAD_LIMIT`, `CONTENT_UPLOAD_LIMIT`, `CONTENT_CONNECTION_LIMIT`, `CONTENT_CONNECTION_BUDGET`, `CONTENT_SEED_DURATION_SECONDS`, `DISABLE_DISCOVERY`, `STORAGE_THRESHOLD`, `STORAGE_PLAYBACK_RESERVE`, `DOWNLOAD_PATH`, `DOWNLOAD_SALT`, `STATIC_TRACKERS`, `BEST_TRACKERS_DOWNLOAD_URL` and `BLACKLISTED_TRACKERS_DOWNLOAD_URL`) moved to the service's `MEDIA_LOAD` group under the same keys. Stored and environment values keep working, since the backend pushes them.
    - Limits and storage thresholds apply live.
    - The connection settings, discovery and tracker lists need a service restart, which the activation message names.
    - The backend's STORAGE group is removed, and its DOWNLOAD group keeps `CONVERT_H265_TO_H264` and `PRELOAD_WARM_TARGET`. The setup wizard's summaries follow, and Media load is no longer an advanced-only group.
  - The backend no longer depends on WebTorrent, `load-ip-set`, `thunky`, `filename-reserved-regex` or `typed-emitter`.
  - Under Bun the engine turns uTP off (`utp: false`); TCP and WebRTC peers remain.
  - The DHT bootstraps under Bun. Bun's `node:dgram` resolves a hostname for a `udp4` socket to IPv6 and the send fails with `EINVAL`, so the DHT never found a node (0 peers for a torrent where Node found hundreds). The service entry now calls `dns.setDefaultResultOrder('ipv4first')`, and the runtime resolves the DHT routers (`router.bittorrent.com`, `router.utorrent.com`, `dht.transmissionbt.com` and `dht.libtorrent.org:25401`) to every IPv4 address before it starts WebTorrent (`src/engine/dht-bootstrap.ts`), falling back to the hostnames when DNS gives nothing within 3 seconds. Plain hostnames reach only each router's first address. `services/media-load/scripts/webtorrent-probe.ts` checks each discovery path (UDP and HTTP trackers, DHT, WebRTC, local TCP and WebRTC seeding, the fork's APIs) under the current runtime.
  - A speculative read (an ffprobe or subtitle probe) whose first requested piece is not stored, on a source whose torrent isn't running, now fails with `local_media_incomplete` (503) before the response starts. If that first piece is stored but a later piece is missing, the response can still start as `206` and fail while streaming its body. Previously, even a missing first piece sent `206` headers before its body failed. This predates the move. Playback reads start the torrent and wait for the piece.
  - `services/media-load/scripts/load-test.ts` runs a media-load instance in-process and connects to it as its only host over the real contract. It times playback reads of a public Debian image while other Debian images predownload, and with `LOAD_SOAK_MINUTES` it keeps everything running and logs memory and file descriptors every minute.
  - Tests moved with the code to `bun test --isolate` (337 tests). `services/media-load/tests/helpers/engine.ts` replaces Jest's automocks and the backend's TypeORM test database (module mocks, `mockInstance`, an `EngineConfig` stub, an in-memory service database). The backend's HTTP VCR no longer records loopback URLs (`127.0.0.1`, `localhost`), so in-process contract servers in tests leave no fixtures.
  - Deployment:
    - `docker-compose.yml` mounts the downloads folder (`DOWNLOADS_HOST_PATH`) on `miauflix-services` at the backend's old path `/usr/src/app/downloads`, and no longer on `miauflix`. The backend keeps `DOWNLOAD_PATH` to push it.
    - The combined image sets `MEDIA_LOAD_DATA_DIR=/app/data/media-load`. Its entrypoint starts as root to change the owner of downloads written by the backend's user to `bunqueue` (only when some file is not already `bunqueue`'s), then drops to `bunqueue` with `su-exec`.
    - The dev compose mounts the downloads on `media-load` at both paths the backend used (`/usr/src/app/downloads` and `/usr/src/app/backend/downloads`) and its data at `./data/media-load`.
    - The E2E test compose gives the backend `MEDIA_LOAD_SERVICE_URL` (it had none), mounts the test downloads on `miauflix-services` and health-checks port 3004.
    - CI publishes a standalone `miauflix-media-load` image (the `production` target of `services/media-load/Dockerfile`, linux/amd64 and linux/arm64), like the other services' images.
  - Transfer statistics and verified pieces (contract `media-load` 1.1; calling these on a 1.0 service fails with `unsupported`):
    - Every second the service counts each loaded torrent's peers. Every 5 seconds the bytes it received and uploaded since the previous window become its speeds (the window average) and are added to the new `storage` columns `totalDownloaded` and `totalUploaded` (lifetime totals, unverified and duplicate bytes included). The sample (speeds and the average peer count) goes to the new `transfer_sample` table, except when nothing moved and no peer was connected. Samples older than a day are pruned once a minute and leave with their storage. Migration 2 adds the columns (0 for existing rows) and the table.
    - `storageInventory` items gain `transfer`: the last window's `downloadSpeed`, `uploadSpeed` and `peers` (0 when the torrent is not loaded) and the totals. `transferHistory({ sourceId, since? })` returns a source's samples, oldest first.
    - The event `piecesChanged` (filter `{ sourceIds? }`) reports verified pieces, batched to at most once a second per source: either `added` (the pieces verified since the previous update) or `bitfield` (the whole bitfield, base64, most significant bit first), whichever is smaller as JSON. A whole bitfield also follows lost pieces (reclaims) and a removed storage (`totalPieces` 0, empty bitfield). `storageBitfields({ sourceIds })` returns the current bitfields to start from. Every write of a storage's bitfield, whatever its cause, feeds the updates (`StorageRepository.onBitfield`). The backend does not use these yet.
  - `services/media-load/scripts/runtime-bench.ts` compares Bun and Node: a 512 MB local seed → leech with the encrypted store, then 60 s of the public Debian swarm, reporting throughput, CPU time and RSS. The load test also reports the transfer fields, the history and the piece updates.
  - Storage the backend recorded before this change is handed to the service once (phase 4 of the plan).
    - The ungated calls `importStatus`, `importStorage({ items })` and `completeImport` carry it. Each item is a source descriptor with its storage row, files and claims; dates are ISO strings and the bitfield is base64.
    - Until `completeImport`, the service reports `configuring` (message "Waiting for the host to import its storage") and refuses engine calls. No storage can be created that the import would then skip.
    - The service accepts source directories directly under `DOWNLOAD_PATH` or the service's optional `MEDIA_LOAD_LEGACY_DOWNLOAD_PATH` mount. It writes each source in one transaction, skips sources it already stores, drops playback claims and resets `activeStreams`. `completeImport` seals writes before adoption, then records success after the engine adopts the downloads. If adoption fails, the backend retries it without resending rows.
    - The backend runs `createStorageHandoff(db)` (`backend/src/services/media-load/storage-handoff.ts`) from the new `RemoteService.afterConfigure` hook, which runs after every accepted configuration delivery without delaying it.
    - The handoff sends the `storage`, `storage_file` and `storage_file_claim` rows in batches of up to 50 within the 16 MiB WebSocket limit. It skips rows whose source no longer exists and retries transient failures after 30 seconds. If one source exceeds the frame limit on its own, the backend logs its source ID and leaves the import incomplete, with its original files and records preserved. A fresh install completes an empty import.
    - The backend's rows are kept; a later release drops the tables.

### Bug fixes

- QR sign-in approval (`/auth/qr/:approvalToken`) works again since profiles: it only looked at the profile chosen in this app run, which a newly opened tab (the QR link) never has and which signing in on that page does not set, so it kept asking to sign in. It now approves with the chosen profile, else the device's only profile (including the one just signed in), and asks **Who is approving?** when several profiles are signed in and none is chosen. A refused approval session removes only that profile instead of every profile on the device.
- Live Plushies on the TVs, starting with Who's watching: `liveAvatarsSupported({ onTv: true })` lets a page draw live on the Tizen build when the TV's WebGL is drawn by a GPU (the 2020 TU8072 has WebGL 2 on a Mali-TDVX); the picture uploads still need a browser. Home's sidebar avatar is now a live Plushie on every device, drawn once and not animated (the viewer redraws only on a change): animated, it took Home on the TU8072 from 59 to 54 frames a second at rest and from about 48 to 41 while moving through rows, with half again as many frames over 50 ms; still, it measures the same as the picture (59 at rest, 48–49 moving). The profile panel's avatar remains a picture. three.js's `WebGLRenderer` needs `WeakRef` and `FinalizationRegistry` (Chromium 84), so the Tizen startup polyfills them: references stay strong and nothing is finalized, which only means objects never disposed are freed when their renderer is. On the TU8072, one animated Plushie draws at about 33 frames a second (median frame 17 ms, 95th percentile 58 ms). The editor, which always drew live, had failed on the TVs on the same missing built-ins. A Plushie that cannot be drawn now logs why (`The Plushie could not be drawn`) before falling back to its picture.
- Button layouts on the 2020 TVs (Tizen 5.5, Chromium 69). Chromium before 83 cannot lay out a `<button>` as a grid, and lays out a flex button's children in an inner box that takes the button's `align-items`. The sidebar's profile panel rows were grid buttons, so each icon's `width: 100%` made it about 300px square and the panel grew to about 1750px, running off the top of the screen; the notifications panel's rows and the episode rows (also grid buttons) had the same problem. They are now flex rows with fixed-size icons and posters. In the profile editor, the shape and picture tiles (`flex-direction: column; align-items: center`) shrank their pictures to the label's width (a fabric swatch was 28–62px wide instead of 120px); they now stretch and centre the label with `text-align`.

## 2026-11-03 v0.1.0 Samsung TV support, smarter sources, smoother playback, and better reliability

### Features

- Source website traffic moves from the backend to the Bun sources service (`services/sources`, port 3003), using the shared service contract and configuration protocol. The service normalizes candidates, validates hashes, merges trackers and returns incremental search results. Episode searches fall back from IMDb to episode and paginated season queries, so older episodes and season packs are searched beyond a site's newest-results listing.
- Runtime provider management (sources contract 1.1): admins can enable, disable and reorder providers, override per-provider daily and per-minute request budgets, test a provider, and add, refresh or remove provider repositories (JSON manifests, 256 KB cap, refreshed daily; the built-in `builtin:miauflix` repository cannot be removed and a repository never overwrites a provider owned by another one). Provider settings are sealed at rest and password-type values are masked. The backend exposes this under admin-only `/api/sources`, and the frontend adds Settings → Sources. Repository entries of kind `http` are stored but only run once that provider type ships.
- Engine compatibility with community definitions (found by trying [dreulavelle/Prowlarr-Indexers `Custom`](https://github.com/dreulavelle/Prowlarr-Indexers/tree/main/Custom), a set of aggregator definitions that all search by IMDb id): the short `caps.categories` form, JSONPath roots (`$.data.items`) in JSON selectors, namespaced XML selectors (`torznab|attr[name=infohash]`), and no CSS check on selectors of JSON definitions. Most of those definitions need a debrid account or a self-hosted instance, so a `torrentio.yml` for the public Torrentio addon was added to `maury91/miauflix-indexers` (one request by IMDb id and season/episode returns episodes and season packs); it is one of the built-in providers, switched on.
- The indexer picker's filters now describe indexers that need an account too: what their definition says they can do (IMDb search, movies, TV, anime) is recorded even though they cannot be installed, so IMDb search with Public only off lists the 244 definitions that declare it (4 of them public) instead of only the ones we can run. Their rows say why they cannot be added and still show what they support. Stored rows are re-read from the cached definitions once, without downloading anything.
- **No indexer-specific code in the repository.** The native YTS, EZTV and TheRARBG providers, their recorded fixtures, mirror discovery, the site mocks and the `yts-sanitizer` and `therarbg-sanitizer` packages are removed, along with the `YTS_API_URL` and `THE_RARBG_API_URL` settings. Every indexer is a Cardigann definition fetched at runtime. By default that is Prowlarr's `definitions/v11` (YTS among others) plus `maury91/miauflix-indexers`, a separate repository holding the definitions Prowlarr lacks or that do not search by IMDb id (EZTV's JSON API, TheRARBG by title and by IMDb id). A fresh install enables TheRARBG (IMDb), YTS, EZTV (API), Torrentio and TheRARBG (title), and lists Nyaa, EZTV and The Pirate Bay switched off; migration removes the old native provider rows and their usage. A source's own description is shown on its row (`ProviderView.description`), and the backend E2E suite now uses a generic indexer mock with its own test definitions, loaded through the new `SOURCES_PRELOAD_PROVIDERS` startup setting (`<definition id>@<source URL>` entries).
- Jackett Cardigann engine (sources contract 1.2): the sources service runs public Jackett YAML definitions natively, without Jackett. Definitions are fetched at runtime from the configured definition sources (see below; Jackett's are GPL-2.0, so they are never bundled), cached in the service database and kept current by the hourly sync. The supported subset covers Go templates (`if`/`else`/`range`, `or`/`and`/`eq`/`ne`/`not`/`re_replace`/`join`), the usual text, date and size filters, and HTML, JSON (including nested rows and `..` parent access) and XML selectors. Definitions that need an account, use an unsupported filter or template feature, or are malformed are rejected at install time. They remain visible in the indexer picker with the reason they cannot be added, unless excluded by the Public only or Hide unsupported filters. Results that only offer a `.torrent` link or a details page are resolved to a hash by reading the best-seeded eight per search; the rest are dropped. Three public indexers (Nyaa, EZTV, The Pirate Bay) are listed in the built-in repository, disabled; enabling one fetches its definition.
- Torznab client: add a Jackett or Prowlarr endpoint with its URL and API key (sealed at rest). Capabilities come from `t=caps` (cached 24 h, with defaults when unreachable); IMDb searches try `tt…` first and fall back to digits once.
- The Jackett definition list is synced into the sources service database every hour (`CARDIGANN_SYNC_INTERVAL_MINUTES`, default 60; the first run starts shortly after the service is configured, and failed runs retry after 5 minutes). For GitHub-hosted definitions a run uses git (a shallow, sparse, blob-less clone of the definitions folder in the service's data directory; `git` is installed in the service images): one fetch reports which files changed and one checkout downloads only those in a single pack. Measured against Jackett's repository, the first sync takes about 4 seconds and a run with no changes about 1 second, where one request per file took over 35 seconds. If git is unavailable or cannot reach GitHub, a run falls back to listing the upstream tree through GitHub's trees API and downloading the files one by one (set `SOURCES_USE_GIT=false` to always do so). That listing is compact and not capped at 1,000 files, unlike the contents API and compares each file's sha with what it stored: an unchanged tree sha downloads nothing, otherwise only added or changed definitions are downloaded again (6 at a time) and removed ones are dropped, with the change counts kept (`lastChange`). Sources without per-file versions (`<url>/index.json`) are re-read daily instead. Each definition is read once into a `cardigann_index` table (name, language, type, IMDb/TMDB/TVDB search, movies, TV, anime, FlareSolverr, supported or why not), and installed indexers pick up their new definition automatically. A manual Check for updates starts a run at once (sources contract 1.3).
- The indexer definitions come from a configurable list of sources, `CARDIGANN_DEFINITION_SOURCES` (GitHub folder URLs, as `…/tree/<ref>/<path>` or the raw form, separated by spaces or commas; any other http(s) folder that serves an `index.json` also works). The default is Prowlarr's `definitions/v11`: it mirrors Jackett's definitions without the trackers Prowlarr blocks (TheRARBG and TorrentGalaxy are not in it), so the built-in entries are now Nyaa, EZTV and The Pirate Bay from Prowlarr, and the earlier Jackett built-ins that nobody touched are removed. Adding Jackett's folder (`https://github.com/Jackett/Jackett/tree/master/src/Jackett.Common/Definitions`) offers both, and an indexer that exists in several sources is listed once per source, with a Source filter and each copy installable on its own (`prowlarr-<id>`, `jackett-<id>`). Each source has its own clone, sync status and error; removing a source stops offering its indexers while ones already installed keep working from their cached definition. Existing data is migrated: cached definitions and the catalog keep their Jackett origin.
- Regular expressions in definitions are read as Go/.NET syntax: inline flags such as `(?i)` and `(?s)` and `(?P<name>` groups are translated for JavaScript (a community EZTV definition failed on `(?i)`).
- Two more Cardigann engine fixes from testing real definitions: a bare number in a size field (what JSON APIs return) is a count of bytes, not kilobytes (YTS sizes were read 1,024 times too large), and a mode's own parameter list is authoritative, so an ID-only definition such as an API with no text search is no longer offered text queries.
- Found by running Jackett's real TheRARBG definition against the live site: the Cardigann engine now reads Unix timestamps (seconds or milliseconds) as dates, applies the row-level `andmatch` filter (rows must contain every search keyword) and passes a site's `Retry-After` to the provider's pause on HTTP 429.
- The indexer picker filters and pages on the server: IMDb search, TMDB search, TVDB search, Movies, TV, Anime, Public only and Hide unsupported, plus a text search on the name. It opens with IMDb search and Public only on, loads 40 at a time as the end of the list comes into view (or with Show more), and shows when the list was last updated, what changed, and the progress of a running sync. Indexers that cannot be used (accounts, unsupported features) say why and cannot be added.
- Settings → Sources can browse the Jackett definition list, add an indexer, add a Torznab endpoint and remove providers the admin added (kept in a `local:user` repository that appears only while it has providers).
- The sources planner owns provider budgets, request limiting, cooldowns, query caching and search memory. Its VPN guard protects provider and metadata-cache website requests. The backend retains candidate persistence, episode-file matching, WebTorrent metadata, tracker stats, notifications and playback; provider metadata-file URLs cross the boundary only as encrypted references.
- Movie search summaries persist provider coverage, completion and the next retry time. An append-only data migration resets search scheduling for the new planner while keeping existing movies, sources and associations. On-demand movie searches keep saving later results after the caller's response timeout.
- Local development starts source search with `npm run start:sources` (or `npm run start:sources:watch`), and `npm run dev` starts it with the backend, frontend, catalog and lists. Docker's combined services image and its healthcheck include port 3003; the standalone `miauflix-sources` image and development compose service use the same workspace. The backend connects through `SOURCES_SERVICE_URL`, including the shared VPN network and offline E2E stack.

- The compose files combine: `docker-compose.yml` (the former `docker-compose.quickstart.yml`, prebuilt images) is the base of every deployment, and each feature is a file listed after it in `COMPOSE_FILE` (the base must come first, the features in any order): `docker-compose.vpn.yml` (NordVPN), `docker-compose.https.yml` (Caddy), `docker-compose.flaresolverr.yml`, `docker-compose.tracing.yml` (Jaeger) and `docker-compose.build.yml` (build the images from the checkout, running Miauflix as your user so it can read the mounted `.env`). FlareSolverr and Jaeger move into the VPN's network when the VPN file is listed. Image tags follow `MIAUFLIX_VERSION` and `MIAUFLIX_IMAGE_NAMESPACE`. `npm run start:backend:docker:prod` and `npm run config-only:docker` use the `COMPOSE_FILE` from `.env`, or build from source with FlareSolverr, tracing and (with `NORDVPN_PRIVATE_KEY`) the VPN. **Breaking for source-built deployments:** `docker-compose.novpn.yml`, `docker-compose.prod.yml` and the nginx/certbot services are gone (Caddy replaces them), the catalog, list service and Bunqueue run in one `miauflix-services` container, data lives in Docker volumes instead of `./data`, and the backend listens on port 3000 instead of 5000. `docs/setup/docker-setup.md#moving-from-the-old-source-built-stack` copies the data over. The compose files no longer pass `JWT_SECRET`, `STREAM_TOKEN_SECRET`, `STREAM_KEY_SALT` and `SOURCE_SECURITY_KEY` (the old `docker-compose.https.yml` did). Secrets given through the environment are never saved to `config.json`, so a deployment that set them in `.env` must keep passing them, or Miauflix generates new ones and can no longer read its encrypted data, see `docs/setup/docker-setup.md#secrets-set-in-env`. `docs/setup/ssl-certificates.md` is gone: HTTPS is covered in `docs/setup/docker-setup.md#https-with-a-domain`

- The prebuilt-image deployments (`docker-compose.yml` without `docker-compose.build.yml`) update themselves: they run [Watchtower](https://watchtower.nickfedor.com/) (the maintained fork, the original `containrrr/watchtower` is archived), which checks every day at 4:00 for a new image of the tag in use and recreates only the Miauflix containers, removing the replaced images. `WATCHTOWER_SCHEDULE` changes the time. It needs the Docker socket
- `scripts/update.sh` updates a prebuilt-image deployment right away: it pulls the images, recreates the containers that changed and waits until every container is running and the health-checked ones are healthy (`HEALTH_TIMEOUT`, 6 minutes by default, counted from when the containers start being recreated). It then removes only the images it replaced, leaving other projects' unused images alone. `--files` first downloads the newest compose files and `Caddyfile` the deployment already has (from `MIAUFLIX_FILES_REF`, `main` by default): it changes nothing if any download fails, keeps each replaced file as `<file>.<date>-<time>.bak`, and recreates Caddy when the `Caddyfile` changed (on the next run too, if this one fails before Caddy is recreated). `MIAUFLIX_LISTEN_ADDRESS` in `.env` (for example `0.0.0.0`) opens Miauflix to the local network, so it no longer takes an edit to `docker-compose.yml` or `docker-compose.vpn.yml` that `--files` would replace, see `docs/setup/docker-setup.md#updating-miauflix`
- Fake sources are remembered: as soon as a source's file list is known (a downloaded torrent file, a resolved layout, or a playback attempt) it is judged by whether video makes up most of its bytes, and a fake (an `.exe`, an archive, or a small sample beside one) is stored as such and never picked again. Sources are checked ahead of Watch: browsing or opening a title with no verified source queues a background check of its candidates, one torrent at a time with a timeout, without downloading any payload. A data migration judges every source whose file list is already known
- Movies and episodes report whether a playable source exists: movie details and season episodes include `sourceAvailability` (`available`, `pending` or `unavailable`), and changes are pushed live over the realtime connection (`source-availability`), only to the clients showing or focusing that title. Changes missed while the connection is down are not replayed, so after a reconnect the pushed values are dropped and the details are fetched again. The details and browse badges show a "No source" icon instead of the quality, and episodes are marked "No source available", once every source found proved fake
- The player moves on by itself when a source fails and shows "Trying source N of M" while it works through the candidates (pushed live as `source-attempt` while a session is created). Each retry sends the sources that already failed in this browser (`avoidSourceIds`), so the backend picks a different one. When a movie has no source at all (none found, or every one proved fake), the **Watch Now** button on its details becomes **Notify Me**, and turns back once a real source is found. Once every source is exhausted during playback, the player says there is no source for the title and offers **Notify me**, which sends a notification as soon as a real source is found. A user can have up to 200 pending requests, for titles the catalog knows. Requests are re-checked in the background every 6 hours (every pending request, not only the 50 oldest, and a title whose check fails doesn't stop the others), and an episode's matches that are not verified yet are queued for a check
- The frontend can be packaged as a Samsung TV (Tizen) app: `npm run package:tizen -- https://your-domain` builds `dist/miauflix.wgt`, which runs from the TV's storage against your backend. Install it with Apps2Samsung (`docs/setup/samsung-tv.md`). The Tizen build is a single classic script with relative paths, so it loads from `file://`, and polyfills `globalThis`, `queueMicrotask`, `Object.fromEntries` and `String.prototype.replaceAll` for 2020 TVs (Chromium 69). It registers the remote's media and Search keys, and no longer scans the local network for the backend. The TV app signs in with bearer tokens: with `X-Auth-Transport: token`, `POST /api/auth/login`, `/setup`, `/refresh/:session` and `/qr/:requestId/claim` return `tokens` in the body instead of setting cookies, the API accepts `Authorization: Bearer` (with `X-Session-Id`), refresh and logout accept `X-Refresh-Token`, `GET /api/auth/sessions` accepts `X-Refresh-Tokens` (`session:token` pairs, the first five are checked, and the TV app forgets the ones the backend no longer lists), and the realtime `authenticate` message accepts `accessToken`. The new `ALLOW_TV_APP` setting (on by default) allows the app's local origin `file://`, which web pages cannot send, in CORS (without credentials) and on the realtime socket. `ALLOW_TV_APP_NULL_ORIGIN` (off by default) also accepts the opaque origin `null`, for a TV that reports local files that way; any web page can send `null`, so with it on a page you visit can read unauthenticated responses and, while first-run setup is open, create the admin account. In the Tizen build a styled-components plugin rewrites the CSS Chromium 69 lacks as the styles are generated: `:focus-visible` becomes `:focus`, `inset` and the logical `*-inline`/`*-block` shorthands become physical sides, `dvh` becomes `vh`, `clamp()`/`min()`/`max()` are resolved against the TV's screen, flex `gap` becomes margins between the children, `aspect-ratio` becomes a height, and masks get the `-webkit-` prefix; browsers get the styles unchanged. On the TV, playback uses AVPlay, Samsung's native player: the app tells the backend it decodes Matroska and MP4, H.264 and H.265, and AAC, MP3, AC3, E-AC3 and FLAC audio, so those files are streamed as they are, without conversion, and audio tracks switch in place. Files with other audio (DTS, TrueHD) still play converted audio in a `<video>` element. Subtitles are drawn over the video by the app, so timing adjustment works as in the browser; volume and fullscreen controls are hidden on the TV. The TV build loads `webapis.js` and asks for the `productinfo` privilege, to play 4K sources in 4K on UHD panels, and requests the stream and prefetch URLs from the backend origin instead of the app's local page. Its QR login code, and the public URL the configuration form suggests, point at the backend's origin too, where the web app is served. `npm run install:tizen -- <tv-ip>` installs `dist/miauflix.wgt` on a TV in Developer Mode with `apps2samsung-cli`, signed with a Samsung certificate, and opens it
- The Samsung TV app finds its server at runtime, so one package works for any server: `npm run package:tizen` no longer needs the backend's origin (passing one makes it the default). The server the TV connects to is kept on the TV, and checked at every start. When the TV has none, or it doesn't answer, the TV shows a server picker (it reconnects by itself once the last server is back):
  - **On your network**: the TV lists the servers that answer among the ones announced to the pairing service from its own public IP, and among every host of its /24 network on port 3000 (`GET /api/health`, which now also answers `service: "miauflix"`)
  - **Or type its address**: an IP gets port 3000 and `http://` when they are missing
  - **Settings → Change server** on the TV signs out and opens the picker again
  - The backend announces itself to the pairing service every two minutes (`POST /v1/discovery`, straight from the server) with the addresses a TV on the network can reach it at: `TV_PAIRING_ADDRESSES` when set, otherwise its private IPv4 addresses (outside a container) and the private IPv4 addresses it was opened at (the `Host` header, which is how it learns its LAN address in Docker; only from requests that come from a private IPv4 address; it keeps the 32 most recent and announces at most 8 addresses). On by default: turn it off on the server with `TV_PAIRING_ENABLED=false`, and leave the lookup out of the TV package with `npm run package:tizen -- --no-pairing`; `TV_PAIRING_URL` and `--pairing-url` point both at your own instance
- New standalone service in `tv-pairing/` (outside the Miauflix workspaces), hosted at `pair.miauflix.cat` and published as the `miauflix-tv-pairing` image: one endpoint, `POST /v1/discovery`, where a server announces its local addresses (`role: "server"`) and a TV gets the servers announced from its own public IP (`role: "client"`, an IPv6 client matched by its /64). Announcements older than 5 minutes are dropped; it keeps them in memory only and rate-limits each network. It is not part of a Miauflix install, see `tv-pairing/README.md`

### Improvements

- The TV's Home hero backdrop is sized for the TV, and sharpens while you rest on a title. It used a `w780` backdrop on every TV, which a 2023 QCQ80 stretched to the hero's 1344 pixels. Now the backdrop shown while moving and the one shown once the selection rests are each the smallest size that covers the hero (70% of the app's width), up to what the TV's generation paints smoothly (`frontend/src/shared/config/tv-profile.ts`): 2023 and newer TVs, dated by their model code (`webapis.productinfo.getModelCode()`, `23_…`) or else their browser version, get `w1280` while moving and the `original` at rest (measured on a QCQ80: 70 ms and 97 ms to decode); older ones `w780` and `w1280`. Once the selection rests, the hero loads the resting backdrop while idle (no key pressed for a second), decoded and ahead of the rows' idle preloads, and crossfades to it; moving on drops it unless it has started. A title whose resting backdrop has loaded shows it at once, and details uses it too. `MIAUFLIX_TV_HERO_BACKDROP` and `MIAUFLIX_TV_HERO_BACKDROP_RESTING` (`w300`, `w780`, `w1280`, `original` or `auto`) set the sizes when packaging (`docs/setup/samsung-tv.md`)
- Home on the TV: Back on the remote (or Esc) while browsing the rows opens the sidebar, and pressing it again returns to the selected card. Right on the sidebar's bell no longer opens an empty notifications panel when there are no notifications, read or unread
- Playback can be capped by bitrate: a playback session's `preferences.maxBitrateKbps` (500 to 1,000,000) is the highest average bitrate the client's connection sustains. A movie's sources are estimated from their size and the movie's runtime: the ones within the cap keep their ranking and are tried first, then the rest from the leanest, so a movie with nothing under the cap still plays. A finished download over the cap no longer wins over a leaner torrent. Episodes are capped too, against the show's typical episode length (TMDB's shortest episode runtime, stored on the show as `episodeRuntime` on its next details sync) and the size of the episode's own file in the source, so a season pack counts one episode, not the whole season. A file stored by its path inside the provider's release (without the torrent's top folder) is found by that suffix, as playback does, when exactly one file matches; with several matches its size stays unknown. A show without an episode runtime on TMDB stays uncapped, and a source whose file list is unknown keeps its place. A requested quality (rather than `auto`) is matched among the sources within the cap first, so asking for 4K no longer picks a 4K source over the cap when a lighter source fits; over-cap sources are only used when nothing fits The TV app asks for 8 Mbit/s at most: it fetches a stream at about 11 Mbit/s, and a 4K remux (~35 Mbit/s) froze on its first frame for 18 seconds, then played at a third of real time without audio
- On the TV, loading spinners no longer keep the main thread busy: Chromium 69 animates SVG (the spinner icon's own SMIL loop and its CSS spin) on the main thread, a full frame on every display refresh even out of view, so a row still loading far below the screen cost about 10 ms per frame for as long as it loaded. The TV build spins an HTML element instead, which the compositor animates, including the hero's "checking sources" indicator, and a row loading off screen shows no spinner.
- Home no longer re-renders when the backend pushes the focused title's source status or warmup progress (every few hundred milliseconds while a title warms up): the hero and details read it themselves, and the hero ignores warmup progress, which it doesn't show. Rows and the hero no longer re-render when their own promotion and backdrop requests start and finish, and the set of empty lists keeps its identity while it doesn't change, so loading pages no longer re-renders Home. On the TV a single move along a row now takes 42–44 ms of main thread, down from 47–66.
- Home loads its lists from the store instead of from each row: Home names the rows it wants, a middleware keeps the list pages they need (the selected page and the pages beside it) subscribed and releases the rest, and rows only read the cache. Empty lists are left out before their row renders, so no row mounts just to find out it is empty.
- Home on the TV readies the rows below while you're idle: from a second after the last key press, one more row every half second, up to 10 rows below the visible ones. A ready row is fetched, mounted and rendered in full off screen, so moving down finds it ready; it isn't promoted to the backend until it is on screen. Home also scrolls between rows with a CSS transition that the compositor runs, and the rows around the focused one mount, unmount and load once the slide to it has ended, not during it or on every move of a quick run.

### Bug fixes

- The player works with a TV remote: the Play/Pause, Play and Pause keys play and pause from anywhere in the player (they were registered with the TV but nothing handled them). Up and Down move one level at a time through the controls, top to bottom: **Back to details**, the video (where Left and Right seek), the seek bar (where Left and Right seek too) and the row of buttons (where Left and Right move along it). Before, Up and Down both jumped from the video to **Back to details** and straight back, so the buttons could not be reached. While the controls are hidden, Up or Down shows them first. The player's focused controls get a 3-pixel ring, easier to see over video
- A torrent nobody wants any more is taken off the torrent client: when its last claim expires or is released (a warmup moving to another title, an expired prefetch) and it isn't streaming, starting or seeding a completed download, it is detached, keeping its encrypted files and downloaded pieces, and a new claim attaches it again. Before, it stayed attached with nothing selected, still connected to its peers and holding its buffers. These piled up over time until the server ran at 300% CPU with 3 GB of buffers, and every request, `GET /api/auth/sessions` included, took seconds. A source that fails while its expired claims are swept no longer stops the sweep, so the other sources are still detached
- A Continue watching card shows the same episode its row selected: the card's progress now skips the playback the row skips (the first five seconds and the last second), so a show's card no longer shows a newer episode stopped within five seconds. A show's details open the season and episode its card shows, by the same rule (before, they opened the newest episode watched, even one stopped within five seconds or finished). On the TV, a row that leaves view goes back to rendering only the cards in view, unless Home keeps it ready below. Opening a card on the TV right after moving to it stores that card at once, so Back returns to it rather than to the card before.
- A Home row whose list has nothing in it (an empty watchlist, for example) is removed instead of showing "Nothing here yet". Rows load ahead of the selection, so it usually goes before you reach it; if a row above the focused one goes, the focus stays on the same row. An empty list stays cached while Home is open, so its row no longer comes back a minute later, and a row shows "Loading..." until its list is fetched, instead of "Nothing here yet" before the request starts. If the focused row itself turns out empty, the focus moves to the row now in its place, or to the row above when it was the last one (before, no row had the focus and the keys did nothing).

- Holding a key along a Home row on the TV no longer drops frames on cards not shown before: 46–49 fps, up from 30–35. Each row draws one focus ring over its leading slot, so the cards no longer scale on focus (`MediaCard` takes `externalFocus` for this). A held run of moves updates Home and the hero once it pauses for 150 ms (a single press still updates them at once). Rows slide with a CSS transition that the compositor runs, instead of a transform written from JavaScript every frame. Untouched rows no longer re-render with Home. Details in `docs/development/tv-performance-plan.md`.
- Home on the TV does less per move (Phase 2 of `docs/development/tv-performance-plan.md`). Rows move on a `translate3d` track inside their clipped viewport instead of scrolling, so Chromium 69 no longer lays out the page on every animation frame. The web build keeps native scrolling. Rows off screen render only the cards in view, and a row that comes into view gets the rest 400 ms later, after the move. Expanded rows keep two cards of margin past a page instead of four. Each card receives its own progress entry from a lookup built once per progress change, instead of scanning every entry. Artwork URLs are cached. The hero's title, metadata and overview no longer re-render when its backdrop layers change, and the sidebar no longer re-renders with Home. On the TV, the hero changes its backdrop only once the selection has rested for 250 ms, so a run of moves rasterizes one full-width backdrop instead of one per move. The title and details still change at once
- Moving along a Home row no longer floods the store (Phase 1 of `docs/development/tv-performance-plan.md`). Artwork that arrives again unchanged leaves the state as it is, and Home and realtime pushes store a row's artwork in one update instead of one per title. Continue watching reads only its own titles from the query cache, so loading the hero's details no longer rebuilds that row. The realtime interest is published once scrolling settles, and only when it changed, instead of twice per scroll frame. Moves within a row no longer re-send the active row, and the viewport promotion skips an unchanged set of titles. The realtime middleware hands the interest and artwork subscriptions straight to the socket without running them through the reducers and subscribers. A preparation status the backend repeats unchanged (several times a second) is dropped before it reaches the store, so it no longer notifies every subscriber or re-renders the hero. On the TV, four moves along a row went from 461 store notifications, 21 fps and a 180 ms p90 frame to 33–42 notifications, about 49 fps and a 25 ms p90, and main-thread work per key from about 640 ms to 213 ms
- Frontend styles start moving to CSS compiled at build time, so the TV no longer generates and inserts CSS while it runs (each insertion makes Chromium 69 restyle the whole page). `docs/development/css-architecture.md` sets the rules: no values computed in style definitions, variants as `data-*`/ARIA attributes, per-instance values as inline styles, geometry in `vh`/`rem` or `em` of one inline font size, and no `var()`/`calc()` in gradients and other paint properties. It also compares the options (vanilla-extract is the choice), classifies the 108 prop interpolations left in 30 files, and orders the migration. The shared `MediaCard` is the first component on [vanilla-extract](https://vanilla-extract.style/): its classes no longer change with its width, focus, hover or progress. The Tizen build rewrites the extracted CSS for Chromium 69 at build time with a PostCSS pass, which shares the declaration rewrites of the styled-components plugin. It links one stylesheet instead of injecting CSS from the script, and minifies CSS for Chromium 69, so the minifier no longer folds sides back into `inset`. It fails on `clamp()`/`min()`/`max()`, which need the viewport. ESLint keeps migrated folders off styled-components
- New paw icon for the website, generated from `assets/favicon.png` by `npm run generate:icons`: `favicon.ico` (16, 32 and 48 px, now also served by the backend at `/favicon.ico`), 16 and 32 px PNG favicons, a 180 px Apple touch icon and a 512 px `favicon.png`, keeping the source's transparency. Rerun the script after changing the source image
- New Samsung TV launcher icon, generated from `assets/tv-logo.png` (the only copy of the TV icons) by `scripts/generate-tv-icons.mjs` on every `npm run package:tizen`: the 512x423 `icon.png` shows the logo at full height, with its background extended to the sides. Nothing generated is committed, so replacing `assets/tv-logo.png` is all a new TV icon takes
- Redesigned notifications panel:
  - The panel opens beside the rail while the bell is highlighted, and the rail stays expanded while it is open. Right/Enter moves into the panel, and Left/Back returns to the rail without closing it. The pointer can move from the bell onto the panel.
  - Each notification shows the title's poster, a heading ("New episode available", "Just added", "Better quality available"), the quality it is available in (the same quality badge as the details page), how long ago it arrived, and a red dot while unread.
  - Unread notifications come first. Read ones stay hidden behind **Show read notifications**, and **Mark all as read** clears the badge.
  - Clicking a notification marks it read and starts playing the movie or episode. Back from that player returns to Home.
  - `GET /api/notifications` is now paged by cursor (`status=unread|read`, `cursor`, `limit`), and the panel loads more as it scrolls. `GET /api/notifications/unread-count` feeds the rail badge, and `POST /api/notifications/read-all` marks everything read.
  - Notifications store the quality and release type of the source they announce. Notifications created before this change show without a quality badge.
  - Visual regression tests (`e2e/notifications.storybook.spec.ts`) capture the panel alone (unread, read shown, all caught up) and beside the rail on Home at 1440×900 and 1920×1080 (bell highlighted, first notification focused, read shown).
  - The offline E2E harnesses (details, voting, smooth core flows) answer `GET /api/notifications/unread-count` and the realtime websocket themselves, so Vite no longer logs a proxy error for every socket it can't reach.
- Minor cosmetic changes to the sidebar: Settings is now at the bottom, elements are highlighted only when sidebar is open.

### Security

- The database no longer names what is stored or watched in plain text: file paths inside sources (movie and episode files, stored files and download claims), ffprobe output, recent searches and notification titles and messages are encrypted at rest with the existing source key, in columns renamed to names that do not describe them (`k`, `v`, `a`, `b`). Existing databases are converted by data migrations at the first start (renamed in place before the schema sync, then encrypted, safe to rerun), and the file is rewritten with `VACUUM` so the replaced plain text does not stay readable in freed pages. Links between tables (which movie a source belongs to, which source is stored, playback progress) are still readable to someone who knows the schema

- The frontend dev and preview servers (Vite) check the certificate of the backend they proxy `/api` to, unless `BACKEND_URL` is local (`localhost`, a `127.x.x.x` or `[::1]` address, or one of the compose service names `backend`, `miauflix` and `vpn`). Pointing `BACKEND_URL` at a remote HTTPS backend accepted any certificate before

### Bug fix

- Home sends the focused title and the cards in view to the new socket after switching sessions, instead of waiting for the next move. Artwork pushed just before Home closes no longer comes back after Home removed it. A viewport promotion that failed is retried the next time the same cards are in view
- Home no longer stays hidden behind the logo for tens of seconds on a slow device (seen on the 4K e2e run): the intro started only once the browser had an idle moment, which a device busy drawing every frame may not have for a long time. It now waits at most 0.5 s for an idle moment once it is ready. On the TV it also waits for the page's images to load and for frames to run smoothly, at most 5 s
- The logo animation visual test (`e2e/logo-animation.storybook.spec.ts`) no longer fails with `window.seek is not a function` on a cold Storybook load: it waits for the story to expose `window.seek` instead of relying on `networkidle`, which could fire before the story rendered
- A backend that stops responding is now restarted. Docker only marks an unhealthy container and never restarts it, so when the backend hung it stayed down until restarted by hand. Every compose file now runs [autoheal](https://github.com/willfarrell/docker-autoheal) (it needs the Docker socket), which restarts the backend once its healthcheck fails 3 times in a row. The image's healthcheck called `/health` instead of `/api/health`, which the frontend fallback answered with `index.html` even while the API was down; it now calls `/api/health`, allows 8 s per request and ignores failures in the first 5 minutes so data migrations can finish. `/api/health` is no longer rate limited, so a flood of requests can't get the backend restarted, and it is no longer written to the audit log on every probe
- The server no longer becomes slow (pages taking 20 s or more, health checks timing out) after running for a few hours. WebTorrent 2.8 opened a new UDP socket with its own buffers for every outgoing uTP peer attempt, and did not count those attempts against the connection limit, so with tens of thousands of discovered peers the backend spent most of its CPU allocating buffers and collecting garbage, and grew to about 3 GB of buffer memory. WebTorrent is upgraded to 3.0.21, which sends all uTP connections through the single listening socket and keeps attempts within the connection limit (2000 unreachable peers: 6000 sockets and 540 MB of buffers before, 1 socket and 15 MB after). WebTorrent 3 also accepts encrypted peer connections by default
- A movie whose sources were all fake (for example releases that only contain an `.exe`) failed with a generic 500 and retried the same fake source on every attempt. The stream route now answers 404 for a source without video (also when saving that verdict fails), and session creation answers 404 with `reason: "exhausted"`
- New-episode notifications are sent only once a source matched to the episode is verified to hold a real video, not as soon as a release is matched by name
- Playback no longer stops with "The media buffer is full and playback is not advancing" on high-bitrate files using the audio-converting stream. On a full buffer the player removed media up to 1 s behind the playhead, but the browser extends a removal to the next keyframe, so this also removed the frames being played and froze playback. The player now only lowers its read-ahead limit and waits, and lets the browser evict what is behind the playhead. It reports a stall after about 10 s without progress instead of 2 s
- Playback on the audio-converting stream no longer freezes at small gaps in the media: in open-GOP encodes (x265's default) the 2–3 frames shown just before each keyframe are decoded after it, and Chrome often reports them as a gap in the buffered video. Chrome froze the picture there while audio played on, then stalled the whole player a few seconds later until a seek. A watchdog now jumps gaps of up to 1 s just before the playhead reaches them, and as a fallback re-seeks when the playhead stops for about 1 s with media buffered ahead, or keeps moving while no video frame is decoded
- Show Settings in the sidebar only to admin users. Keyboard and remote navigation skip it as well, so a non-admin can no longer select the hidden button with ArrowDown and open it with Enter

- Connecting a Trakt account now ends cleanly when the user denies access, the code expires or was already used: the dialog stops with that outcome instead of a server error. Trakt asking the app to poll more slowly no longer fails the connection either
- A backend e2e run no longer overwrites a customized `backend-e2e/.env.test` with a leftover backup; it restores only the backup it made itself, and the backup file is ignored by git
- The login screen on the Samsung TV ignored the remote: nothing had focus and the arrow keys didn't move it, so only the QR code could be used. Now:
  - The email field has focus when the screen opens on the TV. Up and Down move between the email and password fields and Continue (inside a field they used to only move the caret), and the TV keyboard's Done key moves to the next field.
  - After a failed sign-in the focus goes back to the password field. Continue is disabled while signing in, which used to leave nothing focused. If a remote key finds nothing focused, the email field takes the focus.
  - An eye button at the end of the password field shows or hides the password (on every device). On the TV, Right from the password field reaches it, and Left goes back.
  - An expired QR code now offers a **Get a new code** button instead of only saying "Code expired". On the TV, Right from the eye reaches it, and focus returns to the eye once the new code is requested. The QR panel no longer shows "Code expired" for its first second, before the countdown started
- Files whose default audio a player can't decode, but which carry a decodable track in the same language, now play as they are on players that switch tracks themselves (the Samsung TV), instead of converting the audio. For example a 4K release with an English TrueHD default and an English AC-3 track used to be converted, which on a large source could time out ("Audio conversion timed out"); it now plays the AC-3 track directly. Without a decodable track in that language the audio is still converted, rather than switching to another language
- The player on the Samsung TV kept nothing focused, so the remote did nothing: while preparing, Back didn't work, and after a failure Retry couldn't be reached. The player now takes the focus when it opens, and a failure focuses **Retry** (or **Notify me** when there is no source), and pressing **Retry**, which removes the button, hands the focus back to the player so Back keeps working
- On some Samsung TVs the intro grew only two of the logo's letters (A and L), while the other six stayed in the middle of the screen as a second logo next to the one in Home's corner. These TVs write CSS numbers with a decimal comma (`scale(1,25)`), and GSAP, asked to tween to a `transform` string, reads the result back from the browser's matrix: with commas it read the identity, so those letters never moved. The letters now tween GSAP's own `x` and `scale` (`scale(10) translateX(t)` is `x: 10·t, scale: 10`), which GSAP never reads back, so the animation is unchanged elsewhere. For the same reason the letters started 11 to 18 px right of the logo they replace, showing two logos for a moment before the first beat: GSAP could not split their margins (`0px 10,752px 0px 17,472px`) to zero them, so the letters' side margins stayed. The intro now zeroes them itself
- On the Samsung TV, approving a QR sign-in while the login page had the on-screen keyboard open started the intro well above the middle of the screen. The keyboard shrinks the page (1080 to 604 pixels high), and the logo and the intro's letters placed themselves on the shorter page; the keyboard only closed once the login form went away. Leaving login on the TV now blurs the focused field, which closes the keyboard, and waits for the page to be back to full height (at most 1.5 s) before the logo moves and the intro starts
- In the player's subtitle menu, pressing **Find subtitles** with the remote left nothing focused, so the remote did nothing until the menu was closed some other way: the button was disabled while searching, and a disabled button drops the focus to the page. It now stays focused and ignores presses while searching (`aria-disabled`)
- On a title's details, **Add to watchlist** and **Remove from watchlist** left nothing focused while the change was saved, so the remote did nothing, and Back to Search left nothing focused there either: the button was disabled while saving, which drops the focus to the page. It now stays focused and ignores presses while saving (`aria-disabled`), like **Find subtitles**
- The remote can no longer get stuck with nothing focused anywhere in the app. The keyboard dispatcher remembers the element that last had the focus (it listens to `focusin`, so mouse and pointer focus in a browser count too). When a direction key arrives while the focus is on the page body (because the focused control was disabled or removed), it only brings the focus back: to that element if it is still on screen and enabled, else to the page's default item. Pages choose their default through the new `onRestoreFocus` option of `useKeyboard` / `useKeyboardNavigation`: Search its selected control (else the first key), Home its selected card, details its primary action, the player its Retry or Notify me action (else the player), Settings and Storage their first action or Back, and the sidebar, notifications panel and subtitle menu their selected or first item. Dialogs are asked first; a scope without its own default focuses its first `[data-default-focus]` or focusable element, and a page without any scope its main content's first control
- On older Samsung TVs (Tizen 5.5, Chromium 69), search results showed their posters at half the card's width. That Chromium cannot lay out a `<button>` as a flex container: it wraps the content in a box sized to fit it, so the poster took the width of the metadata line. The poster card now lays out its content in an inner element as wide as the card
- On the Samsung TV, Home showed through before the intro instead of a black screen: the intro's backdrop used `inset`, which the TV's Chromium 69 doesn't support
- Home and its intro lagged on the Samsung TV. Measured on the TV, each move along a row froze it for about 0.7 s (about 4 frames per second), mostly spent re-rendering every row and card and decoding images:
  - Rows and their cards are memoized, so a move re-renders only the row it happens in and the cards whose selection changes.
  - The TV asks for backdrops up to 1280 px wide instead of the original size (often 4K), which took the TV about half a second to decode each time the hero changed.
  - Card logos have no drop shadow on the TV.
  - The intro runs without its blur and layer hints on the TV, as the legacy app did.
  - On the TV the hero's gradients and backdrops, the row list and each row are on layers of their own. The TV rasterizes in software, and repainted the whole hero with every title change and every frame of a backdrop crossfade or a scroll. Row moves went from about 6–10 to about 30 frames per second, and moves between rows from about 15 to about 30.
  - On the TV the hero's shade is drawn with fixed pixel positions instead of `var()` and `calc()`. Chromium 69 resolved those into new values on every restyle, and every CSS rule styled-components inserts restyles the page, so the whole shade was repainted (about 480 ms) each time: ten times while the app started, including on the intro's first beat and as its expansion started.
  - The hero's backdrop image and fade are inline styles instead of a CSS class per backdrop: every class styled-components inserted made the TV restyle the whole page, about 650 ms over a first pass along a row.
  - The TV loads smaller images, as the legacy app did: 300 px cards and 780 px hero backdrops, since it decodes every image it paints (a 780 px card took about 95 ms).
  - Images load ahead while the user isn't moving: every row with data queues its cards and hero backdrops, nearest the selection first. These idle loads start after the intro (as the legacy app preloaded), run one at a time, only when nothing else is loading and no key was pressed in the last second, and aren't decoded.
  - The intro's two "pam" pulses play on the TV. The logo they scale now gets a layer of its own before the audio starts, so the compositor scales it; until then each pulse repainted the whole screen, and the layer GSAP created as it started took about 250 ms to paint, longer than the 50 ms swell. The layer stays for the expansion, as dropping it cost another full-screen repaint. The intro's letters also show (under the identical settled logo) and get their layers before the audio starts: painting them on the first beat, and eight new letter layers as the expansion started, each stalled the TV for about 250 ms.
  - On the TV the intro waits, after Home is ready, until every image on the page has loaded and then for six smooth frames in a row (at most 5 s in all). Images arriving under the intro, and the TV still painting Home, made it repaint large layers (about 250 ms each) during the first beats.
  - The centred logo pulses on the TV while the app loads. The pulse animated the CSS `scale` property, which the TV's Chromium 69 doesn't have, so only its opacity changed; browsers without it now pulse `transform` instead.
- Approving a QR login (from the TV app or any device) on the `/auth/qr/:token` page always failed with 401: the approve and decline calls didn't send the browser's session (`X-Session-Id`). They now do, and an expired session sends the user back to sign in. A request approved, declined or expired meanwhile (409) now shows its current state
- Redesigned the QR approval page: a centered card below the logo, which now stays where the login screen has it on every step (it used to jump to the top-left corner once signed in and cover the heading), the device named in plain words ("Samsung TV", "Chrome on macOS") instead of its raw user agent, a countdown until the code expires, Approve and Decline buttons, and clear screens for approved, declined and expired codes. When the browser isn't signed in, the same card shows which device is waiting and the sign-in form

### Documentation

- `docs/development/tv-performance-plan.md` plans the TV performance work for every component, starting with Home movement. Measured on the TV, four moves along a row cause 461 store notifications: 351 `artwork/received` dispatches (one per title, sent again even when unchanged, because the whole `mediaApi` slice feeds Continue watching) and two realtime interest dispatches per scroll frame. The plan orders the fixes and how to measure each one
- `docs/architecture/service-contract-v2.md` describes the new backend ↔ service contract (types-only contracts, one WebSocket per service for calls, streams and events, signed URLs for byte streams, services that run in-process or remote on Bun or Node, and which data the backend keeps once streaming and sources become services), and what is left to move

### Technical debt

- Releases are cut by the **Release** workflow (Actions tab, on `main`): given a patch/minor/major bump or an exact version and a title, it renames the changelog's Unreleased section to `<date> v<version> <title>`, sets the version in the root `package.json` and `package-lock.json`, commits and tags `v<version>` on `main`, publishes a GitHub release with that section as its notes (marked latest, unless the version is a prerelease such as `1.2.0-rc.1`) and runs the CI Pipeline on the tag, which publishes the images tagged with the version and `latest`. Pushing to a protected `main` needs a `RELEASE_TOKEN` secret holding a token allowed to push to it; the tag pushed with that token starts the CI Pipeline by itself
- The backend talks to the media catalog and the list service over one WebSocket each instead of an HTTP request per call, an SSE status stream, a separate artwork WebSocket and polling every 15 seconds. Contracts in `@miauflix/service-contracts` are TypeScript types, run by the new `@miauflix/contract` (typed clients, reconnect with re-subscription, status pushed on change, Bun and Node servers); payloads are no longer validated with Zod on both ends of every call. `RemoteServiceManager` is gone, and the config store moved to `@miauflix/service-configuration`. The services' HTTP API (`/v1/...`, `/status`, `/configuration*`, the manifest) is replaced by the WebSocket at `/_c`; only `GET /health` remains. Contracts are versioned `major.minor`: minors only add (new methods marked `since`, which fail with `unsupported` on an older service so callers can degrade), and a breaking change goes into a new major that the service implements next to the previous one while the backend adapts to a service one major behind, so the backend and a service one major apart keep working whichever is deployed first. This release is the one exception: the switch from HTTP to WebSocket has no bridge, so deploy the backend and the services of this release together. A service reports `ready` only once it can serve data calls, and the backend retries, with backoff, a live-update subscription the service rejected while it reported ready, so artwork updates cannot stop for good after a configuration change. The services image installs dev dependencies while it builds the shared packages, since its base image sets `NODE_ENV=production`. At boot the backend waits at most 5 seconds for each service to connect, so an unreachable service no longer holds up startup for its request timeout; it is picked up as soon as it comes online. A call or stream whose signal is already aborted is rejected as `cancelled` without reaching the service, and a failing service status callback is reported instead of crashing the service. Minor behaviour changes: syncing a watchlist for a user without a Trakt account is skipped instead of failing and retrying, a list item without any id is skipped instead of failing the page, and the catalog's unused `/v1/catalog/genres` endpoint is gone

- `SourceService`, `PlaybackTargetService` and `RealtimeGateway` take the background jobs, notifications, source availability, source health and search channel they always get as required dependencies, so the code no longer checks for them on every call. This also removes `SourceService.syncMissingSourceFiles`: nothing called it, the `source.metadata` jobs had replaced it, and its own fallback could not run because background jobs are always present
- CI can publish images for any branch: **Run workflow** on the CI Pipeline in the Actions tab tests the chosen branch and pushes all images tagged with the branch name and `sha-<commit>`, leaving `latest` and `edge` untouched. Only collaborators with write access can start it
- Two flaky unit tests are fixed. The season pack streaming test gave up waiting for playback to be released after 20 event-loop turns, while closing the reader's files is real I/O that can take longer on a busy CI runner; it now waits up to two seconds. The player seek test moved the seek slider before the controls had started listening to the video (the session resolves outside `act`), so the slider was still disabled; it now waits for the slider to be enabled

## 2026-10-26 v0.0.2 Streaming reliability and HTTPS fixes

### Bug fix

- Sources are ranked by their streaming score again: it was never calculated (every source scored 0), so playback could pick a weakly seeded 25 GB 4K release over a well-seeded 1080p one. Scores are now computed when a source is stored, when its provider details change and on every seed/peer update, and existing sources are scored once by the first data migration (in a single transaction). Each score is computed from the stored row inside the same transaction as its write, so a stats check and a provider refresh running together can't leave a stale score
- The realtime connection (live playback updates, notifications, search) works behind HTTPS: `docker-compose.https.yml` sets `CORS_ORIGIN` to the domain, since the default only allows `localhost`
- HTTPS and the VPN can be combined: the `Caddyfile` forwards to `MIAUFLIX_UPSTREAM` (`vpn:3000` with `docker-compose.vpn.yml`)
- The player no longer shows a blue rectangle when its controls overlay takes focus; the volume slider uses the same white focus ring as the buttons
- Video no longer buffers constantly behind HTTPS for viewers on a VPN: the `Caddyfile` serves HTTP/1.1 and HTTP/2 only and `docker-compose.https.yml` no longer publishes 443/UDP. Over HTTP/3 both the direct and the audio-converting stream reached the browser at 4–5 Mbit/s; over HTTP/2 they reach about 150 Mbit/s
- Playback no longer fails with "The SourceBuffer is full" when the audio-converting stream arrives faster than it plays: the player limits read-ahead in seconds, but the browser's media buffer is limited in bytes (about 150 MB in Chrome), so 60 s of a high-bitrate file could overflow it. On a full buffer the player now evicts what is behind the playhead, lowers its read-ahead limit (to no less than 10 s), waits for playback and retries, instead of stopping. While paused it waits for playback to resume; if playback runs but neither the playhead nor eviction moves for 8 checks in a row (about 2 s), it reports the error instead of retrying forever

### Technical debt

- Data migrations: a `migration_version` table and `MigrationService` run the append-only list in `backend/src/database/migrations/` once per database, in order, at startup before any service; the streaming score backfill is the first migration

### Documentation

- `docs/ai/gotchas.md` explains how to add a data migration
- HTTPS setup: combine HTTPS with the VPN (the VPN steps keep the HTTPS file), why HTTP/3 is off and how to turn it back on; `COMPOSE_FILE` uses `;` on Windows
- The quick start uses the `latest` release images; image tag documentation covers releases

## 2026-10-25 v0.0.1 Smoother streaming and version display

### Features

- Miauflix is versioned with semver, starting at 0.0.1; the root `package.json` version is the source of truth
- The final user can see the running Miauflix version in the bottom right corner of every screen except Home, Details and Player

### Bug fix

- Playback no longer buffers on high-bitrate sources: a viewer's stream keeps the next 90 seconds of video (32 MB to 512 MB, sized by the file's bitrate) requested from every peer, instead of two pieces at a time
- Streams decrypt each stored piece once instead of once per 256 KB chunk, which cut the backend's CPU use while streaming and the speed limit it put on already-downloaded data

## 2026-10-25 VPN with gluetun

### Features

- The VPN container is now gluetun (NordVPN over WireGuard, P2P servers), whose firewall acts as a kill switch; it replaces the unmaintained nordlynx image
- `docker-compose.vpn.yml` routes the quick start through the VPN, and `scripts/nordvpn-key.sh` turns a NordVPN access token into the WireGuard key without printing either

### Bug fix

- The quick start no longer disables the VPN check by default

## 2026-10-25 Quick start deployment fixes

### Features

- `docker-compose.https.yml` and a `Caddyfile` put the prebuilt images behind HTTPS with automatic certificates

### Bug fix

- The services container no longer crash-loops after a restart (`mkfifo: File exists`)
- The quick start uses the published `edge` images until the first release
- Documentation fixes for the initial user logs and the first-boot "degraded mode" message

## 2026-10-25 Search

### Features

- The final user can search titles with an on-screen keyboard, browse popular genres (with an Anime shortcut) and revisit or remove recent searches
- The final user can open search with the remote's Search key or from the home sidebar

### Improvements

- Navigation and focus across search, title details and settings
- Title metadata formatting, including movie runtimes

## 2026-10-24 Frontend refactoring

### Features

- Home combines fixed and popular categories in a paginated feed, with Continue Watching when there is progress
- Show details list seasons and episodes with viewing progress, loading states and retries
- The opening animation pulses the logo and respects reduced-motion preferences

### Improvements

- Home rows load progressively, with smoother scrolling and image preloading
- Community lists work even when their owner's profile is private

## 2026-10-24 TV Show discovery

### Features

- The final user can watch TV episodes, including multi-episode releases, with per-file downloads
- Episodes of watchlisted shows are acquired automatically, the next episode is prefetched and the player counts down to it
- A notifications menu shows available episodes and movie quality upgrades
- Episode-aware subtitles and audio, with subtitle language preferences
- Standalone Docker setup with published images and optional VPN routing

## 2026-10-11 Separate data and UI layers in frontend

### Bug fix

- Show 720p when a source without resolution is found

### Technical debt

- Separate data and UI layers in frontend

## 2026-10-11 Subtitles and audio transcoding

### Features

**Ratings**

- The final user can rate movies and TV shows from the media details screen, options are: like, love, dislike, or clear a rating.

**Subtitles**

- The final user can choose the subtitle track through the CC menu in the player screen
- The final user can synchronize the subtitle track through the CC menu in the player screen
- The final user can search for subtitles through the CC menu in the player screen
- Subtitles search through opensubtitles
- Automatically pick up subtitles file present in the same source
- Automatically pick up subtitles embedded in the media file
- Display subtitles natively

**Audio**

- The final user can now choose an audio track through the Audio menu in the player screen
- Incompatible audio codecs are automatically transcoded to a compatible one

**Video**

- The streaming endpoint can automatically search a source with a supported video codec
- The streaming endpoint can automatically transcode the video to a compatible codec (must be eneabled through config)

**Storage**

- The final user can navigate to the storage screen through the navbar
- The final user can free space by deleting media files through the storage screen
- P2P downloads that have been completed for more than 1 hour (configurable) are automatically moved to storage only (they stop contributing to P2P)

**Configuration**

- Configuration screens now highlight missing required settings and service-reported configuration gaps.

### Bug fix

- `127.0.0.1` and `localhost` are now threaded at the same origin

## 2026-10-10 Improved artworks

### Features

- Media-catalog service scans logos and backdrops to find high contrast combinations
- Media-catalog service scans logos to find one with high contrast against a black background (for the hero)

### Bug fix

- TV Shows media card in "Continue watching" now uses the logo image when available

### Technical debt

- Refactored media card to be its own UI component

## 2026-10-10 Trakt recommendations and playback progress

### Features

- Connect Trakt to sync watchlist changes and playback progress, then resume movies and episodes from the home screen
- Add and remove titles from the watchlist and rate them from their details pages
- Show video warmup progress while a source is prepared for playback
- Make Trakt prompts and dialogs keyboard accessible and dismissible
- Prioritize configuration needs and prepare media backdrops in the background

## 2026-10-03 Details and in-app player

### Features

- Browse movie details, TV seasons, and episodes, with watched indicators and source preparation status
- Play media in-app with playback controls, resume support, and progress tracking
- Add Home and Settings navigation and recognize DCP release sources
- Clarify playback preparation status and errors, and improve setup wizard organization and password visibility controls
- Preserve development data-directory permissions and report startup errors more clearly

### Bug fix

- Handle incomplete playback preparation, invalid download progress, and empty successful API responses more reliably

## 2026-10-01 Face-aware backdrop framing

### Features

- Analyze and save backdrop focus so home-page movie and TV images keep key content in view

### Bug fix

- Adapt backdrop framing to image and screen dimensions, limit zoom, respect reduced-motion preferences, and fall back to default positioning when analysis fails

## 2026-09-30 Community lists and browsing

### Features

- Add popular community lists to the home page, with more categories loading as you browse
- Browse mixed movie and TV community lists, with improved carousel navigation and prioritized loading for nearby content

### Bug fix

- Clean up invalid sessions and cookies and remove duplicate community-list entries

### Technical debt

- Document how to manage and validate provider test fixtures

## 2026-09-25 Playback preparation and storage

### Features

- Add playback sessions with stream links, preferences, source details, and preparation status
- Prepare focused and nearby titles ahead of playback, and track movie and episode progress
- Track allocated and reserved storage, protect active streams from removal, and report source warmup readiness

## 2026-09-24 Configuration and local HTTPS

### Features

- Configure shared TMDB and Trakt settings in setup, with encrypted storage and redirect URI suggestions based on the current site
- Keep cached catalog and list content available during temporary provider outages
- Support optional HTTPS in local development with trusted or generated certificates and configurable certificate locations

### Bug fix

- Improve configuration validation and save feedback, prevent overlapping database updates, and handle Trakt rate limits more reliably

### Technical debt

- Document application configuration and trusted local HTTPS setup

## 2026-09-21 Trakt-backed list service

### Features

- Add QR-code login and a standalone service for public and personal Trakt-backed lists, synchronization, account associations, and encrypted credentials
- Manage Trakt connections and resolve external media through the media catalog

### Technical debt

- Use Miauflix QR login for authentication while retaining Trakt for list integrations

### Bug fix

- Improve resilience when optional service status updates are unavailable

## 2026-09-19 Catalog setup and service integration

### Features

- Include required Catalog setup in first-run configuration, with URL validation and clear test/save status
- Move catalog data and background synchronization into a standalone service, with guided configuration, TV season and episode browsing, and generation-based list refreshes
- Keep cached catalog and list data usable during provider outages and improve provider fallback, metadata refresh, and stream selection
- Refresh the configuration experience with clearer status and failure feedback

### Technical debt

- Update setup, environment, and architecture guidance for the catalog service

## 2026-08-27 Initial account setup

### Features

- Add first-administrator setup with validation, password-strength feedback, and automatic sign-in
- Add a guided configuration wizard and keyboard-accessible, paginated media browsing

### Bug fix

- Improve session refresh and development cookies, and allow startup without an `.env` file

## 2026-08-16 Setup flow test fixes

### Bug fix

- Fix the login end-to-end test flow for the new account setup experience

## 2026-04-19 Runtime configuration

### Features

- Add persistent runtime configuration APIs and selective service restarts
- Add a Docker Compose option to run without a VPN
- Show service readiness and configuration requirements, and improve startup and tracing initialization

## 2026-04-10 Admin setup and home browsing

### Features

- Add one-time administrator setup through the API, a home page with category rows and media cards, and localized streaming requests
- Add optional tracing and Jaeger support

## 2026-02-14 Test database mocks

### Technical debt

- Provide a reusable mock database and update service tests to use isolated repositories

## 2026-01-12 Centralized service metrics

### Features

- Centralize backend service metrics and expose a consolidated authenticated stats report

## 2025-12-28 Network resilience and statistics

### Features

- Add FlareSolverr retry support for Cloudflare challenges, dynamic YTS mirror discovery, and time-windowed statistics

### Technical debt

- Document FlareSolverr configuration and update setup and architecture guidance

## 2025-12-26 Intro audio

### Features

- Add audio feedback to the intro animation and improve its playback controls

### Bug fix

- Fix session loading during server-side rendering

## 2025-11-28 Frontend performance and test coverage

### Features

- Add Lighthouse performance audits, SEO metadata, and improved font loading
- Use pooled users for authentication tests and expand end-to-end coverage

## 2025-11-20 Dependency and package improvements

### Features

- Update build and test dependencies, align workspace packages, and refine linting and imports
- Expand the sanitizer package's public options and type exports

## 2025-11-17 Frontend asset deployment

### Features

- Add a frontend deployment command and synchronize built assets into runtime storage

## 2025-11-15 Monorepo build workflow

### Features

- Add Turbo task orchestration, BuildKit caching, and a dedicated end-to-end workspace
- Consolidate the generated backend client into the backend package and simplify build scripts

## 2025-11-10 Session authentication updates

### Features

- Add multi-session listing and switching, display names, and frontend session management APIs

### Bug fix

- Use HttpOnly cookie-backed sessions and improve refresh and error handling

## 2025-10-31 Repository and container hygiene

### Features

- Add AI-tool secret protections and expand Docker ignore patterns to reduce build context and exclude generated files

## 2025-10-28 Frontend refactor

### Technical debt

- Refactor frontend structure for improved maintainability

## 2025-09-01 Project documentation and setup guides

### Technical debt

- Clarify quick setup, local development, project structure, and architecture, and update Docker and health-check examples

## 2025-08-30 Frontend components and styles

### Features

- Simplify QR login and avatar components, modernize shared styles, and tighten TypeScript and dependency configuration

## 2025-08-17 Frontend and backend integration

### Features

- Serve the frontend from the backend with client-side routing and integrate cookie-based sign-in, including QR/device login
- Integrate frontend build output into Docker and configure the reverse proxy for the app and API

## 2025-08-10 Server rendering and browser testing

### Features

- Add server-side rendering and Playwright end-to-end and visual testing
- Build the animated logo intro as reusable React components with Storybook examples

## 2025-08-09 Miauflix project identity

### Technical debt

- Update project naming and documentation to reflect the implemented backend and clarify remaining frontend integration work

## 2025-08-06 Test fixture cleanup

### Features

- Simplify provider test fixtures and their supporting setup

## 2025-08-05 Toolchain updates

### Features

- Update Node.js and frontend/backend tooling, strengthen audit reporting, and improve typed Redux hooks

## 2025-08-03 Streaming, tracing, and episode synchronization

### Features

- Add OpenTelemetry tracing and request IDs, configurable GREEDY and ON_DEMAND episode synchronization, and tracker and bandwidth settings
- Improve torrent handling, health checks, Docker service configuration, and metadata normalization

## 2025-07-27 Project guidance

### Technical debt

- Add repository guidance for AI agents and development workflows

## 2025-07-25 Storage service foundation

### Features

- Add the initial storage service for managing downloaded media

## 2025-07-21 Frontend backend-client integration

### Features

- Connect the frontend to the generated backend client and add response transformers for the existing UI types

## 2025-07-09 API route types and test timing

### Features

- Add typed request and response DTOs to API routes and export them through the backend client
- Use fake timers in the backend sleep test for deterministic results
