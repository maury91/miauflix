# 🧠 Project Context for AI Assistants

> Read this before making changes. Verify behavior against the implementation; this page describes capabilities, not a build result or production certification. See the [Feature Guide](../features.md) and [current task list](../../ToDo.md) for available and planned behavior.

## Implementation Status

**DO NOT rebuild these systems:**

- **Authentication**: JWT access tokens, rotating opaque refresh tokens, email/password and QR login, and user/admin roles. Browsers use session-scoped HttpOnly access and refresh cookies; the packaged TV app requests token transport and sends token headers. API requests select a session with `X-Session-Id`.
- **Media Catalog Service**: Standalone Bun service (`services/media-catalog`) that owns catalog data (TMDB today), freshness, change-syncs, and its published configuration schema. The backend uses a versioned service contract rather than calling TMDB directly.
- **Source Discovery**: Indexer search through the sources service, with background processing
- **Media Streaming Infrastructure**: Complete peer-to-peer client in the Bun media-load service (`services/media-load`, `DownloadService` and `StorageService`), reached by the backend through `MediaLoadClientService`
- **Database Layer**: SQLite entities with AES-256-GCM encryption; movie/tv tables are slim local indexes mirrored from the catalog service
- **Background Tasks**: Queue jobs on the shared Bunqueue broker (backend: lists/sources/maintenance; catalog service: hydration scans/season sync)
- **API Infrastructure**: Catalog, source administration, playback sessions, streaming, subtitles, progress, ratings, notifications, and storage routes are implemented. Check route declarations before documenting an endpoint.

### Frontend Status

- **Framework**: React + Redux Toolkit + Vite (well-structured)
- **Build Status**: Run the relevant build/type checks for the current checkout; do not infer a passing build from documentation.
- **Authentication**: Browser cookies carry both access and refresh tokens; the TV build uses `X-Auth-Transport: token`, Bearer access tokens, and refresh-token headers. Streaming uses separate grants.
- **Integration**: Backend serves frontend, API mounted under `/api`
- **Personal ratings**: Details reads and writes Like/Dislike/Love through authenticated `/api/ratings` routes. Ratings persist in the additive `media_ratings` table, keyed by account, media type, and media ID. Selecting the saved rating clears it; load/save failures are surfaced, and pending saves retain keyboard focus. These are local account ratings, independent of provider scores.
- **Details keyboard navigation**: Arrow keys move DOM focus between Back, ratings/watchlist, Watch, seasons, and episodes. Enter/Space activates the focused control; Escape/Back returns to browsing. Season loading preserves focus unless the user explicitly selects a season.
- **Playback source selection**: Details and Watch prefer completed stored downloads over fresh torrents, including records marked 100% complete. Device HEVC compatibility still applies; quality preference ranks candidates within the completed group.
- **Playback audio**: Session requests report browser languages, native and MSE audio codec support, native track selection, and HEVC support. Source probes are shared; delivery is derived per client. Only the selected track is processed: supported audio is copied during remux, otherwise converted to AAC. HEVC is copied into hvc1 fragmented MP4 when MediaSource supports it. CONVERT_H265_TO_H264 (Download configuration, disabled by default) permits CPU-bounded H.264 conversion at up to 1080p/30 fps when HEVC cannot be delivered to the client; compatible clients retain original video. Unsupported HEVC delivery falls back to an H.264 source when conversion is disabled. Transient inspection failures retain direct playback; proven conversion failures remain errors.
- **Details playback warm-up**: Once the focused target has torrent metadata, the existing warm lease selects its prefix plus a 2 MiB Matroska tail and starts shared audio and local subtitle probes. Probe reads remain speculative: they do not acquire playback claims or suppress subsequent warm targets. Replacing or pausing a warm slot aborts obsolete audio/subtitle processes immediately; Watch promotion preserves the shared probe. Movie subtitle searches begin during details warm-up with the selected subtitle language (HTTP and realtime focus), share in-flight requests, and reuse the durable provider search cache. Sessions derive delivery from the cached raw probe using their own audio capabilities. Playback sessions consult completed probes. For an unknown file, the session can start direct delivery with `deliveryPending` while a background probe determines whether delivery needs changing. FFmpeg logs spawn-to-first-output time for live latency investigation.
- **Season-pack targets**: Episode playback resolves provider-relative file paths against the real torrent layout (exact match first, otherwise a unique suffix). Canonical paths persist on the association; duplicate canonical links merge safely. Association inserts and canonicalization share a serialized mutation boundary, including SQLite's nullable filename case; rediscovery reuses unique canonical links.
- **Local subtitles**: The player automatically discovers embedded text tracks and matching SRT/VTT/ASS/SSA torrent files without OpenSubtitles configuration. FFmpeg reads selected tracks over encrypted torrent ranges. Plain delivery uses sanitized WebVTT; styled local ASS/SSA tracks also support ASS delivery. Supported browsers load the JASSUB renderer on demand for positioning, signs, karaoke, and attached fonts; the Tizen build excludes it and uses plain captions. Attached dialogue fonts can also be loaded for plain captions; separate torrent font files are not loaded. Plain captions move above open controls, and styled rendering fits between the header and controls. Embedded delivery uses overlapping two-minute windows on the original media clock, refreshed each minute and after seeks; sidecars are selected for download while the torrent is attached. Selection and timing remain per account/title. Image-based PGS/VobSub tracks are deferred.
- **Configuration dismissal**: Missing essential configuration remains blocking. LIST/Trakt and subtitle configuration prompts can be dismissed while the catalog remains usable.
- **Settings**: Administrators can open Configuration, Sources, and Storage from Settings using mouse or keyboard navigation. Server configuration and administration are role-gated; a general personal-preferences page remains planned.

- **Artwork delivery**: Catalog artwork uses size-independent TMDB paths. Home chooses card, logo, still and viewport backdrop sizes through `artworkUrl`; stale absolute TMDB URLs are resized too. Server artwork analysis retains explicit analysis URLs.
- **Fast details**: Focus prefetches a show's opening regular season (resume season when available). Details reads shared season cache data on its first render; returning to browse restores the selected card's DOM focus. Movie/show route data is checked against the current route identity.
- **Remote player controls**: Arrows navigate the control bar and subtitle settings without native select popups. Timing opens focused, adjusts in half-second steps, and Back returns through settings to CC. Preferred subtitle languages are normalized across ISO aliases, and other languages are collapsed. The player shows preparation until video data is ready; StrictMode reuses the pending session request.

Playback also offers manual Skip intro for bounded opening chapters and recognizes anime ED/Ending credits in the second half. A later content chapter supplies the post-credits seek target: Skip credits counts down five seconds, Watch credits cancels it, and next-episode continuation waits until at least that target. This is chapter-based handling; scene analysis remains planned. Prompts are reachable between the video and seek bar through remote navigation.

## 🎯 **What This Means for Development**

### **DO THIS** ✅

- Add new features and enhancements
- Optimize performance and user experience
- Extend functionality with additional streaming sources

### **DON'T DO THIS** ❌

- Rebuild authentication (reuse the existing browser-cookie and TV-token transports, session selection, refresh flow, and streaming grants)
- Rebuild frontend integration (it's complete)
- Rebuild source aggregation (it's complete)
- Rebuild WebTorrent infrastructure (it's complete)
- Rebuild the media catalog inside the backend — catalog data comes from `services/media-catalog` through the remote service contract (`CATALOG_SERVICE_URL`); backend entities named `*MediaId` map to `tmdbId` database columns
- Create new database entities unnecessarily
- Rebuild background processing (queue jobs on the shared Bunqueue broker)

## 🏗️ **Architecture Quick Facts**

- **Backend**: Node.js + Hono framework + SQLite + TypeORM (local index of catalog data + sources/progress/users)
- **Supporting services**: Bun catalog, list, and source services at configured addresses (default ports 3001, 3002, and 3003). Keep these internal; the backend exposes user-facing APIs and administrator configuration.
- **Frontend**: React + Redux Toolkit + Vite
- **Deployment**: Docker Compose with optional Caddy HTTPS, Gluetun/NordVPN, FlareSolverr, and Jaeger overlays
- **Media Streaming**: WebTorrent library for peer-to-peer delivery
- **Auth**: JWT tokens with JOSE library
- **Database**: SQLite with field-level encryption

## Known boundaries and planned work

- Account creation and logout exist in the API; account creation screens, profile editing/selection, and a logout control remain in the backlog.
- Source providers currently implement a constrained Cardigann engine and Torznab. The declared generic `http` kind has no registry implementation. Do not advertise arbitrary HTTP providers or full Cardigann/private-tracker compatibility.
- TMDB is the catalog provider wired at startup; Trakt supplies the built-in list integration. Compatible service replacements require implementing the service contract.
- Local subtitles support text tracks; PGS/VobSub conversion is absent. OpenSubtitles search is movie-only.
- Combined multi-episode videos, a Watch Now quality picker, interface translation, and subtitle translation remain planned. Existing season packs contain separately addressable episode files.
- Samsung Tizen packaging, AVPlay, remote controls, and server discovery exist. Source inspection alone does not establish compatibility with every TV model.

## 🔍 **Key Service Files**

```typescript
// Extend existing owners rather than recreating these systems:
backend/src/services/auth/auth.service.ts
backend/src/services/source/source.service.ts
backend/src/services/media-load/                 // MediaLoadClientService (torrent engine client)
backend/src/services/catalog/                     // CatalogClient + remote config group
backend/src/services/media/                       // MediaService (local index mirroring), ListService
services/media-catalog/                           // Catalog storage, provider adapter, and workers
services/list-service/                            // Trakt lists, watchlists, and playback sync
services/sources/                                 // Provider search and administration
services/media-load/                              // Torrent engine, encrypted storage, tracker scrapes
```

## 🎬 **Episode Sync Management**

### **Configuration**

- **Config Variable**: `EPISODE_SYNC_MODE` (published by media-catalog and managed through the backend configuration UI and service management contract)
- **Values**: `GREEDY` (sync all episodes) or `ON_DEMAND` (sync only watched shows)
- **Default**: `ON_DEMAND`

### **How It Works**

1. **GREEDY Mode**: catalog worker syncs all incomplete seasons
2. **ON_DEMAND Mode**:
   - Shows are marked as "watching" when user accesses them
   - The backend pushes the watching set through the catalog contract
   - The catalog worker only syncs episodes for shows in the watching set

## 🧪 **Testing Infrastructure**

- **E2E Tests**: Docker-based with mock services
- **Unit Tests**: Backend Jest, frontend Vitest, and service-specific test runners with offline mocks/fixtures
- **HTTP Fixtures**: Pre-recorded API responses (don't make real API calls in tests)
- **Commands**: `npm test --workspace backend`, `npm run test:e2e`, `npm run test:backend:e2e`, `npm run test:frontend:e2e`

## Background work and verification

The backend's schedule coordinator installs recurring jobs on the shared Bunqueue broker and reconciles them with service readiness and configuration. Backend workers own source/list/maintenance work; catalog workers consume catalog scan and season-sync jobs. Schedule definitions and enabled flags determine which jobs run.

Implementation references: [schedule coordinator](../../backend/src/services/background-job/service-schedule.coordinator.ts), [source schedules](../../backend/src/services/source/source.schedule.ts), [catalog workers](../../services/media-catalog/src/workers/worker.ts), [authentication transport](../../backend/src/utils/auth-transport.util.ts), and [provider registry](../../services/sources/src/providers/registry.ts).

Development Docker mounts downloads at both the root and backend workspace paths so npm workspace commands retain encrypted media across container recreation. Preserve existing container files before applying the mount to older installations.
