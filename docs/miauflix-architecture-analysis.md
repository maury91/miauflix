# Miauflix Architecture Analysis

## Executive Summary

Miauflix is a comprehensive media streaming platform built with modern web technologies, designed with security-first principles and privacy protection. The system features a React-based frontend, Hono backend API, SQLite database with TypeORM, and Docker containerization with NordVPN integration for secure torrent operations.

## Technology Stack

### Backend Infrastructure

- **Framework**: [Hono v4.7.10](https://hono.dev/) - Lightweight web framework
- **Runtime**: Node.js with TypeScript v5.8.3
- **Database**: SQLite v5.0.11 with [TypeORM v0.3.10](https://typeorm.io/)
- **Torrent Client**: [WebTorrent v2.6.7](https://webtorrent.io/)
- **Authentication**: [JOSE v6.0.10](https://github.com/panva/jose) for JWT handling
- **Caching**: [Keyv v5.3.1](https://keyv.org/) with SQLite adapter
- **Validation**: [Zod v3.25.20](https://zod.dev/) for schema validation

### Frontend Application

- **Framework**: [React v18.2.0](https://react.dev/) with TypeScript
- **State Management**: [Redux Toolkit v1.9.7](https://redux-toolkit.js.org/)
- **Styling**: [Styled Components v6.1.1](https://styled-components.com/)
- **Animations**: [Framer Motion v10.16.4](https://www.framer.com/motion/) and [GSAP v3.12.2](https://gsap.com/)
- **Build Tool**: [Vite v4.5.0](https://vitejs.dev/)
- **Navigation**: [@noriginmedia/norigin-spatial-navigation v2.0.1](https://github.com/NoriginMedia/norigin-spatial-navigation)

### Infrastructure & Security

- **Containerization**: Docker with multi-service orchestration
- **VPN Integration**: NordVPN (ghcr.io/bubuntux/nordlynx) for traffic anonymization
- **Reverse Proxy**: Nginx Alpine with SSL termination
- **SSL Management**: Let's Encrypt with Certbot automation
- **Process Management**: PM2-style scheduling with graceful shutdown

## System Architecture Overview

### Core Components

#### 1. Frontend Application (`frontend/`)

- **React SPA**: Single-page application with routing and state management
- **Redux Store**: Centralized state management for media, user sessions, and UI state
- **Component Architecture**: Modular components with hooks-based logic
- **Platform Support**: Web browsers and Samsung Tizen Smart TVs
- **Responsive Design**: Adaptive layouts for various screen sizes

#### 2. Backend API (`backend/`)

- **Hono Framework**: RESTful API with middleware pipeline
- **Service Layer**: Business logic separation with dependency injection
- **Entity Layer**: TypeORM entities for database modeling
- **Route Handlers**: Organized by feature domains (movies, users, sources)
- **Middleware**: Authentication, rate limiting, CORS, error handling

#### 3. Database Layer

- **SQLite Database**: File-based database with ACID transactions
- **TypeORM Integration**: Entity management with migrations
- **Encryption**: Field-level encryption for sensitive data
- **Audit Logging**: Comprehensive activity tracking
- **Caching Layer**: In-memory and persistent caching strategies

#### 4. External Integrations

- **TMDB API**: Movie and TV show metadata retrieval
- **YTS Mirrors**: Torrent source discovery (5 mirror endpoints)
- **Trakt.tv**: Optional user activity synchronization
- **Torrent Trackers**: Distributed torrent file discovery

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

5. **MovieSource**: Torrent source tracking
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

The system implements automated background processing with the following scheduled tasks:

1. **List Refresh** (`refreshLists`)

   - **Interval**: 1 hour (3600 seconds)
   - **Function**: Synchronizes media lists and categories
   - **Service**: `ListSynchronizer.synchronize()`

2. **Movie Synchronization** (`syncMovies`)

   - **Interval**: 1.5 hours (5400 seconds)
   - **Function**: Updates movie metadata from TMDB
   - **Service**: `MediaService.syncMovies()`

3. **Season Completion** (`syncIncompleteSeasons`)

   - **Interval**: 1 second
   - **Function**: Completes partial TV show season data
   - **Service**: `MediaService.syncIncompleteSeasons()`

4. **Movie Source Discovery** (`movieSourceSearch`)

   - **Interval**: 0.1 seconds (100ms)
   - **Function**: Searches for new torrent sources
   - **Service**: `SourceService.searchSourcesForMovies()`

5. **Torrent File Processing** (`dataFileSearch`)

   - **Interval**: 0.2 seconds (200ms)
   - **Function**: Processes and validates torrent files
   - **Service**: `SourceService.searchTorrentFilesForSources()`

6. **Source Statistics Update** (`updateSourcesStats`)

   - **Interval**: 2 seconds
   - **Function**: Updates seeds/peers statistics
   - **Service**: `SourceService.syncStatsForSources()`

7. **Source Resynchronization** (`resyncMovieSources`)
   - **Interval**: 5 seconds
   - **Function**: Revalidates and updates existing sources
   - **Service**: `SourceService.resyncMovieSources()`

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
