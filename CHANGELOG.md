# Miauflix Changelog

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
