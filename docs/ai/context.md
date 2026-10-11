# 🧠 Project Context for AI Assistants

> **CRITICAL**: Read this before making any code changes. Contains essential project status info.

## Implementation Status

**DO NOT rebuild these systems:**

- **Authentication**: Full JWT system with refresh tokens (AuthService: 325 lines, ~15 methods)
- **Media Catalog Service**: Standalone Bun service (`services/media-catalog`) that owns all catalog data (TMDB today), freshness, change-syncs, and its own `/configuration` schema — the backend never talks to TMDB directly
- **Source Discovery**: Multi-provider content aggregation (YTS + THERARBG) with background processing
- **Media Streaming Infrastructure**: Complete client with peer-to-peer networking (DownloadService)
- **Database Layer**: SQLite entities with AES-256-GCM encryption; movie/tv tables are slim local indexes mirrored from the catalog service
- **Background Tasks**: Queue jobs on the shared Bunqueue broker (backend: lists/sources/maintenance; catalog service: hydration scans/season sync)
- **API Infrastructure**: All routes implemented, including streaming endpoint

### Frontend Status

- **Framework**: React + Redux Toolkit + Vite (well-structured)
- **Build Status**: Builds successfully (no TypeScript errors)
- **Authentication**: JWT access tokens + HttpOnly refresh token cookies
- **Integration**: Backend serves frontend, API mounted under `/api`
- **Personal ratings**: Details reads and writes Like/Dislike/Love through authenticated `/api/ratings` routes. Ratings persist in the additive `media_ratings` table, keyed by account, media type, and media ID. Selecting the saved rating clears it; load/save failures are surfaced, and pending saves retain keyboard focus. These are local account ratings, independent of provider scores.
- **Details keyboard navigation**: Arrow keys move DOM focus between Back, ratings/watchlist, Watch, seasons, and episodes. Enter/Space activates the focused control; Escape/Back returns to browsing. Season loading preserves focus unless the user explicitly selects a season.
- **Playback source selection**: Details and Watch prefer completed stored downloads over fresh torrents, including legacy 100% records. Device HEVC compatibility still applies; quality preference ranks candidates within the completed group.
- **Playback audio**: Session requests report browser languages, native and MSE audio codec support, native track selection, and HEVC support. Source probes are shared; delivery is derived per client. Only the selected track is processed: supported audio is copied during remux, otherwise converted to AAC. HEVC is copied into hvc1 fragmented MP4 when MediaSource supports it. CONVERT_H265_TO_H264 (Download configuration, disabled by default) permits CPU-bounded H.264 conversion at up to 1080p/30 fps when HEVC cannot be delivered to the client; compatible clients retain original video. Unsupported HEVC delivery falls back to an H.264 source when conversion is disabled. Transient inspection failures retain direct playback; proven conversion failures remain errors.
- **Local subtitles**: The player automatically discovers embedded text tracks and matching SRT/VTT/ASS/SSA torrent files without OpenSubtitles configuration. FFmpeg converts selected tracks to sanitized WebVTT over encrypted torrent ranges. Embedded delivery uses overlapping two-minute windows on the original media clock, refreshed each minute and after seeks; sidecars are selected for download while the torrent is attached. Selection and timing remain per account/title. Image-based PGS/VobSub tracks are deferred.
- **Configuration dismissal**: Missing essential configuration remains blocking. LIST/Trakt and subtitle configuration prompts can be dismissed while the catalog remains usable.
- **Settings**: The Home sidebar opens Settings by mouse or keyboard. Administrators can open the existing Configuration editor; closing it returns to Settings, and Back to Home returns to browsing. Non-admins see Configuration disabled.

## 🎯 **What This Means for Development**

### **DO THIS** ✅

- Add new features and enhancements
- Optimize performance and user experience
- Extend functionality with additional streaming sources

### **DON'T DO THIS** ❌

- Rebuild authentication (already complete: JWT API auth + HttpOnly refresh cookies + streaming keys)
- Rebuild frontend integration (it's complete)
- Rebuild source aggregation (it's complete)
- Rebuild WebTorrent infrastructure (it's complete)
- Rebuild the media catalog inside the backend — catalog data comes from the Bun service (`services/media-catalog`) over HTTP (`CATALOG_SERVICE_URL`); backend entities named `*MediaId` keep their legacy `tmdbId` DB columns
- Create new database entities unnecessarily
- Rebuild background processing (queue jobs on the shared Bunqueue broker)

## 🏗️ **Architecture Quick Facts**

- **Backend**: Node.js + Hono framework + SQLite + TypeORM (local index of catalog data + sources/progress/users)
- **Media Catalog**: Bun + `Bun.serve` + `bun:sqlite` + `bunqueue-client` in `services/media-catalog` (port 3001, internal network only, no auth)
- **Frontend**: React + Redux Toolkit + Vite
- **Deployment**: Docker + docker-compose + nginx
- **Media Streaming**: WebTorrent library for peer-to-peer delivery
- **Auth**: JWT tokens with JOSE library
- **Database**: SQLite with field-level encryption

## 📈 **Project Timeline Reality**

- **Previous estimates**: "Months of infrastructure work needed"
- **Actual status**: Production-ready streaming platform
- **Key insight**: Documentation was severely outdated vs implementation
- **Current state**: Fully functional with backend serving frontend

## 🔍 **Key Service Files (All Complete)**

```typescript
// These are production-ready, don't rebuild:
backend/src/services/auth/auth.service.ts         // 325 lines, ~15 methods
backend/src/services/source/source.service.ts     // 464 lines
backend/src/services/download/download.service.ts // 587 lines
backend/src/services/catalog/                     // CatalogClient + remote config group
backend/src/services/media/                       // MediaService (local index mirroring), ListService
services/media-catalog/                           // Standalone Bun catalog service (provider abstraction)
```

## 🎬 **Episode Sync Management**

### **Configuration**

- **Config Variable**: `EPISODE_SYNC_MODE` (published by media-catalog; values are stored by the backend and pushed to the service)
- **Values**: `GREEDY` (sync all episodes) or `ON_DEMAND` (sync only watched shows)
- **Default**: `ON_DEMAND`

### **How It Works**

1. **GREEDY Mode**: catalog worker syncs all incomplete seasons
2. **ON_DEMAND Mode**:
   - Shows are marked as "watching" when user accesses them
   - The backend pushes the watching set to the discovered catalog v1 capability
   - The catalog worker only syncs episodes for shows in the watching set

## 🧪 **Testing Infrastructure**

- **E2E Tests**: Docker-based with mock services
- **Unit Tests**: Jest with comprehensive mocks
- **HTTP Fixtures**: Pre-recorded API responses (don't make real API calls in tests)
- **Commands**: `npm test --workspace backend`, `npm run test:e2e`, `npm run test:backend:e2e`, `npm run test:frontend:e2e`

## 🚨 **Critical Context for AI Assistants**

1. **Previous Documentation Was Wrong**: Massive 95%+ implementation was documented as "incomplete"
2. **Platform is Complete**: All core functionality implemented and integrated
3. **Background Tasks Active**: 7 tasks running every 0.1-5 seconds, system is live
4. **Frontend Fully Integrated**: Complete three-tier auth flow (JWT APIs, HttpOnly refresh, streaming keys)
5. **Stream Endpoint Implemented**: Streaming available at `/api/stream/:token` with separate auth system
6. **Architecture**: Backend serves frontend, API under `/api`, JWT for API auth, cookies for refresh only

---

**Bottom Line**: This is a complete, production-ready streaming platform with backend serving frontend and full authentication integration.

Development Docker mounts downloads at both the root and backend workspace paths so npm workspace commands retain encrypted media across container recreation. Preserve existing container files before applying the mount to older installations.
