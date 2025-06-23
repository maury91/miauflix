# E2E Testing Strategy for Torrent Streaming Functionality - Comprehensive Research Report

## 📋 Executive Summary

This document presents a comprehensive research-based strategy for implementing End-to-End (E2E) testing for torrent streaming functionality in the Miauflix project. The research identifies the core challenges of testing BitTorrent streaming in a containerized environment and proposes a multi-container mock ecosystem that maintains production-like behavior while ensuring test reliability and speed.

## 🎯 Project Context & Requirements

### Current Architecture

- **Backend**: Node.js/Bun application with WebTorrent client integration
- **E2E Framework**: Docker Compose with production builds (no internal mocking allowed)
- **Authentication**: JWT-based with admin user auto-generation
- **Mock Infrastructure**: Comprehensive API mocking for TMDB, Trakt, YTS
- **Missing Component**: `/api/stream/:sourceId` endpoint for video streaming

### Core Constraints

1. **Production Builds Only**: Cannot mock internals of containers
2. **Container-to-Container Communication**: Must test actual service interactions
3. **Reproducible Results**: Tests must be deterministic and fast
4. **Real Protocol Testing**: Must validate actual BitTorrent/WebTorrent functionality

## 🔍 Problem Analysis

### The Challenge: Testing BitTorrent Streaming

Testing torrent streaming presents unique challenges not found in traditional API testing:

1. **External Dependencies**: Real torrents require external BitTorrent network connectivity
2. **Timing Variability**: Peer discovery and content downloading have unpredictable timing
3. **Content Availability**: External torrents may become unavailable or change
4. **Resource Intensive**: Large video files slow down test execution
5. **Network Complexity**: NAT traversal, tracker connectivity, and peer management

### Current Infrastructure Assessment

**✅ Strengths:**

- Mature WebTorrent implementation with tracker management
- Type-safe E2E test framework with authentication
- Comprehensive mock API ecosystem
- Docker-based isolated testing environment

**❌ Gaps:**

- No streaming endpoint implementation
- No BitTorrent-specific testing infrastructure
- Missing controlled torrent environment
- No HTTP range request testing

## 🧪 Research Methodology

### Tools & Resources Investigated

1. **BitTorrent Tracker Solutions**

   - `webtorrent/bittorrent-tracker`: Official WebTorrent tracker
   - `quoorex/docker-bittorrent-tracker`: Dockerized tracker with configuration
   - Custom tracker implementations

2. **Mock Seeding Solutions**

   - WebTorrent CLI for programmatic seeding
   - Custom Node.js seeder containers
   - File serving with deterministic content

3. **HTTP Range Request Testing**

   - `danvk/RangeHTTPServer`: Python-based range request server
   - `jakearchibald/range-request-test`: Browser-based range testing
   - Custom Node.js range request implementations

4. **Video Content Generation**
   - FFmpeg synthetic video generation
   - Deterministic test content creation
   - Multiple resolution/quality variants

## 💡 Recommended Solution: Multi-Container Mock Ecosystem

### Architecture Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Miauflix      │    │  BitTorrent     │    │   Torrent       │
│   Backend       │───▶│   Tracker       │◀───│   Seeder        │
│                 │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   E2E Tests     │    │   HTTP Range    │    │   Test Video    │
│   (Jest/TS)     │    │   Server        │    │   Files         │
│                 │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 🐳 Implementation Details

### 1. BitTorrent Tracker Container

**Container**: `quoorex/bittorrent-tracker`

- **Purpose**: Coordinate peer discovery and swarm management
- **Protocols**: HTTP, UDP, WebSocket support
- **Features**: Statistics endpoint, configurable whitelist/blacklist
- **Resource Usage**: Minimal (< 50MB RAM)

```yaml
bittorrent-tracker:
  image: quoorex/bittorrent-tracker:latest
  environment:
    - HTTP=true
    - UDP=true
    - WEBSOCKET=true
    - STATS=true
    - TRUST_PROXY=false
  networks:
    - test-network
  healthcheck:
    test: ['CMD', 'wget', '--spider', 'http://localhost:8000/stats']
    interval: 1s
    timeout: 2s
    retries: 30
```

### 2. Torrent Seeder Container

**Custom Container**: Controlled content seeding

- **Base**: `node:18-alpine`
- **Dependencies**: `webtorrent` library
- **Function**: Seed predetermined test content with known hashes
- **Content**: Synthetic videos generated with FFmpeg

```dockerfile
FROM node:18-alpine
WORKDIR /app

# Install dependencies
RUN npm install webtorrent

# Copy test content and seeding script
COPY test-videos/ /app/videos/
COPY seed-torrents.js /app/
COPY package.json /app/

# Install and start seeding
RUN npm install
CMD ["node", "seed-torrents.js"]
```

**Seeding Script** (`seed-torrents.js`):

```javascript
const WebTorrent = require('webtorrent');
const fs = require('fs');
const path = require('path');

const client = new WebTorrent({
  announce: ['ws://bittorrent-tracker:8000', 'http://bittorrent-tracker:8000/announce'],
});

// Predefined test files with known characteristics
const testFiles = [
  {
    path: '/app/videos/test-small-720p.mp4',
    name: 'test-small-720p',
    size: '1MB',
  },
  {
    path: '/app/videos/test-medium-1080p.mp4',
    name: 'test-medium-1080p',
    size: '5MB',
  },
  {
    path: '/app/videos/test-large-4k.mp4',
    name: 'test-large-4k',
    size: '20MB',
  },
];

// Health check endpoint
const http = require('http');
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: 'healthy',
        seedingTorrents: client.torrents.length,
        knownHashes: client.torrents.map(t => ({
          hash: t.infoHash,
          name: t.name,
          magnetURI: t.magnetURI,
        })),
      })
    );
  } else if (req.url === '/torrents') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify(
        client.torrents.map(t => ({
          hash: t.infoHash,
          name: t.name,
          magnetURI: t.magnetURI,
          size: t.length,
        }))
      )
    );
  }
});
server.listen(3001);

// Start seeding
testFiles.forEach(file => {
  if (fs.existsSync(file.path)) {
    client.seed(file.path, { name: file.name }, torrent => {
      console.log(`✅ Seeding: ${torrent.name}`);
      console.log(`🔗 Hash: ${torrent.infoHash}`);
      console.log(`📊 Magnet: ${torrent.magnetURI}`);
    });
  }
});

console.log('🌱 Torrent seeder started on port 3001');
```

### 3. HTTP Range Request Server

**Purpose**: Test streaming endpoint behavior independently

- **Technology**: Node.js with HTTP range request support
- **Function**: Serve test videos with proper HTTP 206 responses
- **Use Case**: Validate range request handling before BitTorrent integration

```javascript
const http = require('http');
const fs = require('fs');
const path = require('path');

const server = http.createServer((req, res) => {
  // CORS headers for browser testing
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    return res.end();
  }

  const filePath = path.join('/app/videos', req.url.slice(1));

  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    return res.end('File not found');
  }

  const stat = fs.statSync(filePath);
  const total = stat.size;
  const mimeType = path.extname(filePath) === '.mp4' ? 'video/mp4' : 'application/octet-stream';

  if (req.headers.range) {
    const range = req.headers.range;
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : total - 1;
    const chunksize = end - start + 1;

    console.log(`📊 Range request: ${start}-${end}/${total} (${chunksize} bytes)`);

    const file = fs.createReadStream(filePath, { start, end });
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${total}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': mimeType,
    });
    file.pipe(res);
  } else {
    console.log(`📊 Full file request: ${total} bytes`);
    res.writeHead(200, {
      'Content-Length': total,
      'Content-Type': mimeType,
      'Accept-Ranges': 'bytes',
    });
    fs.createReadStream(filePath).pipe(res);
  }
});

server.listen(3002, () => {
  console.log('🎥 Range request server started on port 3002');
});
```

### 4. Test Video Generation

**Synthetic Content Creation**: Deterministic video files for consistent testing

```bash
#!/bin/bash
# generate-test-videos.sh

# Create test videos directory
mkdir -p test-videos

# Small 720p video (1MB target)
ffmpeg -f lavfi -i testsrc=duration=10:size=1280x720:rate=24 \
       -f lavfi -i sine=frequency=440:duration=10 \
       -c:v libx264 -preset ultrafast -crf 28 \
       -c:a aac -b:a 64k \
       -t 10 test-videos/test-small-720p.mp4

# Medium 1080p video (5MB target)
ffmpeg -f lavfi -i testsrc=duration=30:size=1920x1080:rate=24 \
       -f lavfi -i sine=frequency=880:duration=30 \
       -c:v libx264 -preset fast -crf 25 \
       -c:a aac -b:a 128k \
       -t 30 test-videos/test-medium-1080p.mp4

# Large 4K video (20MB target)
ffmpeg -f lavfi -i testsrc=duration=60:size=3840x2160:rate=24 \
       -f lavfi -i sine=frequency=1760:duration=60 \
       -c:v libx264 -preset medium -crf 22 \
       -c:a aac -b:a 192k \
       -t 60 test-videos/test-large-4k.mp4

echo "✅ Test videos generated successfully"
```

## 📝 Docker Compose Integration

### Updated `docker-compose.test.yml`

```yaml
services:
  # Existing backend service (enhanced)
  backend:
    build:
      context: ../../
      dockerfile: backend.Dockerfile
    environment:
      - PORT=3000
      - NODE_ENV=test
      - RATE_LIMIT_TEST_MODE=true
      - TMDB_API_URL=http://tmdb-mock/3
      - YTS_API_URL=http://yts-mock
      - TRAKT_API_URL=http://trakt-mock
      - DISABLE_VPN_CHECK=true
      - DISABLE_DISCOVERY=false # Enable for BitTorrent testing
      - TORRENT_TRACKER_ANNOUNCE=ws://bittorrent-tracker:8000
      - DEBUG=*
    networks:
      - test-network
    ports:
      - '${PORT}:3000'
    volumes:
      - ../.env.test:/usr/src/app/.env:ro
    healthcheck:
      test: ['CMD', 'curl', '-f', '-s', '-o', '/dev/null', 'http://localhost:3000/health']
      interval: 0.5s
      timeout: 2s
      retries: 30
      start_period: 10s
    depends_on:
      tmdb-mock:
        condition: service_healthy
      yts-mock:
        condition: service_healthy
      trakt-mock:
        condition: service_healthy
      bittorrent-tracker:
        condition: service_healthy
      torrent-seeder:
        condition: service_healthy

  # BitTorrent Tracker
  bittorrent-tracker:
    image: quoorex/bittorrent-tracker:latest
    environment:
      - HTTP=true
      - UDP=true
      - WEBSOCKET=true
      - STATS=true
      - TRUST_PROXY=false
    networks:
      - test-network
    healthcheck:
      test: ['CMD', 'wget', '--no-verbose', '--tries=1', '--spider', 'http://localhost:8000/stats']
      interval: 1s
      timeout: 2s
      retries: 30
      start_period: 5s

  # Torrent Seeder
  torrent-seeder:
    build:
      context: .
      dockerfile: torrent-seeder.Dockerfile
    networks:
      - test-network
    healthcheck:
      test: ['CMD', 'wget', '--no-verbose', '--tries=1', '--spider', 'http://localhost:3001/health']
      interval: 1s
      timeout: 2s
      retries: 30
      start_period: 10s
    depends_on:
      bittorrent-tracker:
        condition: service_healthy

  # HTTP Range Server (for comparison testing)
  range-server:
    build:
      context: .
      dockerfile: range-server.Dockerfile
    networks:
      - test-network
    healthcheck:
      test:
        [
          'CMD',
          'wget',
          '--no-verbose',
          '--tries=1',
          '--spider',
          'http://localhost:3002/test-small-720p.mp4',
        ]
      interval: 1s
      timeout: 2s
      retries: 30

  # Existing mock services...
  tmdb-mock:
    # ... existing configuration

  yts-mock:
    # ... existing configuration

  trakt-mock:
    # ... existing configuration

networks:
  test-network:
    driver: bridge
```

## 🧪 E2E Test Implementation

### Test Structure

```
backend-e2e/src/tests/
├── streaming.test.ts           # Main streaming tests
├── torrent-lifecycle.test.ts   # Torrent management tests
├── range-requests.test.ts      # HTTP range request tests
└── performance.test.ts         # Streaming performance tests
```

### 1. Main Streaming Tests (`streaming.test.ts`)

```typescript
import { TestClient, waitForService, extractUserCredentialsFromLogs } from '../utils/test-utils';
import { waitForSeederReady, getKnownTorrentHash, getKnownMagnetUri } from '../utils/torrent-utils';

describe('Torrent Streaming E2E Tests', () => {
  let client: TestClient;
  let userCredentials: { email: string; password: string } | null = null;

  beforeAll(async () => {
    client = new TestClient();

    try {
      await waitForService(client);
      await waitForSeederReady(); // Wait for torrents to be seeded

      userCredentials = await extractUserCredentialsFromLogs();
      if (userCredentials) {
        await client.login(userCredentials);
      }
    } catch (error) {
      console.log('❌ Backend service or seeder not available');
      throw error;
    }
  }, 120000); // Longer timeout for BitTorrent setup

  describe('Stream Endpoint - Basic Functionality', () => {
    it('should stream small video content successfully', async () => {
      const torrentHash = await getKnownTorrentHash('test-small-720p');
      expect(torrentHash).toBeDefined();

      // Test full video stream
      const response = await client.get(['stream', torrentHash]);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('video/mp4');
      expect(response.headers['accept-ranges']).toBe('bytes');
      expect(response.headers['content-length']).toBeDefined();
    });

    it('should handle HTTP range requests correctly', async () => {
      const torrentHash = await getKnownTorrentHash('test-medium-1080p');

      // Test partial content request
      const response = await client.get(['stream', torrentHash], {
        headers: { Range: 'bytes=0-1023' },
      });

      expect(response.status).toBe(206);
      expect(response.headers['content-range']).toMatch(/bytes 0-1023\/\d+/);
      expect(response.headers['content-length']).toBe('1024');
    });

    it('should handle multiple range requests for seeking', async () => {
      const torrentHash = await getKnownTorrentHash('test-large-4k');

      // Simulate video seeking with multiple range requests
      const ranges = [
        'bytes=0-8191', // Beginning
        'bytes=1048576-1056767', // Middle
        'bytes=-8192', // End
      ];

      for (const range of ranges) {
        const response = await client.get(['stream', torrentHash], {
          headers: { Range: range },
        });

        expect(response.status).toBe(206);
        expect(response.headers['content-range']).toBeDefined();
      }
    });
  });

  describe('Stream Endpoint - Error Handling', () => {
    it('should return 404 for non-existent torrents', async () => {
      const fakeHash = '0'.repeat(40); // Invalid hash

      const response = await client.get(['stream', fakeHash]);
      expect(response.status).toBe(404);
    });

    it('should handle malformed range requests', async () => {
      const torrentHash = await getKnownTorrentHash('test-small-720p');

      const response = await client.get(['stream', torrentHash], {
        headers: { Range: 'bytes=invalid-range' },
      });

      expect(response.status).toBe(416); // Range Not Satisfiable
    });

    it('should timeout gracefully for unavailable torrents', async () => {
      // Create a torrent that exists in tracker but has no seeders
      const magnetUri = await getKnownMagnetUri('test-small-720p');

      // Stop seeder temporarily
      // ... implementation depends on seeder control mechanism

      const response = await client.get(['stream', 'unseed-hash'], {
        timeout: 5000,
      });

      expect(response.status).toBe(408); // Request Timeout
    });
  });

  describe('Stream Integration with Source Management', () => {
    it('should create and stream from new source', async () => {
      const magnetUri = await getKnownMagnetUri('test-medium-1080p');

      // Create source entry
      const sourceResponse = await client.post(['sources'], {
        json: {
          magnetUri,
          quality: '1080p',
          resolution: 1920,
          size: 5 * 1024 * 1024, // 5MB
          videoCodec: 'H264',
        },
      });

      expect(sourceResponse.status).toBe(201);
      const sourceId = sourceResponse.data.id;

      // Stream from source
      const streamResponse = await client.get(['stream', sourceId]);
      expect(streamResponse.status).toBe(200);
    });

    it('should handle concurrent streams', async () => {
      const torrentHash = await getKnownTorrentHash('test-large-4k');

      // Start multiple concurrent streams
      const streamPromises = Array(5)
        .fill(null)
        .map(() =>
          client.get(['stream', torrentHash], {
            headers: { Range: 'bytes=0-1023' },
          })
        );

      const responses = await Promise.all(streamPromises);

      responses.forEach(response => {
        expect(response.status).toBe(206);
      });
    });
  });
});
```

### 2. Torrent Lifecycle Tests (`torrent-lifecycle.test.ts`)

```typescript
describe('Torrent Lifecycle Management', () => {
  it('should download torrent metadata before streaming', async () => {
    const magnetUri = await getKnownMagnetUri('test-small-720p');

    // Test metadata download endpoint
    const metadataResponse = await client.post(['torrents', 'metadata'], {
      json: { magnetUri },
    });

    expect(metadataResponse.status).toBe(200);
    expect(metadataResponse.data).toHaveProperty('infoHash');
    expect(metadataResponse.data).toHaveProperty('files');
  });

  it('should manage torrent cleanup after streaming', async () => {
    // Test torrent cleanup mechanisms
    // Verify memory usage doesn't grow indefinitely
  });

  it('should reconnect to tracker after network issues', async () => {
    // Test resilience to network interruptions
  });
});
```

### 3. Performance Tests (`performance.test.ts`)

```typescript
describe('Streaming Performance', () => {
  it('should start streaming within reasonable time', async () => {
    const startTime = Date.now();
    const torrentHash = await getKnownTorrentHash('test-small-720p');

    const response = await client.get(['stream', torrentHash], {
      headers: { Range: 'bytes=0-1023' },
    });

    const responseTime = Date.now() - startTime;

    expect(response.status).toBe(206);
    expect(responseTime).toBeLessThan(5000); // 5 second max for first byte
  });

  it('should maintain consistent throughput', async () => {
    // Test streaming performance over time
    // Measure bandwidth and latency metrics
  });
});
```

### 4. Utility Functions (`torrent-utils.ts`)

```typescript
export async function waitForSeederReady(timeout: number = 30000): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      const response = await fetch('http://torrent-seeder:3001/health');
      if (response.ok) {
        const data = await response.json();
        if (data.seedingTorrents > 0) {
          console.log(`✅ Seeder ready with ${data.seedingTorrents} torrents`);
          return;
        }
      }
    } catch (error) {
      // Seeder not ready yet
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  throw new Error('Seeder did not become ready within timeout');
}

export async function getKnownTorrentHash(name: string): Promise<string> {
  const response = await fetch('http://torrent-seeder:3001/torrents');
  const torrents = await response.json();

  const torrent = torrents.find((t: any) => t.name === name);
  if (!torrent) {
    throw new Error(`Torrent ${name} not found in seeder`);
  }

  return torrent.hash;
}

export async function getKnownMagnetUri(name: string): Promise<string> {
  const response = await fetch('http://torrent-seeder:3001/torrents');
  const torrents = await response.json();

  const torrent = torrents.find((t: any) => t.name === name);
  if (!torrent) {
    throw new Error(`Torrent ${name} not found in seeder`);
  }

  return torrent.magnetURI;
}
```

## 📊 Benefits & Trade-offs

### ✅ Advantages

1. **Realistic Testing**

   - Tests actual BitTorrent protocol implementation
   - Validates WebTorrent client behavior
   - Tests real container-to-container communication

2. **Deterministic Results**

   - Known test content with predictable hashes
   - Controlled seeder behavior
   - Isolated network environment

3. **Comprehensive Coverage**

   - HTTP range request handling
   - BitTorrent protocol compliance
   - Error conditions and edge cases
   - Performance characteristics

4. **Fast Execution**

   - Local network only (no external dependencies)
   - Small test files for quick transfers
   - Parallel test execution capability

5. **Maintainable**
   - Clear separation of concerns
   - Docker-based infrastructure
   - Reusable components

### ⚠️ Trade-offs & Considerations

1. **Setup Complexity**

   - Additional containers to manage
   - More complex dependency coordination
   - Container build and startup time

2. **Resource Usage**

   - ~3-4 additional containers in test environment
   - Estimated 200-400MB additional RAM usage
   - Network overhead for BitTorrent protocol

3. **Maintenance Overhead**

   - Test video file management
   - Container image updates
   - BitTorrent library version compatibility

4. **Limited Real-world Scenarios**
   - Doesn't test NAT traversal
   - Limited peer diversity
   - No real network conditions (latency, packet loss)

## 🚀 Implementation Roadmap

### Phase 1: Core Infrastructure (Week 1-2)

- [ ] Create `/api/stream/:sourceId` endpoint
- [ ] Implement HTTP range request handling
- [ ] Add basic torrent metadata management

### Phase 2: Test Environment Setup (Week 2-3)

- [ ] Create BitTorrent tracker container
- [ ] Implement torrent seeder container
- [ ] Generate deterministic test video content
- [ ] Update Docker Compose configuration

### Phase 3: Basic Test Implementation (Week 3-4)

- [ ] Implement core streaming tests
- [ ] Add torrent lifecycle tests
- [ ] Create torrent utility functions
- [ ] Validate basic functionality

### Phase 4: Advanced Testing (Week 4-5)

- [ ] Add performance benchmarks
- [ ] Implement error condition testing
- [ ] Add concurrent streaming tests
- [ ] Create comprehensive test coverage

### Phase 5: Optimization & Documentation (Week 5-6)

- [ ] Optimize container startup times
- [ ] Add monitoring and logging
- [ ] Create troubleshooting guides
- [ ] Performance tuning

## 📈 Success Metrics

### Test Coverage Goals

- **Functional Coverage**: 95% of streaming endpoint functionality
- **Error Handling**: 100% of error conditions tested
- **Performance**: Baseline metrics for streaming latency/throughput
- **Integration**: Full WebTorrent → Tracker → Seeder workflow

### Performance Targets

- **First Byte Time**: < 5 seconds for initial stream request
- **Range Request Response**: < 1 second for cached content
- **Concurrent Streams**: Support 10+ simultaneous connections
- **Test Execution Time**: < 2 minutes for full streaming test suite

## 🔍 Alternative Approaches Evaluated

### 1. Mock HTTP Server Only

**Approach**: Replace BitTorrent with simple HTTP file serving

- **Pros**: Simple implementation, fast execution
- **Cons**: Doesn't test actual BitTorrent functionality
- **Verdict**: ❌ Doesn't meet requirement for realistic testing

### 2. Real External Torrents

**Approach**: Use actual public torrents for testing

- **Pros**: Most realistic scenario
- **Cons**: Unreliable, slow, external dependencies
- **Verdict**: ❌ Violates reliability and speed requirements

### 3. In-Memory Mocking

**Approach**: Mock WebTorrent client behavior

- **Pros**: Fastest execution, no containers
- **Cons**: Cannot test container interactions (violates constraint)
- **Verdict**: ❌ Violates production build requirement

### 4. Hybrid Approach

**Approach**: Mix of real BitTorrent and HTTP fallback

- **Pros**: Balanced realism and reliability
- **Cons**: Complex implementation, inconsistent test behavior
- **Verdict**: ⚠️ Considered but rejected for consistency

## 📚 Technical References

### BitTorrent Protocol Resources

- [BEP 0003: The BitTorrent Protocol Specification](http://bittorrent.org/beps/bep_0003.html)
- [WebTorrent Protocol Specification](https://github.com/webtorrent/webtorrent/blob/master/docs/api.md)
- [HTTP Range Requests (RFC 7233)](https://tools.ietf.org/html/rfc7233)

### Implementation References

- [webtorrent/bittorrent-tracker](https://github.com/webtorrent/bittorrent-tracker)
- [quoorex/docker-bittorrent-tracker](https://github.com/Quoorex/docker-bittorrent-tracker)
- [jakearchibald/range-request-test](https://github.com/jakearchibald/range-request-test)

### Docker & Testing Resources

- [Docker Compose Networking](https://docs.docker.com/compose/networking/)
- [Jest E2E Testing Best Practices](https://jestjs.io/docs/tutorial-async)
- [Container Orchestration for Testing](https://testcontainers.org/)

## 🎯 Conclusion

The multi-container mock ecosystem approach provides the optimal solution for testing torrent streaming functionality in the Miauflix project. It successfully addresses all constraints while providing comprehensive, realistic, and maintainable test coverage.

**Key Recommendations:**

1. **Prioritize Phase 1-2**: Focus on core infrastructure and test environment setup
2. **Start Simple**: Begin with basic streaming tests before adding complexity
3. **Monitor Performance**: Track container resource usage and test execution times
4. **Iterate Based on Feedback**: Adjust approach based on initial implementation results

This strategy ensures reliable, fast, and comprehensive testing of the torrent streaming functionality while maintaining the production-like environment requirements and enabling future expansion of the test suite.

---

**Document Version**: 1.0  
**Last Updated**: 2025-06-23  
**Research Conducted By**: AI Assistant  
**Status**: Research Complete - Ready for Implementation
