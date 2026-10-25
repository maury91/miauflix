# Miauflix Changelog

## Unreleased

### Bug fix

- Sources are ranked by their streaming score again: it was never calculated (every source scored 0), so playback could pick a weakly seeded 25 GB 4K release over a well-seeded 1080p one. Scores are now computed when a source is stored, when its provider details change and on every seed/peer update, and existing sources are scored once by the first data migration (in a single transaction). Each score is computed from the stored row inside the same transaction as its write, so a stats check and a provider refresh running together can't leave a stale score
- The realtime connection (live playback updates, notifications, search) works behind HTTPS: `docker-compose.https.yml` sets `CORS_ORIGIN` to the domain, since the default only allows `localhost`
- HTTPS and the VPN can be combined: the `Caddyfile` forwards to `MIAUFLIX_UPSTREAM` (`vpn:3000` with `docker-compose.vpn.yml`)
- The player no longer shows a blue rectangle when its controls overlay takes focus; the volume slider uses the same white focus ring as the buttons

### Technical debt

- Data migrations: a `migration_version` table and `MigrationService` run the append-only list in `backend/src/database/migrations/` once per database, in order, at startup before any service; the streaming score backfill is the first migration

### Documentation

- `docs/ai/gotchas.md` explains how to add a data migration
- HTTPS setup: raise the kernel's UDP buffer limits for Caddy's HTTP/3, open 443/UDP, and combine HTTPS with the VPN (the VPN steps keep the HTTPS file); `COMPOSE_FILE` uses `;` on Windows
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
