# Miauflix Backend

## Documentation Hub

### 📖 Essential Docs

| File                                                     | Purpose                      |
| -------------------------------------------------------- | ---------------------------- |
| [architecture.md](../docs/architecture.md)               | Technical stack snapshot     |
| [directory-structure.md](../docs/directory-structure.md) | Directory tree               |
| [coding-conventions.md](../docs/coding-conventions.md)   | Code style guide             |
| [run-and-debug.md](../docs/run-and-debug.md)             | Commands & environment setup |

### 🔄 Development Workflow

| File                                                   | Purpose                                      |
| ------------------------------------------------------ | -------------------------------------------- |
| [workflow.md](../docs/workflow.md)                     | Adaptive development loop for Copilot        |
| [request-life-cycle.md](../docs/request-life-cycle.md) | Client→Hono→WebTorrent diagram               |
| [extension-recipes.md](../docs/extension-recipes.md)   | Add route / tracker / encrypted field guides |
| [task-file-mapping.md](../docs/task-file-mapping.md)   | Roadmap tags ↔ source files                 |

### 🔧 System-Specific

| File                                                | Purpose                                  |
| --------------------------------------------------- | ---------------------------------------- |
| [authentication.md](docs/authentication.md)         | Authentication system details            |
| [security.md](docs/security.md)                     | Security features & VPN detection        |
| [media-services.md](docs/media-services.md)         | TMDB, Trakt.tv, YTS integration          |
| [streaming-services.md](docs/streaming-services.md) | WebTorrent streaming                     |
| [configuration.md](docs/configuration.md)           | Environment variables                    |
| [security-logging.md](docs/security-logging.md)     | Security logging system and audit trails |

## Implementation Plan

### Core Features

#### Authentication & Authorization

- [x] Admin-only user creation
- [x] JWT-based authentication
- [x] Refresh token rotation
- [x] Role-based access control (USER, ADMIN)
- [x] Password hashing with bcrypt
- [x] Token expiration management
- [ ] Admin-only password reset functionality
- [ ] Email verification

#### User Management

- [x] User CRUD operations
- [x] User roles and permissions
- [ ] User profile management
- [ ] User preferences
- [ ] User activity tracking
- [ ] Account deletion

#### Media information providers integration

- [x] Media Provider Integration
  - [x] TMDb movie synchronization
    - [x] Synchronization on request
    - [x] Periodical synchronization
    - [x] Comprehensive metadata handling
  - [x] TMDb TV show synchronization
    - [x] Synchronization on request
    - [x] Periodical synchronization
    - [x] Season and episode synchronization
  - [x] Trakt.tv API client setup
  - [ ] Trakt.tv list synchronization (partial implementation)
  - [x] Media metadata handling
  - [x] Genre categorization
- [x] Localization Support
  - [x] Multi-language content retrieval
  - [x] Language preference handling
  - [x] Fallback language mechanism
  - [ ] User language preference
  - [ ] Content translation management
- [x] Content Discovery
  - [x] List-based content organization
  - [ ] List synchronization with Trakt.tv
  - [x] List synchronization with TMDB
  - [x] Search functionality (basic implementation)
  - [ ] Recommendations engine
  - [ ] Trending content
  - [ ] New releases
  - [ ] Popular content
  - [ ] List sharing
  - [ ] List collaboration
  - [ ] List templates
  - [ ] List analytics
- [ ] Media Interaction
  - [ ] Ratings system
  - [ ] Watchlist functionality
  - [ ] Watch history tracking
  - [ ] Favorites/bookmarks

#### Media content discovery

- [x] YTS Tracker Integration
  - [x] Result caching
  - [x] Rate limiting
  - [x] API integration for content discovery
  - [x] Magnet link extraction
  - [x] Metadata extraction using webtorrent
  - [x] Content analysis and categorization
  - [x] Quality filtering and sorting
  - [x] Content availability tracking
- [ ] Rarbg Integration
  - [ ] Result caching
  - [ ] Rate limiting
  - [ ] API integration for content discovery
  - [ ] Magnet link extraction
  - [ ] Metadata extraction using webtorrent
  - [ ] Content analysis and categorization
  - [ ] Quality filtering and sorting
  - [ ] Content availability tracking

#### Media streaming

- [x] WebTorrent Integration
  - [x] Magnet to torrent conversion
  - [x] Torrent metadata parsing
  - [x] Basic streaming capabilities
  - [ ] Authentication integration for streaming
  - [ ] User-specific streaming sessions
  - [ ] Bandwidth management
  - [ ] Pause/resume functionality
  - [ ] Seeking support
  - [ ] Error recovery mechanisms
- [ ] Custom Webtorrent Server
  - [ ] Authentication integration
  - [ ] User-specific streaming sessions
  - [ ] Bandwidth management
  - [ ] Pause/resume functionality
  - [ ] Seeking support
  - [ ] Error recovery mechanisms

#### Configuration Management

- [x] Assisted Configuration
  - [x] Environment variable validation
  - [x] Configuration schema definition
  - [x] Default value provision
  - [x] Configuration error reporting
  - [x] Interactive configuration prompts
  - [x] Service-specific configuration
  - [x] Configuration testing
  - [x] .env file generation
  - [x] Command line configuration flags (`--config`, `--only-config`)
  - [ ] Trigger configuration for optional variables
  - [ ] Configuration UI for administrators
  - [ ] Configuration versioning
  - [ ] Configuration backup and restore

#### API Features

- [x] Basic route structure
- [x] Authentication middleware
- [x] Role-based middleware
- [x] Rate limiting
- [ ] API documentation (Swagger/OpenAPI)
- [ ] API versioning
- [ ] Error handling middleware
- [ ] Request validation
- [ ] Response caching

#### Database & Infrastructure

- [x] SQLite database setup
- [x] TypeORM integration
- [x] Repository pattern implementation
- [x] Database migrations
- [x] Database backup system (basic)
- [x] Connection pooling
- [ ] Query optimization
- [ ] Database indexing

#### Security

- [x] JWT security
- [x] Password hashing
- [x] Role-based access control
- [x] Input sanitization
- [x] CORS configuration
- [x] Rate limiting
- [x] Security logging
- [x] VPN detection (NordVPN)
- [x] Audit logging system
- [ ] VPN failsafe
- [ ] Vulnerability scanning
- [ ] DDoS protection

#### Testing

- [ ] Unit tests
- [ ] Integration tests
- [ ] API tests
- [ ] Authentication tests
- [ ] Performance tests
- [ ] Security tests
- [ ] Load testing
- [ ] Test coverage reporting

#### Monitoring & Logging

- [x] Application logging
- [x] Error tracking
- [x] Security event logging
- [x] User activity logging
- [x] Audit trail system
- [ ] Performance monitoring
- [ ] System health checks
- [ ] Alert system

#### Documentation

- [x] Basic README
- [x] Security documentation
- [x] Configuration documentation
- [x] Security logging documentation
- [ ] API documentation
- [ ] Setup instructions
- [ ] Deployment guide
- [ ] Contributing guidelines
- [ ] Code style guide

## Current Implementation Status

### ✅ Fully Implemented Features

1. **Authentication & Security**

   - Complete JWT-based authentication system
   - Role-based access control (USER, ADMIN)
   - Refresh token rotation
   - Comprehensive audit logging
   - VPN detection (NordVPN)
   - Rate limiting and security middleware

2. **TMDB Integration**

   - Complete movie synchronization
   - TV show, season, and episode synchronization
   - Multi-language support with fallbacks
   - Genre management and categorization
   - List synchronization and management

3. **Content Discovery**

   - YTS tracker integration with full functionality
   - WebTorrent magnet conversion
   - Torrent metadata parsing
   - Quality filtering and content categorization

4. **Infrastructure**
   - SQLite database with TypeORM
   - Repository pattern implementation
   - Configuration management system
   - Comprehensive logging system

### 🚧 Partially Implemented Features

1. **Trakt.tv Integration**

   - API client setup complete
   - OAuth2 configuration ready
   - List synchronization pending

2. **Streaming Services**
   - Basic WebTorrent integration
   - Magnet to torrent conversion
   - Full streaming server pending

### 📋 Next Priority Features

1. **Complete Trakt.tv Integration**

   - Implement list synchronization
   - Add watch history tracking
   - User ratings integration

2. **Enhanced Streaming**

   - Custom WebTorrent streaming server
   - User session management
   - Bandwidth optimization

3. **Testing & Documentation**
   - Comprehensive test suite
   - API documentation (Swagger/OpenAPI)
   - Performance optimization

## Getting Started

### Prerequisites

- Node.js 18+ or Bun runtime
- SQLite database
- TMDB API key
- Optional: Trakt.tv API credentials

### Environment Setup

1. Copy `.env.example` to `.env`
2. Configure required environment variables
3. Run database migrations
4. Start the development server

```bash
# Install dependencies
npm install

# Setup database
npm run migration:run

# Start development server
npm run dev
```
