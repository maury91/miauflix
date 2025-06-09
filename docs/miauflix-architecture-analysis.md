# Miauflix System Architecture Analysis

## Executive Summary

Miauflix is a self-hosted streaming platform built with a modern microservices architecture using Node.js (Hono framework), React frontend, and Docker containerization. The system features comprehensive security through VPN integration, encryption services, and provides content discovery through torrent trackers with TMDB metadata enrichment.

## 1. System Components Analysis

### Backend Architecture (Node.js/TypeScript)

- **Framework**: Hono web framework with Node.js runtime
- **Main Application**: [`backend/src/app.ts`](../backend/src/app.ts:1) - Central application orchestrator
- **Database**: SQLite with TypeORM ORM for data persistence
- **Cache Layer**: SQLite-based caching with cache-manager (using @keyv/sqlite)
- **Background Processing**: Custom scheduler service for automated tasks

### Frontend Architecture (React/TypeScript)

- **Framework**: React 18 with TypeScript and Vite build system
- **State Management**: Redux Toolkit with RTK Query for API integration
- **UI Framework**: Styled Components with GSAP animations and Framer Motion
- **Platform Support**: Web and Tizen (Samsung Smart TV) platforms
- **Navigation**: Spatial navigation for TV interfaces

### Infrastructure Components

- **Reverse Proxy**: Nginx with SSL/TLS termination and Let's Encrypt integration
- **VPN**: NordVPN integration via Bubuntux/NordLynx container
- **SSL Management**: Automated certificate management with Certbot
- **Containerization**: Docker Compose orchestration for all services

## 2. Data Architecture Review

### Core Entities and Relationships

#### Media Entities:

- [`Movie`](../backend/src/entities/movie.entity.ts:21) - Core movie metadata with TMDB integration (IMDB IDs used as standard identifiers)
- [`MovieTranslation`](../backend/src/entities/movie.entity.ts:119) - Multi-language support
- [`MovieSource`](../backend/src/entities/movie-source.entity.ts:26) - Torrent sources with encryption
- [`TVShow`](../backend/src/entities/tvshow.entity.ts:1) - TV series with production status, episode runtime arrays, and rating system, [`Season`](../backend/src/entities/season.entity.ts:1), [`Episode`](../backend/src/entities/episode.entity.ts:1) - TV content structure
- [`Genre`](../backend/src/entities/genre.entity.ts:1) - Content categorization

#### User Management:

- [`User`](../backend/src/entities/user.entity.ts:19) - Authentication and authorization (USER/ADMIN roles)
- [`RefreshToken`](../backend/src/entities/refresh-token.entity.ts:1) - JWT token management
- [`TraktUser`](../backend/src/entities/trakt-user.entity.ts:1) - Trakt.tv integration

#### System Entities:

- [`AuditLog`](../backend/src/entities/audit-log.entity.ts:1) - Security and activity tracking
- [`Storage`](../backend/src/entities/storage.entity.ts:1) - Download and streaming progress
- [`SyncState`](../backend/src/entities/sync-state.entity.ts:1) - External API synchronization state
- [`List`](../backend/src/entities/list.entity.ts:1) - Curated content collections

### Data Security Features

- **Encryption**: Sensitive data (torrent hashes, magnet links) encrypted at rest
- **Field-level encryption**: [`MovieSource`](../backend/src/entities/movie-source.entity.ts:42) uses transformers for automatic encryption/decryption

## 3. API and Service Layer Mapping

### API Routes Structure

- **Health/Status**: [`/health`](../backend/src/routes/index.ts:42), [`/status`](../backend/src/routes/index.ts:45) - System monitoring
- **Authentication**: [`/auth`](../backend/src/routes/auth.routes.ts:1) - JWT-based authentication
- **Movies**: [`/movies`](../backend/src/routes/movie.routes.ts:1) - Movie discovery and source management
- **Lists**: [`/lists`](../backend/src/routes/index.ts:64), [`/list/:slug`](../backend/src/routes/index.ts:76) - Content collections
- **Trakt**: [`/trakt`](../backend/src/routes/trakt.routes.ts:1) - Trakt.tv integration

### Service Layer Architecture

#### Core Services:

- [`AuthService`](../backend/src/services/auth/auth.service.ts:1) - Authentication and user management
- [`MediaService`](../backend/src/services/media/media.service.ts:1) - Movie/TV show metadata management
- [`SourceService`](../backend/src/services/source/source.service.ts:1) - Torrent source discovery and management
- [`ListService`](../backend/src/services/media/list.service.ts:1) - Content list management

#### Integration Services:

- [`TMDBApi`](../backend/src/services/tmdb/tmdb.api.ts:1) - Movie database integration
- [`TraktService`](../backend/src/services/trakt/trakt.service.ts:1) - Trakt.tv synchronization
- [`TrackerService`](../backend/src/services/source/tracker.service.ts:1) - Torrent tracker management
- [`YTSApi`](../backend/src/trackers/yts/yts.api.ts:26) - YTS torrent tracker integration

#### Infrastructure Services:

- [`EncryptionService`](../backend/src/services/encryption/encryption.service.ts:1) - Data encryption/decryption
- [`VpnDetectionService`](../backend/src/services/security/vpn.service.ts:1) - VPN connectivity monitoring
- [`AuditLogService`](../backend/src/services/security/audit-log.service.ts:1) - Security event logging
- [`StorageService`](../backend/src/services/storage/storage.service.ts:1) - Download progress tracking

## 4. Background Process Identification

### Scheduled Tasks (via [`Scheduler`](../backend/src/services/scheduler.ts:4))

#### Content Synchronization:

- **List Refresh** (1 hour): [`listSynchronizer.synchronize()`](../backend/src/app.ts:99) - Sync content lists from external sources
- **Movie Sync** (1.5 hours): [`mediaService.syncMovies()`](../backend/src/app.ts:105) - Update movie metadata from TMDB
- **Incomplete Seasons** (1 second): [`mediaService.syncIncompleteSeasons()`](../backend/src/app.ts:111) - Fill missing TV show data

#### Source Discovery and Management:

- **Movie Source Search** (0.1 seconds): [`sourceService.searchSourcesForMovies()`](../backend/src/app.ts:117) - Find torrents for movies
- **Torrent File Search** (0.2 seconds): [`sourceService.searchTorrentFilesForSources()`](../backend/src/app.ts:123) - Download torrent files
- **Source Stats Update** (2 seconds): [`sourceService.syncStatsForSources()`](../backend/src/app.ts:129) - Update peer/seed counts
- **Source Resync** (5 seconds): [`sourceService.resyncMovieSources()`](../backend/src/app.ts:135) - Refresh stale sources

## 5. External Dependencies

### Required External APIs

- **TMDB (The Movie Database)**: Primary source for movie/TV metadata, images, and translations
- **Trakt.tv**: Watch list synchronization and progress tracking
- **YTS Tracker**: Primary torrent source with mirror fallback ([`yts.mx`, `yts.rs`, `yts.hn`, `yts.lt`, `yts.am`](../backend/src/trackers/yts/yts.api.ts:19))

### Optional Torrent Resolvers

- **iTorrents**: Torrent file resolution service
- **Torrage**: Torrent metadata and file hosting

### Infrastructure Dependencies

- **NordVPN**: VPN connectivity for secure torrenting
- **Let's Encrypt**: SSL certificate provisioning
- **Docker Registry**: Container image hosting (GitHub Container Registry)

## 6. Technology Stack Documentation

### Backend Stack

- **Runtime**: Node.js 20 with ES Modules
- **Framework**: Hono v4.7.10 (lightweight web framework)
- **Database**: SQLite v5.0.11 with TypeORM v0.3.10 ORM
- **Validation**: Zod schema validation
- **Authentication**: JWT with bcrypt password hashing
- **Cache**: Cache-manager with SQLite backend (@keyv/sqlite)
- **Torrent Handling**: WebTorrent v2.6.7, parse-torrent
- **Testing**: Jest with E2E testing infrastructure

### Frontend Stack

- **Framework**: React v18.2.0 with TypeScript
- **Build Tool**: Vite with SWC compilation
- **State Management**: Redux Toolkit v1.9.7 + RTK Query
- **Styling**: Styled Components v6.1.1 + SCSS
- **Animation**: GSAP + Framer Motion
- **Testing**: Jest + React Testing Library

### DevOps and Deployment

- **Containerization**: Docker + Docker Compose
- **Reverse Proxy**: Nginx with dynamic configuration
- **SSL/TLS**: Let's Encrypt with automated renewal
- **CI/CD**: GitHub Actions with automated testing
- **Code Quality**: ESLint, Prettier, TypeScript strict mode
- **Version Control**: Git with Husky pre-commit hooks

## 7. Security Architecture

### Network Security

- **VPN Integration**: All torrent traffic routed through NordVPN
- **SSL/TLS**: End-to-end encryption with automated certificate management
- **Network Isolation**: Docker network segmentation

### Application Security

- **Authentication**: JWT-based with refresh token rotation
- **Authorization**: Role-based access control (USER/ADMIN)
- **Rate Limiting**: API endpoint protection
- **Audit Logging**: Comprehensive security event tracking
- **Data Encryption**: Sensitive data encrypted at rest

### Data Protection

- **Field-level Encryption**: Torrent hashes and magnet links encrypted
- **VPN Detection**: Automatic VPN connectivity monitoring
- **Secure Configuration**: Environment-based configuration management

## 8. Data Flow Patterns

### Content Discovery Flow

1. **External Sync** → TMDB API → **Media Service** → **Database**
2. **Source Search** → YTS/Trackers → **Source Service** → **Encrypted Storage**
3. **Quality Scoring** → **Algorithm** → **Ranked Sources**

### User Interaction Flow

1. **Frontend Request** → **Nginx** → **Backend API**
2. **Authentication** → **JWT Validation** → **Rate Limiting**
3. **Business Logic** → **Service Layer** → **Database** → **Response**

### Background Processing Flow

1. **Scheduler** → **Service Methods** → **External APIs**
2. **Data Processing** → **Database Updates** → **Cache Invalidation**
3. **Error Handling** → **Retry Logic** → **Audit Logging**

## 9. Streaming and Content Delivery

### Chunk Store Architecture

The system implements an abstracted chunk store pattern for content delivery:

- **Abstract Chunk Store**: [`backend/src/chunk-stores/abstract-chunk-store/`](../backend/src/chunk-stores/abstract-chunk-store/) - Base interface for content storage
- **File System Chunk Store**: [`backend/src/chunk-stores/fs-chunk-store/`](../backend/src/chunk-stores/fs-chunk-store/) - Local file system storage
- **Encrypted Chunk Store**: [`backend/src/chunk-stores/encrypted-chunk-store/`](../backend/src/chunk-stores/encrypted-chunk-store/) - Encrypted content storage

### WebTorrent Integration

- **Torrent Parsing**: Direct torrent file handling and magnet link processing
- **Peer-to-Peer Streaming**: WebTorrent-based content delivery
- **Progressive Download**: Chunk-based streaming for immediate playback

## 10. Development and Testing Infrastructure

### Testing Strategy

- **Unit Tests**: Jest-based testing for individual components
- **E2E Tests**: [`backend-e2e/`](../backend-e2e/) - Comprehensive end-to-end testing
- **VCR Testing**: HTTP request recording/replay for offline testing
- **Fixture Management**: Pre-recorded API responses for consistent testing

### CI/CD Pipeline

- **GitHub Actions**: [`.github/workflows/ci.yml`](../.github/workflows/ci.yml:1) - Automated testing and deployment
- **Multi-stage Testing**: Lint, unit tests, and E2E tests in parallel
- **Docker Integration**: Container-based deployment testing

## Summary

Miauflix represents a sophisticated, production-ready streaming platform with a well-architected microservices design. The system demonstrates enterprise-level patterns including:

- **Scalable Architecture**: Modular service design with clear separation of concerns
- **Security First**: Comprehensive security through VPN integration, encryption, and audit logging
- **External Integration**: Robust API integration with fallback mechanisms
- **Background Processing**: Automated content discovery and synchronization
- **Modern Stack**: Contemporary technologies with TypeScript throughout
- **DevOps Ready**: Complete CI/CD pipeline with Docker containerization

The architecture supports the full content streaming lifecycle from discovery through delivery, with strong emphasis on security, reliability, and user experience.

## Architecture Diagrams Reference

This analysis serves as the foundation for generating the following Mermaid diagrams:

1. **System Architecture Diagram** - Overview of all components and their relationships
2. **Database ERD** - Entity relationships and data model
3. **API Flow Diagrams** - Request/response lifecycle and service interactions
4. **Background Process Flow** - Scheduled tasks and automated workflows
5. **Security Architecture** - VPN, encryption, and authentication flows
6. **Data Flow Diagrams** - Content discovery and streaming data flows
7. **Deployment Architecture** - Docker containers and infrastructure setup

---

_Generated on: 2025-06-08_  
_Last Updated: 2025-06-08_
