# Streaming Services

The backend provides torrent-based streaming capabilities through WebTorrent integration.

## Current Implementation

### WebTorrent Integration

- **Magnet Link Conversion**: Convert magnet links to torrent objects for processing
- **Metadata Extraction**: Parse torrent files to extract detailed information about media content
- **File Analysis**: Analyze torrent contents to identify video files and their properties
- **Basic Streaming Support**: Foundation for streaming torrent content

### Source Services

- **Torrent Processing**: Handle torrent files and magnet links
- **Metadata Parsing**: Extract title, quality, and other metadata from torrent names
- **Quality Detection**: Automatically detect video quality (720p, 1080p, 4K, etc.)
- **File Validation**: Validate torrent contents for media files

## Planned Features

### Custom Streaming Server

- **Authentication Integration**: Secure streaming with user authentication
- **Session Management**: User-specific streaming sessions with proper isolation
- **Bandwidth Management**: Intelligent bandwidth allocation and throttling
- **Adaptive Streaming**: Quality adjustment based on connection speed
- **Pause/Resume**: Full pause and resume functionality for streams
- **Seeking Support**: Jump to specific timestamps in media content
- **Error Recovery**: Robust error handling and stream recovery mechanisms

### Advanced Features

- **Multi-file Torrents**: Handle torrents with multiple episodes or movies
- **Subtitle Integration**: Automatic subtitle detection and streaming
- **Transcoding**: On-the-fly video transcoding for compatibility
- **Download Management**: Optional downloading for offline viewing
- **Stream Analytics**: Monitor streaming performance and user behavior

## API Endpoints

### Current Endpoints

- `POST /api/torrents/parse` - Parse magnet link and extract metadata
- `GET /api/torrents/:hash/info` - Get torrent information
- `POST /api/torrents/convert` - Convert magnet to torrent object

### Planned Endpoints

- `GET /api/stream/:hash` - Start streaming a torrent
- `GET /api/stream/:hash/status` - Get streaming status
- `POST /api/stream/:hash/seek` - Seek to specific position
- `DELETE /api/stream/:hash` - Stop streaming session

## Configuration

### Environment Variables

```env
# WebTorrent Configuration
WEBTORRENT_MAX_CONNS=100
WEBTORRENT_DHT_PORT=6881
WEBTORRENT_DOWNLOAD_LIMIT=0
WEBTORRENT_UPLOAD_LIMIT=0

# Streaming Configuration
STREAM_PORT=8080
STREAM_TIMEOUT=30000
STREAM_BUFFER_SIZE=1048576

# Security Configuration
STREAM_AUTH_REQUIRED=true
STREAM_RATE_LIMIT=10
```

### Performance Settings

```env
# Memory Management
MAX_CONCURRENT_STREAMS=5
STREAM_CACHE_SIZE=104857600
TORRENT_TIMEOUT=60000

# Network Configuration
PEER_TIMEOUT=30000
ANNOUNCE_TIMEOUT=15000
MAX_PEERS=200
```

## Security Considerations

### Authentication

- All streaming endpoints require valid JWT tokens
- User permissions checked before stream initiation
- Session isolation prevents cross-user access

### Rate Limiting

- Prevent abuse with streaming rate limits
- Per-user concurrent stream limits
- Bandwidth throttling for fair usage

### Content Validation

- Validate torrent sources before streaming
- Check file types to prevent malicious content
- Monitor for suspicious download patterns

## Technical Implementation

### WebTorrent Client

The streaming service uses a WebTorrent client with the following features:

```typescript
interface StreamingService {
  // Convert magnet to torrent
  convertMagnet(magnetUri: string): Promise<TorrentInfo>;

  // Parse torrent metadata
  parseTorrent(torrent: Buffer): Promise<TorrentMetadata>;

  // Start streaming session
  startStream(torrentHash: string, userId: string): Promise<StreamSession>;

  // Get stream status
  getStreamStatus(sessionId: string): Promise<StreamStatus>;

  // Stop streaming session
  stopStream(sessionId: string): Promise<void>;
}
```

### File Processing

- **Media Detection**: Identify video files within torrents
- **Quality Analysis**: Determine video resolution and codec
- **Duration Extraction**: Get media duration for seeking support
- **Subtitle Detection**: Find and extract subtitle files

### Error Handling

- **Connection Failures**: Handle peer connection issues
- **Timeout Management**: Graceful handling of slow downloads
- **Stream Interruption**: Recover from network interruptions
- **Invalid Content**: Handle corrupted or invalid torrents

## Development Roadmap

### Phase 1: Basic Streaming (Current)

- ✅ WebTorrent integration
- ✅ Magnet link conversion
- ✅ Metadata extraction
- ✅ Basic torrent parsing

### Phase 2: Streaming Server

- 🚧 Custom streaming endpoints
- 🚧 User session management
- 🚧 Authentication integration
- 🚧 Basic error handling

### Phase 3: Advanced Features

- 📋 Seeking and pause/resume
- 📋 Bandwidth management
- 📋 Quality adaptation
- 📋 Subtitle integration

### Phase 4: Optimization

- 📋 Performance optimization
- 📋 Caching strategies
- 📋 Load balancing
- 📋 Monitoring and analytics
