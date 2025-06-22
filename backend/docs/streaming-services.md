# Streaming Services

> **Status Updated:** 2025-06-25 - Verified against actual implementation

The backend provides comprehensive torrent infrastructure with WebTorrent integration. **Note:** The streaming endpoint is not yet implemented, but all supporting infrastructure exists.

## ✅ Current Implementation (Fully Functional)

### WebTorrent Infrastructure (Complete)

- ✅ **Complete WebTorrent Client**: `DownloadService` with full WebTorrent integration
- ✅ **Tracker Management**: Best tracker loading, blacklist support, IP set filtering
- ✅ **Magnet Link Generation**: Dynamic magnet link creation with tracker lists
- ✅ **Torrent File Download**: Timeout-based torrent file retrieval
- ✅ **Stats Scraping**: Real-time seeders/leechers statistics
- ✅ **Connection Management**: Configurable connection and bandwidth limits

### Source Services (Production Ready)

- ✅ **Multi-Provider Aggregation**: YTS + THERARBG content directories fully implemented
- ✅ **Background Source Discovery**: Automated source search every 0.1 seconds
- ✅ **VPN-Aware Processing**: Automatic pause/resume based on VPN status
- ✅ **On-Demand Source Search**: Real-time source discovery with timeout (`getSourcesForMovieWithOnDemandSearch`)
- ✅ **Rate Limiting**: Per-provider rate limiters with configurable limits
- ✅ **Quality Detection**: Automatic quality, codec, and metadata extraction
- ✅ **Database Integration**: Complete source persistence with encryption

### API Infrastructure (Ready for Streaming)

- ✅ **Movie Endpoints**: `/movies/:id?includeSources=true` provides sources for streaming
- ✅ **Authentication**: Complete JWT system with refresh tokens and role-based access
- ✅ **Rate Limiting**: Configurable rate limiting per endpoint
- ✅ **Error Handling**: Comprehensive error handling and audit logging

## ❌ Missing Implementation

### Critical Missing Component

**Stream Endpoint**: The `/api/stream/:sourceId` endpoint is not implemented. This is the only missing piece preventing video streaming.

**Required Implementation:**

```typescript
// Missing: routes/stream.routes.ts
app.get('/api/stream/:sourceId', authGuard(), async c => {
  // 1. Lookup MovieSource by ID
  // 2. Add torrent to DownloadService client
  // 3. Handle Range requests for video streaming
  // 4. Pipe WebTorrent stream to HTTP response
  // 5. Cleanup on connection close
});
```

### Secondary Missing Components

- **Viewport Preload Queue**: `/api/ui/viewport` endpoint for priority-based preloading
- **Stream Session Management**: User-specific streaming sessions
- **Seeking Support**: Jump to specific timestamps (requires stream endpoint first)

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
DISABLE_VPN_CHECK=false   # VPN required for source search
```

## Development Status

### ✅ Phase 1: Infrastructure (Complete)

- ✅ WebTorrent client integration (`DownloadService`)
- ✅ Multi-provider source discovery (`SourceService`)
- ✅ Database layer with encryption
- ✅ Authentication and security middleware
- ✅ Background processing and scheduling

### ❌ Phase 2: Streaming Endpoint (Missing)

- ❌ `/api/stream/:sourceId` route implementation
- ❌ Range request handling for video streaming
- ❌ Stream session management
- ❌ Connection cleanup on client disconnect

### 📋 Phase 3: Advanced Features (Planned)

- 📋 Viewport-based preload queue
- 📋 Seeking and pause/resume
- 📋 Adaptive quality streaming
- 📋 Subtitle integration

## Implementation Estimate

**Stream Endpoint**: ~8 hours (as per `backend#stream` todo)

- All infrastructure exists
- Requires HTTP Range request handling
- WebTorrent stream piping to HTTP response
- Connection cleanup and error handling

**Impact**: Once implemented, enables full video streaming functionality with all security, authentication, and source discovery already working.
