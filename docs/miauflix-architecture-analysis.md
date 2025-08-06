# Miauflix Architecture Analysis

## Executive Summary

Miauflix is a self-hosted streaming platform that discovers and streams media content. The backend (Node.js + Hono) handles source discovery and streaming, while the React frontend provides the UI. Uses SQLite for data, Docker for deployment, and optional VPN integration for privacy.

## Technology Stack

### Backend

- **API Framework**: Hono
- **Database**: SQLite + TypeORM
- **Streaming Engine**: WebTorrent for peer-to-peer delivery
- **Auth**: JWT tokens with JOSE library
- **Validation**: Zod schemas

### Frontend

- **Framework**: React + TypeScript
- **State**: Redux Toolkit + RTK Query
- **Build**: Vite
- **TV Support**: Spatial navigation for Samsung TVs

### Infrastructure

- **Deployment**: Docker + docker-compose
- **VPN**: NordVPN integration (optional, more are welcome)
- **Web Server**: Nginx with Let's Encrypt SSL
- **Background Jobs**: Custom scheduler

## System Architecture Overview

### Core Components

#### 1. Frontend (`frontend/`)

- More-famous-streaming-platform-like React interface with Redux state management
- Samsung TV support (spatial navigation for remote control)
- Pages: Home, Player, Movie details, User profiles

#### 2. Backend API (`backend/`)

- REST API built with Hono framework
- Service classes for business logic (Auth, Media, Source, Download)
- Routes: `/movies`, `/auth`, `/stream` (complete)
- Middleware: JWT auth, rate limiting, audit logging

#### 3. Database

- SQLite with TypeORM for entities and migrations
- AES-256-GCM encryption for sensitive source metadata

#### 4. External Services

- **TMDB**: Movie posters, ratings, metadata
- **YTS + THERARBG**: Source metadata discovery
- **Trakt.tv**: Watch list sync (optional)
- **Peer Network**: Availability statistics

## Database Schema

### Core Entities (13 Total)

#### Media Entities

1. **Movie**: Film metadata with TMDB integration
   - Fields: `tmdbId`, `title`, `overview`, `releaseDate`, `poster`, `backdrop`, `runtime`, `budget`, `revenue`, `popularity`, `rating`
   - Relationships: `MovieSource[]`, `Genre[]`, `MovieTranslation[]`

2. **TVShow**: Television series metadata (CORRECTED SCHEMA)
   - Fields: `tmdbId`, `name`, `overview`, `firstAirDate`, `poster`, `backdrop`, `status`, `tagline`, `type`, `inProduction`, `episodeRunTime[]`, `popularity`, `rating`
   - Relationships: `Season[]`, `Genre[]`, `TVShowTranslation[]`

3. **Season**: TV show season information
   - Fields: `seasonNumber`, `name`, `overview`, `airDate`, `episodeCount`, `poster`
   - Relationships: `TVShow`, `Episode[]`

4. **Episode**: Individual episode metadata
   - Fields: `episodeNumber`, `name`, `overview`, `airDate`, `runtime`, `stillPath`
   - Relationships: `Season`

#### Source Management

5. **MovieSource**: Media source tracking
   - Fields: `quality`, `type`, `size`, `seeds`, `peers`, `magnetUri`, `infoHash`, `language`, `title`, `score`
   - Relationships: `Movie`

#### User Management

6. **User**: Application users with role-based access
   - Fields: `username`, `passwordHash`, `role`, `isActive`
   - Relationships: `RefreshToken[]`, `TraktUser?`

7. **RefreshToken**: JWT refresh token management
   - Fields: `token`, `expiresAt`, `userId`
   - Relationships: `User`

#### Content Organization

8. **MediaList**: Curated content collections
   - Fields: `name`, `description`, `isPublic`
   - Relationships: `Movie[]`, `TVShow[]`

9. **Genre**: Content categorization
   - Fields: `tmdbId`, `name`
   - Relationships: `Movie[]`, `TVShow[]`, `GenreTranslation[]`

10. **GenreTranslation**: Localized genre names
    - Fields: `language`, `name`
    - Relationships: `Genre`

#### System Management

11. **Storage**: Download progress tracking
    - Fields: `infoHash`, `downloadProgress`, `uploadProgress`, `status`, `peers`, `downloaded`, `uploaded`

12. **SyncState**: Synchronization state tracking
    - Fields: `key`, `lastSync`, `data`

13. **AuditLog**: Security and activity logging
    - Fields: `userId`, `action`, `resource`, `severity`, `metadata`, `ipAddress`, `userAgent`

#### Integrations

14. **TraktUser**: Trakt.tv integration
    - Fields: `username`, `accessToken`, `refreshToken`, `expiresAt`
    - Relationships: `User`

## Scheduled Background Tasks (7 Tasks)

> **Implementation Status:** ✅ All tasks fully implemented and operational

The system implements automated background processing with the following scheduled tasks:

1. **List Refresh** (`refreshLists`)
   - **Interval**: 1 hour (3600 seconds)
   - **Function**: Synchronizes media lists and categories
   - **Service**: `ListSynchronizer.synchronize()`
   - **Status**: ✅ Active

2. **Movie Synchronization** (`syncMovies`)
   - **Interval**: 1.5 hours (5400 seconds)
   - **Function**: Updates movie metadata from TMDB
   - **Service**: `MediaService.syncMovies()`
   - **Status**: ✅ Active

3. **Season Completion** (`syncIncompleteSeasons`)
   - **Interval**: 1 second
   - **Function**: Completes partial TV show season data
   - **Service**: `MediaService.syncIncompleteSeasons()`
   - **Status**: ✅ Active

4. **Movie Source Discovery** (`movieSourceSearch`)
   - **Interval**: 0.1 seconds (100ms)
   - **Function**: **✅ FULLY IMPLEMENTED** - Multi-provider torrent source discovery (YTS + THERARBG)
   - **Service**: `SourceService.searchSourcesForMovies()`
   - **Features**: VPN-aware processing, rate limiting, background aggregation
   - **Status**: ✅ Production ready

5. **Torrent File Processing** (`dataFileSearch`)
   - **Interval**: 0.2 seconds (200ms)
   - **Function**: **✅ FULLY IMPLEMENTED** - Downloads and validates torrent files
   - **Service**: `SourceService.syncMissingSourceFiles()`
   - **Features**: Timeout handling, file validation, metadata extraction
   - **Status**: ✅ Production ready

6. **Source Statistics Update** (`updateSourcesStats`)
   - **Interval**: 2 seconds
   - **Function**: **✅ FULLY IMPLEMENTED** - Updates seeds/peers statistics via tracker scraping
   - **Service**: `SourceService.syncStatsForSources()`
   - **Features**: Real-time tracker communication, statistics persistence
   - **Status**: ✅ Production ready

7. **Source Resynchronization** (`resyncMovieSources`)
   - **Interval**: 5 seconds
   - **Function**: **✅ FULLY IMPLEMENTED** - Revalidates and updates existing sources
   - **Service**: `SourceService.resyncMovieSources()`
   - **Features**: Source quality updates, dead link removal
   - **Status**: ✅ Production ready

## Infrastructure Implementation Status

### ✅ Fully Implemented Components

#### Source Management (Production Ready)

- **Multi-Provider System**: YTS + THERARBG content directories with full API implementations
- **Background Processing**: Continuous source discovery every 0.1 seconds
- **VPN Integration**: Automatic pause/resume based on VPN connectivity
- **Rate Limiting**: Per-provider rate limiters with configurable thresholds
- **On-Demand Search**: Real-time source discovery with timeout handling
- **Quality Detection**: Automatic resolution, codec, and metadata extraction
- **Database Integration**: Encrypted source persistence with comprehensive entity model

#### WebTorrent Infrastructure (Complete)

- **Download Service**: Full WebTorrent client with tracker management
- **Magnet Processing**: Dynamic magnet link generation with tracker lists
- **Stats Scraping**: Real-time seeders/leechers data via tracker communication
- **Connection Management**: Configurable bandwidth and connection limits
- **File Handling**: Torrent file download with timeout and validation

#### Authentication & Security (Production Ready)

- **JWT System**: Complete authentication with refresh tokens and role-based access
- **Middleware Stack**: Rate limiting, audit logging, request validation
- **Encryption**: AES-256-GCM field-level encryption for sensitive data
- **VPN Detection**: Automatic VPN status monitoring with service integration

#### Streaming Endpoint (Now Complete)

- **Stream Route**: `/stream/:token` endpoint fully implemented
- **Features**: Range request handling, quality selection, HEVC support, rate limiting
- **Impact**: Full video playback functionality is now operational

#### Viewport Preload (Secondary Priority)

- **Preload Queue**: `/api/ui/viewport` endpoint for priority-based preloading
- **Impact**: Performance optimization for user experience
- **Note**: Basic preload infrastructure exists in database layer

## Security Architecture

### Multi-Layer Security Design

#### 1. Network Security

- **VPN Integration**: All torrent traffic routed through NordVPN
- **Containerized Isolation**: Services isolated in Docker containers
- **SSL/TLS Encryption**: HTTPS with Let's Encrypt certificates
- **Reverse Proxy**: Nginx with security headers and rate limiting

#### 2. Application Security

- **JWT Authentication**: Secure token-based authentication
- **Role-Based Access Control**: User, Admin, and Guest roles
- **Field-Level Encryption**: Sensitive database fields encrypted
- **Input Validation**: Zod schema validation for all inputs
- **Audit Logging**: Comprehensive security event tracking

#### 3. Data Protection

- **Encryption at Rest**: Database encryption for sensitive fields
- **Secure Hashing**: bcrypt for password storage
- **Token Management**: Secure refresh token rotation
- **Data Sanitization**: Input sanitization and XSS protection

#### 4. Infrastructure Security

- **Container Security**: Non-root user execution
- **Secret Management**: Environment variable-based configuration
- **Network Policies**: Restricted inter-service communication
- **Monitoring**: VPN status monitoring with automatic reconnection

## Performance Optimization

### Caching Strategy

- **Multi-Level Caching**: Memory and persistent cache layers
- **API Response Caching**: TMDB API responses cached
- **Database Query Optimization**: Indexed queries and relationships
- **Asset Optimization**: Frontend build optimization with Vite

### Background Processing

- **Async Task Processing**: Non-blocking background tasks
- **Rate-Limited Operations**: Controlled API request rates
- **Graceful Degradation**: Fallback mechanisms for service failures
- **Resource Management**: Memory and CPU usage optimization

## Deployment Architecture

### Docker Containerization

```yaml
Services:
  - nordvpn: VPN container with WireGuard
  - backend: Miauflix API application
  - nginx: Reverse proxy with SSL termination
  - certbot: SSL certificate management
```

### Container Network Topology

- **Backend**: Routes through NordVPN container
- **Nginx**: Exposed on ports 80/443 with SSL
- **Certbot**: Automated certificate renewal
- **Shared Volumes**: Data persistence and configuration

### SSL/HTTPS Configuration

- **Let's Encrypt Integration**: Automated certificate provisioning
- **HTTPS Redirect**: Forced HTTPS for all connections
- **Security Headers**: HSTS, CSP, and other security headers
- **Certificate Renewal**: Automated 12-hour renewal checks

## Development Workflow

### Code Organization

- **Monorepo Structure**: Frontend, backend, and packages
- **TypeScript**: Full type safety across the stack
- **ESLint/Prettier**: Code quality and formatting
- **Testing**: Jest test suites for both frontend and backend

### Build Pipeline

- **Frontend**: Vite-based React build
- **Backend**: TypeScript compilation with path aliases
- **Docker**: Multi-stage builds for production optimization
- **CI/CD**: GitHub Actions for automated testing and deployment

## Monitoring and Maintenance

### Health Monitoring

- **VPN Status**: Continuous VPN connection monitoring
- **Service Health**: Application health checks
- **Error Tracking**: Comprehensive error logging
- **Performance Metrics**: Response time and resource usage

### Data Integrity

- **Database Migrations**: Version-controlled schema changes
- **Backup Strategy**: Automated database backups
- **Data Validation**: Runtime data validation and sanitization
- **Audit Trail**: Complete audit log for security compliance

## Scalability Considerations

### Horizontal Scaling

- **Stateless Design**: Session-independent API design
- **Database Optimization**: Indexed queries and connection pooling
- **Caching Strategy**: Distributed caching for multi-instance deployment
- **Load Balancing**: Nginx-based load balancing capabilities

### Vertical Scaling

- **Resource Optimization**: Efficient memory and CPU usage
- **Database Performance**: Query optimization and indexing
- **Background Task Management**: Controlled concurrent processing
- **Storage Management**: Efficient file system usage

## Future Enhancements

### Planned Features

- **Multi-Language Support**: Extended localization
- **Advanced Search**: Enhanced content discovery
- **User Preferences**: Personalized recommendations
- **Mobile Applications**: Native mobile app development

### Technical Improvements

- **Microservices Migration**: Service decomposition for scalability
- **Advanced Caching**: Redis integration for distributed caching
- **Real-Time Features**: WebSocket implementation for live updates
- **Analytics Dashboard**: User behavior and system performance analytics

---

_This architecture analysis reflects the current state of Miauflix as of the verification date and serves as a foundation for future development and scaling decisions._
