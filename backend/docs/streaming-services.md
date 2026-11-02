# Streaming Services

> Source search runs in the standalone Bun sources service; playback remains in the backend.

The backend provides comprehensive torrent infrastructure with WebTorrent integration. **Note:** The streaming endpoint is fully implemented and production-ready.

## ✅ Current Implementation (Fully Functional)

### WebTorrent Infrastructure (Complete)

- ✅ **Complete WebTorrent Client**: `DownloadService` with full WebTorrent integration
- ✅ **Tracker Management**: Best tracker loading, blacklist support, IP set filtering
- ✅ **Magnet Link Generation**: Dynamic magnet link creation with tracker lists
- ✅ **Torrent File Download**: Timeout-based torrent file retrieval
- ✅ **Stats Scraping**: Real-time seeders/leechers statistics
- ✅ **Connection Management**: Configurable connection and bandwidth limits

### Source Services (Production Ready)

- ✅ **Multi-Provider Aggregation**: the sources service searches TheRARBG, YTS and EZTV and streams normalized candidates to the backend
- ✅ **Background Source Discovery**: background jobs follow the sources planner's coverage and retry summaries
- ✅ **VPN-Aware Processing**: the sources service checks its own VPN before website requests; backend downloads and tracker stats retain their VPN checks
- ✅ **On-Demand Source Search**: Real-time source discovery with timeout (`getSourcesForMovieWithOnDemandSearch`)
- ✅ **Rate Limiting**: Per-provider rate limiters with configurable limits
- ✅ **Quality Detection**: Automatic quality, codec, and metadata extraction
- ✅ **Database Integration**: Complete source persistence with encryption

### API Infrastructure (Ready for Streaming)

- ✅ **Movie Endpoints**: `/movies/:id?includeSources=true` provides sources for streaming
- ✅ **Authentication**: Complete JWT system with refresh tokens and role-based access
- ✅ **Rate Limiting**: Configurable rate limiting per endpoint
- ✅ **Error Handling**: Comprehensive error handling and audit logging

## ✅ Streaming Implementation (Complete)

### Stream Endpoint (Implemented)

**Stream Endpoint**: The `/api/stream/:token` endpoint is fully implemented and production-ready. This enables complete video streaming functionality.

**Implementation:**

```typescript
// Implemented: routes/stream.routes.ts
app.get('/api/stream/:token', rateLimitGuard(60), async c => {
  // 1. Verify streaming key with timing attack protection
  // 2. Get best source based on quality and codec preferences
  // 3. Handle Range requests for video seeking
  // 4. Stream file with proper headers
  // 5. Error handling for various scenarios
});
```

### Secondary Missing Components

- **Viewport Preload Queue**: `/api/ui/viewport` endpoint for priority-based preloading
- **Stream Session Management**: User-specific streaming sessions

## 🏗️ Available Infrastructure for Streaming

All the necessary infrastructure exists and is production-ready:

### WebTorrent Client (DownloadService)

```typescript
// Already implemented and available
const downloadService = new DownloadService();
downloadService.client; // WebTorrent client ready for streaming
downloadService.getTorrent(magnetLink, hash, timeout); // Get torrent file
downloadService.getStats(infoHash); // Get seeders/leechers
```

### Source Discovery (SourceService)

```typescript
// Already implemented and available
sourceService.getSourcesForMovie(movieId); // Get all sources
sourceService.getSourcesWithTorrentsForMovie(movieId); // Sources with torrent files
```

### Authentication & Security

```typescript
// Already implemented and available
authGuard(); // JWT authentication middleware
rateLimitGuard(limit); // Rate limiting middleware
auditLogService; // Request logging
```

## Configuration (Already Implemented)

### Environment Variables

```env
# WebTorrent Configuration (Active)
CONTENT_CONNECTION_LIMIT=100
CONTENT_DOWNLOAD_LIMIT=0  # MB/s (0 = unlimited)
CONTENT_UPLOAD_LIMIT=0    # MB/s (0 = unlimited)
DISABLE_DISCOVERY=false   # DHT enabled
SOURCE_SECURITY_KEY=...   # AES-256 encryption key

# VPN Configuration (Active)
DISABLE_VPN_CHECK=false   # Backend download/stats VPN checks
SOURCES_SERVICE_URL=http://localhost:3003

# Source-provider settings are stored and pushed through the configuration wizard.
# SOURCES_DISABLE_VPN_CHECK defaults to the backend DISABLE_VPN_CHECK value on first push.
```

### Source service boundary

Run `npm run start:sources` from the repository root, or use `npm run dev`. In Docker,
`miauflix-services` includes source search on port 3003; development compose runs a separate
`sources` container. The backend uses `SourcesClientService` and never downloads provider
web pages or metadata-cache responses directly. Source URLs are encrypted opaque references.
The backend keeps source rows, source verification, episode matching and all playback logic.
See [the service README](../../services/sources/README.md) for configuration and offline fixtures.

## Development Status

### ✅ Phase 1: Infrastructure (Complete)

- ✅ WebTorrent client integration (`DownloadService`)
- ✅ Multi-provider source discovery (`SourceService`)
- ✅ Database layer with encryption
- ✅ Authentication and security middleware
- ✅ Background processing and scheduling

### ✅ Phase 2: Streaming Endpoint (Complete)

- ✅ `/api/stream/:token` route implementation with streaming key authentication
- ✅ Range request handling for video streaming and seeking
- ✅ Quality and codec preference selection (auto, specific quality, HEVC support)
- ✅ Bitrate cap (`preferences.maxBitrateKbps`): sources within the client's cap are tried first, then the rest from the leanest. Movies are estimated from their size and runtime; episodes from the episode's file in the source (not a whole season pack) and the show's typical episode length (`TVShow.episodeRuntime`, uncapped when TMDB has none) (the TV app asks for 8 Mbit/s)
- ✅ Comprehensive error handling and rate limiting (60 req/min)
- ✅ Stream source optimization and fallback logic

### 📋 Phase 3: Advanced Features (Planned)

- 📋 Viewport-based preload queue
- 📋 Seeking and pause/resume
- 📋 Adaptive quality streaming
- 📋 Subtitle integration

## Implementation Status

**Stream Endpoint**: ✅ COMPLETED

- All infrastructure exists and is operational
- HTTP Range request handling implemented
- WebTorrent stream piping to HTTP response working
- Connection cleanup and error handling implemented
- Quality selection and codec preferences supported
- Streaming key authentication with timing attack protection

**Current Status**: Full video streaming functionality is operational with all security, authentication, and source discovery working in production.
