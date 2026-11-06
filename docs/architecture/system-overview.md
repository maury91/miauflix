# System Architecture Overview

Miauflix is a self-hosted streaming application. Its backend serves a React frontend, owns accounts and playback, and delegates catalog information, lists, and source searches to separate services.

For a user-facing explanation, see the [Feature Guide](../features.md). This page describes the current ownership boundaries; [architecture diagrams](diagrams.md) provide additional views. Features still being developed are tracked in [ToDo.md](../../ToDo.md).

## Technology stack

| Area             | Implementation                             | Responsibility                                                                     |
| ---------------- | ------------------------------------------ | ---------------------------------------------------------------------------------- |
| Frontend         | React, Vite, Redux Toolkit                 | Browsing, search, accounts, settings, and player controls                          |
| Backend          | Node.js, Hono                              | Public API, frontend hosting, authentication, playback, and local state            |
| Backend database | SQLite and TypeORM                         | Users, source associations, progress, ratings, notifications, and storage records  |
| Catalog service  | Bun and SQLite                             | TMDB catalog data, metadata freshness, seasons, episodes, and artwork              |
| List service     | Bun and SQLite                             | Trakt connections, public/personal lists, watchlists, and playback synchronization |
| Sources service  | Bun and SQLite                             | Indexer access, search planning, provider configuration, and cached candidates     |
| Media load       | Bun                                        | Torrent engine; today tracker scrapes for seeder and leecher counts                |
| Background work  | Bunqueue broker and workers                | Scheduled and queued work across the backend and catalog service                   |
| Media delivery   | WebTorrent, FFmpeg, FFprobe                | Torrent downloads, inspection, remuxing, conversion, and subtitles                 |
| Client playback  | Browser video/MSE or Samsung AVPlay        | Device-specific playback and audio-track controls                                  |
| Deployment       | Docker Compose, optional Caddy and Gluetun | Application hosting, HTTPS, and VPN routing                                        |

## Service boundaries

### Backend and frontend

The backend exposes the application API under `/api` and hosts the browser frontend. The frontend owns navigation and display state, including the home feed, search, details, and player. It uses authenticated API requests and a realtime connection for supported operations.

The backend owns Miauflix accounts, authentication, local watchlists and ratings, progress, notifications, persisted source candidates, torrent verification, downloads, and playback sessions. Its local movie/show records are indexes of catalog data needed for joins and source matching; they are not the authoritative full catalog.

The frontend also has a Tizen build. It uses Samsung AVPlay when available and suitable, with browser playback for converted delivery. TV-specific code registers remote keys, adapts styles and artwork, and finds or remembers the backend server.

### Catalog service

The catalog service owns complete movie/show metadata and its own SQLite database. It handles search, discovery, genres, external identifiers, artwork, freshness, changed-title scans, and season/episode synchronization.

TMDB is the currently wired provider. The service has a provider abstraction, but there is no administrator-facing installer for arbitrary catalog providers. The backend calls the catalog service instead of contacting TMDB directly.

`EPISODE_SYNC_MODE` chooses whether catalog work focuses on shows being watched (`ON_DEMAND`, the default) or incomplete seasons more broadly (`GREEDY`). The backend communicates the watching set to the catalog service.

### List service

The list service owns Trakt access, encrypted provider credentials, public and personal list pages, account association, and watchlist/playback synchronization. Public lists include popular, trending, and community lists; personal lists include watchlists, favorites, and history.

A Trakt connection belongs to an authenticated Miauflix account. Trakt authorization does not create or authenticate a Miauflix login. Playback synchronization uses a durable outbox with retries, while the backend retains local progress used by the application.

### Sources service

The sources service owns outbound indexer website requests. It plans background and interactive searches, applies provider priorities and request budgets, caches results, backs off from failures, and emits candidates incrementally. The backend stores those candidates, resolves torrent information, matches episode files, and verifies usable video.

The implemented provider registry supports:

- **Cardigann:** supported Jackett/Prowlarr-format definitions obtained at runtime. Compatibility is a subset; unsupported definitions and private-tracker login flows are excluded.
- **Torznab:** an external Jackett/Prowlarr-compatible search endpoint configured with its address and API key.

Administrators can manage providers and definition repositories through Settings. A declared generic `http` provider kind is not implemented in the registry. FlareSolverr is optional and applies to supported protected source requests, rather than all outbound requests in the application.

### Media load service

The media-load service is the torrent engine. It currently answers tracker scrapes: the backend's source statistics jobs ask it for seeders and leechers, and it batches concurrent requests into multi-hash scrapes (`SCRAPE_TRACKERS`). WebTorrent downloads, encrypted storage and byte ranges are planned to move here; playback sessions, FFmpeg and subtitles stay in the backend. In Docker it runs in the services container, so with the VPN layer its tracker traffic uses the tunnel.

### Remote contracts and configuration

The backend clients share a remote-service implementation. Each configured service address establishes a multiplexed WebSocket connection through `@miauflix/contract`. Contract definitions live in `@miauflix/service-contracts`.

On connection or reconnection, the backend negotiates a supported contract major, obtains the service's configuration schema, delivers the saved configuration snapshot, and observes service status. A previous-major adapter can be used when that particular client supplies one. Calls fail as unavailable or not configured while a required service is not ready.

The contract layer provides calls, streams, subscriptions, and byte delivery. These internal service contracts are distinct from the public browser API. A replacement service must implement the expected contract and management behavior; running an arbitrary Docker image does not install a Miauflix provider.

Implementation: [remote service client](../../backend/src/services/remote/remote-service.ts), [contract protocol](../../packages/contract/src/protocol.ts), and [service contracts](../../packages/service-contracts/src/).

## Authentication and authorization

Miauflix has two account roles: `user` and `admin`. Protected API requests use JWT access tokens. Administrators can create additional accounts through the API and manage configuration, sources, and storage; a complete account-management interface remains planned.

Browser access and refresh tokens use session-scoped HttpOnly cookies. Protected API calls identify the session with `X-Session-Id`; middleware reads its access-token cookie, falling back to `Authorization: Bearer`. Login, renewal, logout, and session discovery have their own routes and transport handling. The installed TV app requests explicit token transport because it runs from a different origin and cannot rely on those browser cookies: access uses Bearer authorization, while refresh/logout use `X-Refresh-Token`. QR login lets an authenticated account approve a new device session.

Streaming has separate short-lived credentials and persisted playback grants. A stream URL is checked against its playback authorization rather than treating the video request as a normal JWT API request.

Session-scoped storage does not imply an implemented profile-switching screen. See [Accounts](../features/accounts.md) for available controls and planned UI.

Implementation: [authentication routes](../../backend/src/routes/auth.routes.ts), [roles](../../backend/src/entities/user.entity.ts), [token transport](../../backend/src/utils/auth-transport.util.ts), and [stream route](../../backend/src/routes/stream.routes.ts).

## Playback flow

1. Browsing can warm a focused title by preparing torrent information, initial pieces, and audio/subtitle inspection. This is speculative work and can be cancelled when focus changes.
2. A playback session resolves the movie or episode to a specific source and file. Suitable completed downloads are preferred; quality, codec support, and bitrate preferences influence selection.
3. Completed FFprobe results determine delivery for the requesting device, including native and MSE codec support, audio-track controls, and preferred languages. An unknown file can begin direct delivery with `deliveryPending` while a background probe reports delivery updates to the player.
4. Compatible media is delivered directly with byte-range support. Other supported media can be remuxed to fragmented MP4, copying compatible tracks or converting selected audio to stereo AAC.
5. HEVC can be copied for compatible devices. Optional HEVC-to-H.264 conversion is disabled by default and capped at 1080p/30 fps. When HEVC cannot be delivered, selection can fall back to an H.264 source.
6. WebTorrent prioritizes required pieces and reads ahead during playback. FFmpeg/FFprobe read decrypted torrent ranges through a private loopback input without requiring a plaintext media copy on disk.
7. The player reports progress and supports pause, seeking, audio/subtitle choices, and resume. TV playback can prefetch the next episode and use named credit chapters or the final-90-second fallback for continuation.

Live playback sessions sample peer availability, throughput, and blocked reads. A weak source can trigger a backup source warming near the current read position. A failed source produces a session-scoped recreation event so the player can select another source. Each issued grant remains bound to its source; failover creates another session. This is source selection and fallback, not continuous adaptive-bitrate streaming.

Local subtitles include embedded text and matching SRT/VTT/ASS/SSA files, converted to sanitized WebVTT. Embedded tracks are delivered in moving windows refreshed after seeks. OpenSubtitles search currently applies to movies with an IMDb ID and configured API key. Image-based PGS/VobSub conversion is not implemented.

Implementation: [playback sessions](../../backend/src/services/playback/playback-session.service.ts), [audio delivery](../../backend/src/services/playback/audio-playback.service.ts), [torrent input](../../backend/src/services/playback/torrent-input.ts), [local subtitles](../../backend/src/services/subtitles/torrent-subtitles.service.ts), and [Samsung playback](../../frontend/src/features/player/lib/avplay-media.ts).

## Data layer

### Local databases

The backend uses SQLite through TypeORM. The catalog, list, and sources services have their own SQLite state and ownership. Account, source, storage, progress, notification, probe, and other records are registered in the backend database module.

Backend startup initializes the database, performs registered column renames, and explicitly synchronizes its schema. Ordered data migrations run before normal service work. Schema synchronization and data migrations are separate: changing an entity can still change the live schema, and removing or renaming fields requires preservation work.

The application's caches include both in-memory and persisted data, with service-specific freshness rules. Catalog rows, list pages, source search results, and media probes have different lifetimes; there is no single cache lifetime governing them all.

Implementation: [backend database](../../backend/src/database/database.ts) and [data migration runner](../../backend/src/database/migrations/migration.service.ts).

### Encrypted media and storage claims

Downloaded torrent pieces use encrypted chunk storage. Selected sensitive database columns are encrypted too; this is not whole-database encryption. Keys must be preserved with the persistent data they protect.

Storage records track downloaded files, reserved space, and claims from playback and preparation. Reclamation considers those claims and protects active playback. Completed torrents can detach after the seeding period while their encrypted files remain available locally. Storage-pressure cleanup or explicit administrator removal can later delete retained files.

Implementation: [encrypted chunk store](../../backend/src/chunk-stores/encrypted-chunk-store/encrypted-chunk-store.ts), [storage service](../../backend/src/services/storage/storage.service.ts), and [download service](../../backend/src/services/download/download.service.ts).

## Background work

Background processing uses the shared Bunqueue broker with configured schedules and workers. Backend workers register handlers for list refreshes, source discovery/verification, availability work, and maintenance. Catalog workers consume changed-movie/show scans and season-sync jobs.

Schedules and workers define concurrency, leases, retries, and priorities. VPN-aware source jobs check whether they can run before contacting providers. The sources planner separately controls provider requests, result caches, budgets, and cooldowns.

Implementation: [backend job handlers](../../backend/src/services/background-job/background-job.handlers.ts), [backend worker](../../backend/src/services/background-job/background-job.worker.ts), and [catalog workers](../../services/media-catalog/src/workers/).

## Deployment and network boundaries

The default Compose deployment contains:

- **`miauflix`:** Node.js backend and built frontend, published on port 3000 with a localhost-only default binding.
- **`miauflix-services`:** the Bunqueue broker and catalog, list, and source services, with persistent service data.
- **Supporting containers:** scheduled image updates and unhealthy-application recovery.

Optional Compose files add Caddy HTTPS, Gluetun/NordVPN routing, FlareSolverr, and Jaeger tracing. HTTPS terminates at Caddy in the supplied HTTPS setup. Internal services should remain on the trusted application network rather than being exposed as public browser APIs.

VPN detection checks whether the outbound connection is recognized as NordVPN-protected. The Gluetun deployment supplies the tunnel and firewall; application status checks and a network kill switch are different mechanisms. VPN checks can be explicitly disabled in configuration.

The backend has process-local playback and torrent state alongside its local SQLite database. The split service design does not by itself provide load-balanced, stateless backend replicas. The supplied deployment runs one application instance.

Deployment definitions: [base Compose](../../docker-compose.yml), [HTTPS](../../docker-compose.https.yml), [VPN](../../docker-compose.vpn.yml), and [tracing](../../docker-compose.tracing.yml).

## Extending the system

- Add ordinary source providers through supported Cardigann definitions, provider repositories, or Torznab. See the [source service guide](../../services/sources/README.md).
- Add a catalog adapter by implementing the catalog provider boundary and wiring it into the catalog service; TMDB is the currently selected implementation.
- Supply a replacement catalog, list, or sources service by implementing its versioned contract and management protocol.
- Extend authentication within the existing routes and service only when the requested behavior requires it. There is no documented drop-in authentication plugin registry.

See the [Feature Guide](../features.md) for current user-facing capabilities and [ToDo.md](../../ToDo.md) for planned work, including combined-episode handling, account-management screens, and language settings.
