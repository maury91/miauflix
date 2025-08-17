# Roo Code Configuration for miauflix

This document provides comprehensive documentation for the Roo Code configuration implemented in the miauflix project. The configuration is designed to optimize development workflows for a media streaming platform with specialized modes, testing patterns, and integration workflows.

## Overview

The Roo Code configuration consists of four main configuration files in the [`.roo/`](.roo/) directory:

- [`config.json`](.roo/config.json) - Core project configuration and rules
- [`modes.json`](.roo/modes.json) - Custom specialized modes for different development tasks
- [`workflows.json`](.roo/workflows.json) - Automated workflows and process orchestration
- [`integrations.json`](.roo/integrations.json) - Integration patterns and dependencies

## Core Configuration (`config.json`)

### Project Structure

The configuration defines miauflix as a **media-streaming-platform** with the following tech stack:

```json
{
  "backend": "TypeScript/Hono/TypeORM",
  "frontend": "React/TypeScript",
  "containerization": "Docker",
  "testing": "Jest/E2E",
  "database": "PostgreSQL"
}
```

### NPM Command Execution Policy

**Critical Rule**: All npm commands must be executed from the root directory to maintain workspace consistency.

```bash
# ✅ Correct - Always from root
npm run test
npm run test:backend:e2e

# ❌ Incorrect - Never navigate to workspaces
cd backend && npm test
```

#### Available Commands

| Command                                        | Description                          | Context | Special Requirements                         |
| ---------------------------------------------- | ------------------------------------ | ------- | -------------------------------------------- |
| [`npm run test`](package.json)                 | Run backend unit tests               | root    | -                                            |
| [`npm run test:backend`](package.json)         | Run backend unit tests               | root    | -                                            |
| [`npm run test:e2e`](package.json)             | Run E2E tests with Docker lifecycle  | root    | Docker management                            |
| [`npm run test:backend:e2e`](package.json)     | Run backend E2E tests only           | root    | Docker management                            |
| [`npm run test:frontend:e2e`](package.json)    | Run frontend E2E tests only          | root    | Docker management                            |
| [`npm run test:backend:e2e:dev`](package.json) | Run E2E tests against running Docker | root    | Requires [`start:backend:e2e`](package.json) |
| [`npm run start:backend:e2e`](package.json)    | Start E2E environment with Docker    | root    | Manages Docker containers                    |
| [`npm run lint:fix`](package.json)             | Fix linting issues                   | root    | -                                            |
| [`npm run check:ts`](package.json)             | Check TypeScript compilation         | root    | -                                            |
| [`npm run build`](package.json)                | Build backend                        | root    | -                                            |
| [`npm run dev`](package.json)                  | Start development servers            | root    | -                                            |

### Docker Compose Workflow Rules

The application runs entirely in Docker with specific workflow constraints:

- **File watching is disabled** in Docker containers
- **No hot reload** support
- **Changes must be verified** through E2E tests
- **Automatic cleanup** of Docker resources
- **Background process tracking** and management

### HTTP-VCR Testing Framework

The project uses HTTP-VCR for testing third-party integrations with a specific workflow:

1. **Write test with real API call** - Initial implementation with live API
2. **Run test to generate fixtures** - Capture HTTP responses automatically
3. **Analyze fixture data structure** - Manual analysis of response patterns
4. **Create data transformers** - Implement content neutralization
5. **Neutralize copyrighted content** - Replace with placeholder data

#### Third-Party Services Integration

| Service      | Type      | Content               | Neutralization Required            |
| ------------ | --------- | --------------------- | ---------------------------------- |
| **YTS**      | Torrents  | Movie torrents        | Movie titles, hashes, magnet links |
| **TheRARBG** | Torrents  | TV and movie torrents | Torrent names, tracker URLs        |
| **TMDB**     | Metadata  | Movie/TV metadata     | Plot summaries, poster URLs        |
| **Trakt**    | User Data | Recommendations       | User data, watch history           |

### Data Neutralization Requirements

All copyrighted content must be neutralized while preserving:

- **Data relationships** between entities
- **Response structure** and format
- **Functional test validity**

### Security Configuration

#### Authentication & Authorization

- **JWT with refresh tokens** - Stateless authentication
- **Audit logging** - All authenticated requests logged
- **Rate limiting** - Sliding window implementation
- **Encryption** - Required for streaming and user data

#### Security Middleware Stack

- [`auth.middleware.ts`](backend/src/middleware/auth.middleware.ts) - JWT authentication
- [`audit-log.middleware.ts`](backend/src/middleware/audit-log.middleware.ts) - Request auditing
- [`rate-limit.middleware.ts`](backend/src/middleware/rate-limit.middleware.ts) - Rate limiting

### Performance Optimization

#### Streaming Architecture

- **Chunk stores** - [`encrypted-chunk-store`](backend/src/chunk-stores/) for efficient streaming and obfuscated media at rest
- **WebTorrent integration** - Progressive download streaming
- **Background processing** - Async content operations
- **Metadata enrichment** - Quality and codec detection

#### Content Directories

The project uses an abstract implementation pattern for content providers:

- **Base**: [`content-directory.abstract.ts`](backend/src/content-directories/content-directory.abstract.ts)
- **YTS**: [`yts.api.ts`](backend/src/content-directories/yts/yts.api.ts), [`yts.types.ts`](backend/src/content-directories/yts/yts.types.ts)
- **TheRARBG**: [`therarbg.api.ts`](backend/src/content-directories/therarbg/therarbg.api.ts), [`therarbg.tracker.ts`](backend/src/content-directories/therarbg/therarbg.tracker.ts)

### TypeScript Configuration

- **Strict mode enabled** - Type safety enforcement
- **Path mapping** - Module resolution optimization
- **Compilation checks** - via [`npm run check:ts`](package.json)

### Development Environment

#### Key Constraints

- **No hot reload** - Changes require Docker restart
- **Docker required** - All development through containers
- **E2E verification** - Changes verified through tests only

## Custom Modes (`modes.json`)

The configuration includes four specialized modes for different development tasks:

### 🔌 Third-Party Integration Mode

**Purpose**: Specialized mode for integrating external APIs with HTTP-VCR testing workflow.

**Capabilities**:

- API integration design and implementation
- HTTP-VCR workflow management
- Fixture generation and analysis
- Data transformer creation
- Content neutralization compliance

**File Access**: Limited to content directories, API utilities, and test fixtures.

**Workflow**:

1. Analyze API documentation
2. Create API client with TypeScript types
3. Write test with real API call
4. Run test to generate fixtures
5. Analyze fixture data structure
6. Create data transformers
7. Implement neutral data patterns
8. Verify integration compliance

### 🎬 Media Streaming Mode

**Purpose**: Content directory and torrent handling features.

**Capabilities**:

- Content directory management
- Torrent integration optimization
- Streaming performance tuning
- Metadata extraction and enrichment
- Quality assessment automation

**Focus Areas**:

- Content source integration
- Streaming performance optimization
- Metadata enrichment workflows
- Quality extraction algorithms
- Chunk store optimization

### 🛡️ Security Reviewer Mode

**Purpose**: Authentication, encryption, and security compliance.

**Capabilities**:

- Authentication flow analysis
- Encryption implementation review
- Security middleware assessment
- Audit logging implementation
- Rate limiting configuration

**Security Standards**:

- **Authentication**: JWT with refresh tokens
- **Encryption**: AES-256-GCM
- **Rate Limiting**: Sliding window
- **Audit Logging**: Comprehensive
- **Data Protection**: GDPR compliant

### 🐳 Docker E2E Mode

**Purpose**: Docker compose testing workflows and container management.

**Capabilities**:

- Docker compose lifecycle management
- E2E test orchestration
- Container health monitoring
- Service integration testing
- Environment consistency validation

**Commands Integration**:

- [`npm run start:backend:e2e`](package.json) - Start E2E environment
- [`npm run test:backend:e2e`](package.json) - Full E2E with lifecycle
- [`npm run test:backend:e2e:dev`](package.json) - Against running environment

### Mode Relationships

The modes work together with defined relationships:

- **Third-Party Integration** complements Security and Docker E2E
- **Media Streaming** provides foundation for Docker E2E
- **Security Reviewer** validates all other modes
- **Docker E2E** tests integrations across all modes

## Automated Workflows (`workflows.json`)

### Third-Party API Integration Workflow

Complete 8-step workflow for adding new external APIs:

1. **API Analysis** - Documentation review and mapping
2. **Types & Client Creation** - TypeScript implementation
3. **Initial Test Writing** - Real API call tests
4. **Fixture Generation** - HTTP-VCR recording
5. **Fixture Analysis** - Content structure examination
6. **Transformer Creation** - Data neutralization logic
7. **Neutralization Implementation** - Production integration
8. **Integration Testing** - E2E validation

### E2E Testing Lifecycle Workflow

5-step Docker compose testing workflow:

1. **Environment Preparation** - Docker validation and cleanup
2. **Service Startup** - Container orchestration
3. **Test Execution** - Integration test runs
4. **Result Analysis** - Performance and coverage reporting
5. **Cleanup** - Resource management and teardown

### Security Compliance Audit Workflow

Comprehensive security validation:

1. **Authentication Audit** - JWT and session security
2. **Encryption Audit** - Algorithm and key management
3. **Rate Limiting Audit** - Policy effectiveness
4. **Audit Logging Review** - Compliance verification
5. **Vulnerability Assessment** - OWASP Top 10 checks
6. **Compliance Validation** - Standards adherence

## Integration Patterns (`integrations.json`)

### HTTP-VCR Integration

**Configuration**:

- **Fixtures**: [`backend/test-fixtures/`](backend/test-fixtures/), [`backend-e2e/docker/`](backend-e2e/docker/)
- **Config**: [`backend/src/__test-utils__/http-vcr.config.ts`](backend/src/__test-utils__/http-vcr.config.ts)
- **Transformers**: [`backend/src/__test-utils__/http-vcr-utils/`](backend/src/__test-utils__/http-vcr-utils/)

**Data Transformation Strategies**:

- **Movie Titles**: English sounding placeholder names
- **Torrent Hashes**: Valid SHA1-compatible dummy hashes
- **Descriptions**: Generic content preserving length/structure
- **Poster URLs**: Placeholder service with preserved dimensions

### External API Patterns

Each external service follows standardized patterns:

**File Structure** (example with YTS):

- API Client: [`yts.api.ts`](backend/src/content-directories/yts/yts.api.ts)
- Type Definitions: [`yts.types.ts`](backend/src/content-directories/yts/yts.types.ts)
- Utilities: [`yts.utils.ts`](backend/src/content-directories/yts/yts.utils.ts)
- Index/Tracker: [`index.ts`](backend/src/content-directories/yts/index.ts)

**Common Utilities**:

- [`api.util.ts`](backend/src/utils/api.util.ts) - Shared API utilities
- [`fetch.util.ts`](backend/src/utils/fetch.util.ts) - HTTP client utilities

### Docker Integration

**Service Architecture**:

- **Backend API**: Health-checked with database dependencies
- **Database**: PostgreSQL with volume persistence
- **Frontend**: Nginx-served with static optimization

**Background Process Management**:

- Container reference tracking
- Continuous health monitoring
- Automatic failure cleanup
- Resource monitoring

### Security Middleware Integration

**Middleware Stack**:

1. **Rate Limiting** - [`rate-limit.middleware.ts`](backend/src/middleware/rate-limit.middleware.ts)
2. **Authentication** - [`auth.middleware.ts`](backend/src/middleware/auth.middleware.ts)
3. **Audit Logging** - [`audit-log.middleware.ts`](backend/src/middleware/audit-log.middleware.ts)

**Authentication Flow**:

- Login → JWT token generation
- Refresh → Token rotation
- Logout → Token invalidation
- Session → Stateless JWT-based

## Best Practices

### Development Workflow

1. **Always use Docker** for development and testing
2. **Execute npm commands from root** directory only
3. **Verify changes through E2E tests** due to no hot reload
4. **Use appropriate specialized modes** for different tasks
5. **Follow HTTP-VCR workflow** for third-party integrations

### Testing Strategy

1. **Unit Tests**: [`npm run test:backend`](package.json) for individual components
2. **Integration Tests**: [`npm run test:e2e`](package.json) for full system
3. **Scoped Integration Tests**:
   - `npm run test:backend:e2e` for backend-only testing
   - `npm run test:frontend:e2e` for frontend-only testing
4. **Development Testing**: [`npm run test:backend:e2e:dev`](package.json) against running environment
5. **Fixture-based Testing**: Use HTTP-VCR for external API tests

### Security Compliance

1. **Neutralize all copyrighted content** in tests and fixtures
2. **Use JWT with refresh tokens** for authentication
3. **Implement comprehensive audit logging** for all operations
4. **Apply rate limiting** to all public endpoints
5. **Follow GDPR compliance** for user data handling

### Content Integration

1. **Extend abstract base class** for new content directories
2. **Implement proper rate limiting** for external APIs
3. **Create comprehensive test fixtures** with neutralized data
4. **Use background processing** for streaming optimization
5. **Implement quality extraction** for content assessment

## Troubleshooting

### Common Issues

**Docker Environment**:

- If containers fail to start, run [`npm run docker:cleanup`](package.json)
- Check Docker compose file validity before starting E2E tests
- Ensure sufficient system resources for container orchestration

**Testing Issues**:

- HTTP-VCR fixtures not recording: Verify real API connectivity in development
- E2E tests failing: Ensure all services are healthy before test execution
- Transformed data issues: Check neutralization logic in transformers

**Performance Issues**:

- Slow streaming: Verify chunk store configuration and background processing
- High memory usage: Check Docker resource limits and cleanup processes
- API rate limiting: Implement proper throttling in client implementations

### Configuration Validation

1. **TypeScript Compilation**: [`npm run check:ts`](package.json)
2. **Linting**: [`npm run lint:fix`](package.json)
3. **Docker Health**: Service-specific health check endpoints
4. **Security Audit**: Use security-audit mode for compliance verification

This configuration enables efficient, secure, and compliant development of the miauflix media streaming platform while maintaining proper separation of concerns and automated workflow management.
