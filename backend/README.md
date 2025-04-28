# Miauflix Backend

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
- [ ] Media Provider Integration
  - [x] TMDb movie synchronization
    - [x] Synchronization on request
    - [x] Periodical synchronization
  - [ ] TMDb TV show synchronization
    - [x] Synchronization on request
    - [x] Periodical synchronization
    - [ ] Season and episode synchronization
  - [ ] Trakt.tv list synchronization
  - [ ] Media metadata handling
  - [x] Genre categorization
- [ ] Localization Support
  - [x] Multi-language content retrieval
  - [x] Language preference handling
  - [x] Fallback language mechanism
  - [ ] User language preference
  - [ ] Content translation management
- [ ] Content Discovery
  - [x] List-based content organization
  - [ ] List synchronization with Trakt.tv
  - [x] List synchronization with TMDB
  - [ ] Search functionality
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
- [ ] Database migrations
- [ ] Database backup system
- [ ] Connection pooling
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
- [x] VPN detection
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
- [ ] Performance monitoring
- [x] User activity logging
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

## Documentation

For detailed documentation about specific features, please refer to the following files:

- [Security System](docs/security.md) - Details about the authentication system, security features, and best practices
- [Assisted Configuration](docs/configuration.md) - Information about the configuration system and environment variable management
- [Security Logging](docs/security-logging.md) - Comprehensive guide to the security logging system and audit trails
