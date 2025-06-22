# Complete System Architecture

## Miauflix System Overview

```mermaid
flowchart TB
    subgraph "User Interfaces"
        WEB[Web Browser<br/>React SPA]
        TV[Samsung Tizen TV<br/>Smart TV App]
    end

    subgraph "Infrastructure Layer"
        NGINX[Nginx Reverse Proxy<br/>SSL + Rate Limiting]
        VPN[NordVPN Container<br/>WireGuard Protocol]
        CERT[Let's Encrypt<br/>Auto SSL Renewal]
    end

    subgraph "Backend Services"
        API[Hono API Server<br/>TypeScript + Middleware]
        AUTH[Auth Service<br/>JWT + bcrypt]
        MEDIA[Media Service<br/>TMDB Integration]
        SOURCE[Source Service<br/>YTS + Torrent Discovery]
        SCHEDULER[Background Scheduler<br/>7 Automated Tasks]
    end

    subgraph "Data Layer"
        DB[(SQLite Database<br/>14 Entities + TypeORM)]
        CACHE[TMDB Cache<br/>Keyv + SQLite]
        STORAGE[Encrypted Storage<br/>WebTorrent Downloads]
    end

    subgraph "External APIs"
        TMDB[TMDB API<br/>Movie/TV Metadata]
        YTS[YTS + 4 Mirrors<br/>Torrent Sources]
        TRAKT[Trakt.tv<br/>Optional Sync]
    end

    subgraph "Torrent Infrastructure"
        WT[WebTorrent Client<br/>P2P Streaming]
        TRACKERS[Distributed Trackers<br/>Source Validation]
    end

    %% User connections
    WEB --> NGINX
    TV --> NGINX

    %% Infrastructure
    NGINX --> API
    CERT -.-> NGINX
    API --> VPN
    VPN --> SOURCE
    VPN --> WT

    %% Service connections
    API --> AUTH
    API --> MEDIA
    API --> SOURCE
    SCHEDULER --> MEDIA
    SCHEDULER --> SOURCE

    %% Data connections
    AUTH --> DB
    MEDIA --> DB
    SOURCE --> DB
    MEDIA --> CACHE
    CACHE --> TMDB

    %% External connections
    MEDIA --> TMDB
    SOURCE --> YTS
    AUTH --> TRAKT
    SOURCE --> TRACKERS
    WT --> FILES

    %% Background tasks (7 total)
    SCHEDULER -.->|1hr| MEDIA
    SCHEDULER -.->|1.5hr| MEDIA
    SCHEDULER -.->|1s| MEDIA
    SCHEDULER -.->|0.1s| SOURCE
    SCHEDULER -.->|0.2s| SOURCE
    SCHEDULER -.->|2s| SOURCE
    SCHEDULER -.->|5s| SOURCE

    %% Styling
    classDef frontend fill:#e1f5fe,stroke:#01579b,stroke-width:2px
    classDef infrastructure fill:#e0f2f1,stroke:#00695c,stroke-width:2px
    classDef backend fill:#e8f5e8,stroke:#2e7d32,stroke-width:2px
    classDef data fill:#fff3e0,stroke:#ef6c00,stroke-width:2px
    classDef external fill:#ffebee,stroke:#c62828,stroke-width:2px
    classDef torrent fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px

    class WEB,TV frontend
    class NGINX,VPN,CERT infrastructure
    class API,AUTH,MEDIA,SOURCE,SCHEDULER backend
    class DB,CACHE,FILES data
    class TMDB,YTS,TRAKT external
    class WT,TRACKERS torrent
```

## Key Architecture Characteristics

### 🔐 Security-First Design

- **VPN Protection**: All torrent traffic routed through NordVPN
- **Encryption**: Field-level database encryption for sensitive data
- **Authentication**: JWT with bcrypt password hashing
- **SSL/TLS**: Let's Encrypt certificates with auto-renewal

### 📊 Database Schema (14 Entities - VERIFIED)

#### Core Entities

1. **Movie**: `id`, `tmdbId`, `imdbId`, `title`, `overview`, `runtime`, `tagline`, `trailer`, `rating`, `popularity`, `releaseDate`, `poster`, `backdrop`, `logo`, `sourceSearched`
2. **MovieSource**: `id`, `movieId`, `hash` (encrypted), `magnetLink` (encrypted), `url` (encrypted), `quality`, `resolution`, `size`, `videoCodec`, `broadcasters`, `watchers`, `source`, `sourceType`, `file` (encrypted), `sourceUploadedAt`, `lastStatsCheck`, `nextStatsCheckAt`
3. **User**: `id`, `username`, `passwordHash`, `role`, `isActive`
4. **RefreshToken**: `id`, `userId`, `token`, `expiresAt`

#### Content Organization

5. **Genre**: `id`, `tmdbId`, `name`
6. **MovieTranslation**: `id`, `movieId`, `language`, `overview`, `title`, `tagline`
7. **MediaList**: Curated content collections
8. **Storage**: Download progress tracking
9. **SyncState**: Background task state management
10. **AuditLog**: Security event logging
11. **TraktUser**: Optional Trakt.tv integration

#### TV Content (Future)

12. **TVShow**: Television series metadata
13. **Season**: Season information
14. **Episode**: Individual episodes

### ⏰ Background Processing (7 Tasks - VERIFIED)

#### High Frequency (Sub-second)

- **Movie Source Search** (0.1s): Continuous torrent discovery from YTS
- **Torrent File Processing** (0.2s): Validate and process torrent files

#### Medium Frequency (1-5 seconds)

- **Season Completion** (1s): Complete incomplete TV show data
- **Source Statistics** (2s): Update seeds/peers from trackers
- **Source Resync** (5s): Validate and cleanup existing sources

#### Low Frequency (Hours)

- **List Refresh** (1hr): Synchronize content lists from TMDB
- **Movie Sync** (1.5hr): Update movie metadata from TMDB

### 🔄 Data Flow Priorities

#### Database-First Approach

1. **Check Database**: Always query local data first
2. **TMDB Cache**: Only when database lacks data
3. **External API**: Only when cache misses
4. **Store Results**: Save to database for future direct access

#### Caching Strategy

- **Purpose**: Reduce TMDB API rate limit impact
- **Scope**: TMDB API responses only (not database queries)
- **TTL**: 24 hours for metadata
- **Storage**: Keyv with SQLite adapter

### 🛡️ Security Implementation

#### Network Security

- **VPN Integration**: NordVPN with WireGuard protocol
- **SSL Termination**: Nginx with Let's Encrypt
- **Rate Limiting**: Per-endpoint limits (not global)

#### Data Protection

- **Field Encryption**: Sensitive MovieSource fields encrypted
- **Password Security**: bcrypt hashing with salts
- **Token Management**: Secure JWT refresh token rotation

#### Infrastructure Security

- **Container Isolation**: Docker-based service separation
- **Secret Management**: Environment variable configuration
- **Audit Logging**: Comprehensive security event tracking

## Technology Stack (VERIFIED)

### Frontend

- **React**: 18.2.0 with TypeScript
- **State**: Redux Toolkit 1.9.7
- **Styling**: Styled Components 6.1.1
- **Build**: Vite 4.5.0

### Backend

- **Framework**: Hono 4.7.10
- **Database**: SQLite 5.0.11 + TypeORM 0.3.10
- **Auth**: JOSE 6.0.10 (JWT handling)
- **Validation**: Zod 3.25.20
- **Torrent**: WebTorrent 2.6.7

### Infrastructure

- **Containers**: Docker multi-service
- **VPN**: NordVPN (ghcr.io/bubuntux/nordlynx)
- **Proxy**: Nginx Alpine
- **SSL**: Let's Encrypt + Certbot
- **Cache**: Keyv 5.3.1

### External APIs

- **Metadata**: TMDB API (primary)
- **Torrents**: YTS + 4 mirror endpoints
- **Tracking**: Trakt.tv (optional)
- **Validation**: Distributed torrent trackers

## Performance Characteristics

- **Response Time**: Sub-second for cached data
- **Scalability**: Stateless API design with connection pooling
- **Reliability**: Multi-mirror redundancy and error handling
- **Privacy**: Complete torrent traffic anonymization
- **Automation**: Continuous background data synchronization
