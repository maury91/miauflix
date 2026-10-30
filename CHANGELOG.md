# Miauflix Changelog

## Unreleased

### Features

- The compose files combine: `docker-compose.yml` (the former `docker-compose.quickstart.yml`, prebuilt images) is the base of every deployment, and each feature is a file listed after it in `COMPOSE_FILE` (the base must come first, the features in any order): `docker-compose.vpn.yml` (NordVPN), `docker-compose.https.yml` (Caddy), `docker-compose.flaresolverr.yml`, `docker-compose.tracing.yml` (Jaeger) and `docker-compose.build.yml` (build the images from the checkout, running Miauflix as your user so it can read the mounted `.env`). FlareSolverr and Jaeger move into the VPN's network when the VPN file is listed. Image tags follow `MIAUFLIX_VERSION` and `MIAUFLIX_IMAGE_NAMESPACE`. `npm run start:backend:docker:prod` and `npm run config-only:docker` use the `COMPOSE_FILE` from `.env`, or build from source with FlareSolverr, tracing and (with `NORDVPN_PRIVATE_KEY`) the VPN. **Breaking for source-built deployments:** `docker-compose.novpn.yml`, `docker-compose.prod.yml` and the nginx/certbot services are gone (Caddy replaces them), the catalog, list service and Bunqueue run in one `miauflix-services` container, data lives in Docker volumes instead of `./data`, and the backend listens on port 3000 instead of 5000. `docs/setup/docker-setup.md#moving-from-the-old-source-built-stack` copies the data over. The compose files no longer pass `JWT_SECRET`, `STREAM_TOKEN_SECRET`, `STREAM_KEY_SALT` and `SOURCE_SECURITY_KEY` (the old `docker-compose.https.yml` did). Secrets given through the environment are never saved to `config.json`, so a deployment that set them in `.env` must keep passing them, or Miauflix generates new ones and can no longer read its encrypted data, see `docs/setup/docker-setup.md#secrets-set-in-env`. `docs/setup/ssl-certificates.md` is gone: HTTPS is covered in `docs/setup/docker-setup.md#https-with-a-domain`

- The prebuilt-image deployments (`docker-compose.yml` without `docker-compose.build.yml`) update themselves: they run [Watchtower](https://watchtower.nickfedor.com/) (the maintained fork, the original `containrrr/watchtower` is archived), which checks every day at 4:00 for a new image of the tag in use and recreates only the Miauflix containers, removing the replaced images. `WATCHTOWER_SCHEDULE` changes the time. It needs the Docker socket
- Fake sources are remembered: as soon as a source's file list is known (a downloaded torrent file, a resolved layout, or a playback attempt) it is judged by whether video makes up most of its bytes, and a fake (an `.exe`, an archive, or a small sample beside one) is stored as such and never picked again. Sources are checked ahead of Watch: browsing or opening a title with no verified source queues a background check of its candidates, one torrent at a time with a timeout, without downloading any payload. A data migration judges every source whose file list is already known
- Movies and episodes report whether a playable source exists: movie details and season episodes include `sourceAvailability` (`available`, `pending` or `unavailable`), and changes are pushed live over the realtime connection (`source-availability`), only to the clients showing or focusing that title. Changes missed while the connection is down are not replayed, so after a reconnect the pushed values are dropped and the details are fetched again. The details and browse badges show a "No source" icon instead of the quality, and episodes are marked "No source available", once every source found proved fake
- The player moves on by itself when a source fails and shows "Trying source N of M" while it works through the candidates (pushed live as `source-attempt` while a session is created). Each retry sends the sources that already failed in this browser (`avoidSourceIds`), so the backend picks a different one. When a movie has no source at all (none found, or every one proved fake), the **Watch Now** button on its details becomes **Notify Me**, and turns back once a real source is found. Once every source is exhausted during playback, the player says there is no source for the title and offers **Notify me**, which sends a notification as soon as a real source is found. A user can have up to 200 pending requests, for titles the catalog knows. Requests are re-checked in the background every 6 hours (every pending request, not only the 50 oldest, and a title whose check fails doesn't stop the others), and an episode's matches that are not verified yet are queued for a check

### Improvements

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

- A backend that stops responding is now restarted. Docker only marks an unhealthy container and never restarts it, so when the backend hung it stayed down until restarted by hand. Every compose file now runs [autoheal](https://github.com/willfarrell/docker-autoheal) (it needs the Docker socket), which restarts the backend once its healthcheck fails 3 times in a row. The image's healthcheck called `/health` instead of `/api/health`, which the frontend fallback answered with `index.html` even while the API was down; it now calls `/api/health`, allows 8 s per request and ignores failures in the first 5 minutes so data migrations can finish. `/api/health` is no longer rate limited, so a flood of requests can't get the backend restarted, and it is no longer written to the audit log on every probe
- The server no longer becomes slow (pages taking 20 s or more, health checks timing out) after running for a few hours. WebTorrent 2.8 opened a new UDP socket with its own buffers for every outgoing uTP peer attempt, and did not count those attempts against the connection limit, so with tens of thousands of discovered peers the backend spent most of its CPU allocating buffers and collecting garbage, and grew to about 3 GB of buffer memory. WebTorrent is upgraded to 3.0.21, which sends all uTP connections through the single listening socket and keeps attempts within the connection limit (2000 unreachable peers: 6000 sockets and 540 MB of buffers before, 1 socket and 15 MB after). WebTorrent 3 also accepts encrypted peer connections by default
- A movie whose sources were all fake (for example releases that only contain an `.exe`) failed with a generic 500 and retried the same fake source on every attempt. The stream route now answers 404 for a source without video (also when saving that verdict fails), and session creation answers 404 with `reason: "exhausted"`
- New-episode notifications are sent only once a source matched to the episode is verified to hold a real video, not as soon as a release is matched by name
- Playback no longer stops with "The media buffer is full and playback is not advancing" on high-bitrate files using the audio-converting stream. On a full buffer the player removed media up to 1 s behind the playhead, but the browser extends a removal to the next keyframe, so this also removed the frames being played and froze playback. The player now only lowers its read-ahead limit and waits, and lets the browser evict what is behind the playhead. It reports a stall after about 10 s without progress instead of 2 s
- Playback on the audio-converting stream no longer freezes at small gaps in the media: in open-GOP encodes (x265's default) the 2–3 frames shown just before each keyframe are decoded after it, and Chrome often reports them as a gap in the buffered video. Chrome froze the picture there while audio played on, then stalled the whole player a few seconds later until a seek. A watchdog now jumps gaps of up to 1 s just before the playhead reaches them, and as a fallback re-seeks when the playhead stops for about 1 s with media buffered ahead, or keeps moving while no video frame is decoded
- Show Settings in the sidebar only to admin users. Keyboard and remote navigation skip it as well, so a non-admin can no longer select the hidden button with ArrowDown and open it with Enter

### Documentation

- `docs/architecture/service-contract-v2.md` describes the new backend ↔ service contract (types-only contracts, one WebSocket per service for calls, streams and events, signed URLs for byte streams, services that run in-process or remote on Bun or Node, and which data the backend keeps once streaming and sources become services), and what is left to move

### Technical debt

- The backend talks to the media catalog and the list service over one WebSocket each instead of an HTTP request per call, an SSE status stream, a separate artwork WebSocket and polling every 15 seconds. Contracts in `@miauflix/service-contracts` are TypeScript types, run by the new `@miauflix/contract` (typed clients, reconnect with re-subscription, status pushed on change, Bun and Node servers); payloads are no longer validated with Zod on both ends of every call. `RemoteServiceManager` is gone, and the config store moved to `@miauflix/service-configuration`. The services' HTTP API (`/v1/...`, `/status`, `/configuration*`, the manifest) is replaced by the WebSocket at `/_c`; only `GET /health` remains. Contracts are versioned `major.minor`: minors only add (new methods marked `since`, which fail with `unsupported` on an older service so callers can degrade), and a breaking change goes into a new major that the service implements next to the previous one while the backend adapts to a service one major behind, so the backend and a service one major apart keep working whichever is deployed first. This release is the one exception: the switch from HTTP to WebSocket has no bridge, so deploy the backend and the services of this release together. A service reports `ready` only once it can serve data calls, and the backend retries, with backoff, a live-update subscription the service rejected while it reported ready, so artwork updates cannot stop for good after a configuration change. The services image installs dev dependencies while it builds the shared packages, since its base image sets `NODE_ENV=production`. Minor behaviour changes: syncing a watchlist for a user without a Trakt account is skipped instead of failing and retrying, a list item without any id is skipped instead of failing the page, and the catalog's unused `/v1/catalog/genres` endpoint is gone

- `SourceService`, `PlaybackTargetService` and `RealtimeGateway` take the background jobs, notifications, source availability, source health and search channel they always get as required dependencies, so the code no longer checks for them on every call. This also removes `SourceService.syncMissingSourceFiles`: nothing called it, the `source.metadata` jobs had replaced it, and its own fallback could not run because background jobs are always present
- CI can publish images for any branch: **Run workflow** on the CI Pipeline in the Actions tab tests the chosen branch and pushes all images tagged with the branch name and `sha-<commit>`, leaving `latest` and `edge` untouched. Only collaborators with write access can start it

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
