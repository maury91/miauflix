# AI Development Guide

This guide consolidates patterns, workflows, and best practices for AI assistants working on the Miauflix codebase.

## Essential Context

### Production-Ready Status

The Miauflix platform is **100% complete and production-ready**:

- ✅ **Backend**: All services implemented and functional
- ✅ **Frontend**: Complete with three-tier authentication (JWT for APIs, HttpOnly cookies for refresh, streaming keys for video)
- ✅ **Streaming**: WebTorrent infrastructure fully operational
- ✅ **Integration**: Frontend-backend integration complete

### What This Means for AI Development

**DO** ✅:

- Add new features and enhancements
- Optimize performance and user experience
- Fix bugs and improve existing functionality
- Extend functionality with additional sources

**DON'T** ❌:

- Rebuild authentication (complete with JWT + refresh token system)
- Rebuild streaming infrastructure (WebTorrent fully implemented)
- Recreate database entities (13 entities already exist)
- Rebuild background processing (7 tasks already running)

## Development Patterns

### Workspace Management Pattern

**CRITICAL**: Always use workspace commands from the root:

```bash
# ✅ CORRECT
npm install --workspace backend package-name
npm install --workspace frontend package-name

# ❌ WRONG - Breaks dependency resolution
cd backend && npm install package-name
```

### Testing Patterns

#### Test Isolation Pattern

```typescript
const setupTest = () => {
  const mockRepository = new Repository({} as never) as jest.Mocked<Repository>;
  const service = new Service(mockRepository);
  return { service, mockRepository };
};

describe('Service', () => {
  it('should work', async () => {
    const { service, mockRepository } = setupTest();
    // Test implementation
  });
});
```

#### Mock Placement Pattern

```typescript
// ✅ CORRECT - At file top before imports
jest.mock('@services/download/download.service');
jest.mock('@repositories/movie.repository');

import { DownloadService } from '@services/download/download.service';

describe('Service', () => {
  // Tests here
});
```

#### Timer and Faker Pattern

```typescript
beforeAll(() => {
  configureFakerSeed(); // Required for reproducible tests
});

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});
```

### Import Conventions

Use path aliases consistently:

```typescript
// ✅ GOOD - Use aliases
import { UserEntity } from '@entities/user.entity';
import { AuthService } from '@services/auth/auth.service';

// ❌ BAD - Deep relative paths
import { UserEntity } from '../../../entities/user.entity';
```

See “Backend Path Aliases” and “Frontend Path Aliases” in [docs/development/workflow.md](../development/workflow.md) for the authoritative, toolchain-aligned lists (TS, Vite, Jest).

### Error Handling Pattern

All errors use the centralized `AppError` base class from `@errors/base.error`. Each domain has its own error class in `backend/src/errors/`. Errors carry a `type` (domain) and `code` (specific condition) for programmatic identification.

```typescript
// ✅ GOOD - Import the right domain error class
import { RepositoryError } from '@errors/repository.errors';
import { ApiError } from '@errors/api.errors';
import { MediaError } from '@errors/media.errors';

// Repository not-found
if (!movie) {
  throw new RepositoryError('Movie not found', 'not_found');
}

// External API failure
if (!response.ok) {
  throw new ApiError(`API error: ${response.status}`, 'http_error', 'myservice', response.status);
}

// Media domain
if (!LISTS[slug]) {
  throw new MediaError(`List with slug ${slug} not found`, 'list_not_found');
}

// ❌ BAD - Generic errors lose type information
throw new Error('Something went wrong');
```

**Available error domains** — see `backend/docs/errors.md` for the full reference:

| Import                      | Domain       | Example codes                                |
| --------------------------- | ------------ | -------------------------------------------- |
| `@errors/auth.errors`       | `auth`       | `user_already_exists`, `invalid_token`       |
| `@errors/repository.errors` | `repository` | `not_found`, `create_failed`, `duplicate`    |
| `@errors/encryption.errors` | `encryption` | `key_required`, `decrypt_failed`             |
| `@errors/api.errors`        | `api`        | `http_error`, `not_configured`, `timeout`    |
| `@errors/media.errors`      | `media`      | `list_not_found`, `genre_not_found`          |
| `@errors/vpn.errors`        | `vpn`        | `http_error`, `invalid_ip`                   |
| `@errors/request.errors`    | `request`    | `not_configured`, `no_solution`              |
| `@errors/source.errors`     | `source`     | `invalid_response_body`, `service_not_found` |
| `@errors/scheduler.errors`  | `scheduler`  | `already_scheduled`, `not_scheduled`         |
| `@errors/catalog.errors`    | `catalog`    | `user_not_found`                             |

## File Mapping for Common Tasks

### Adding New API Endpoints

```
backend/src/routes/           # Route definitions
backend/src/services/         # Business logic
backend/src/middleware/       # Request/response middleware
```

### Frontend Components

```
frontend/src/app/components/  # Reusable UI components
frontend/src/app/pages/      # Page-level components
frontend/src/store/          # Redux state management
```

### Database Changes

```
backend/src/entities/        # TypeORM entities
backend/src/repositories/    # Data access layer
backend/src/database/        # Database configuration
```

### Background Tasks

```
backend/src/services/scheduler/  # Task scheduling
backend/src/services/source/     # Content discovery
backend/src/services/media/      # Metadata processing
```

## Development Workflows

### Feature Development Workflow

1. **Analyze existing code** - Understand current implementation
2. **Plan changes** - Identify files that need modification
3. **Implement incrementally** - Make small, testable changes
4. **Test thoroughly** - Unit tests, E2E tests, and manual testing
5. **Update documentation** - Keep docs in sync with changes

### Bug Fix Workflow

1. **Reproduce the issue** - Create a failing test case
2. **Identify root cause** - Debug through the call stack
3. **Implement minimal fix** - Change only what's necessary
4. **Verify fix** - Ensure test passes and no regressions
5. **Add regression test** - Prevent future occurrences

### Testing Workflow

```bash
# Backend testing
npm run test:backend               # Unit tests
npm run test:backend:e2e           # E2E tests with Docker

# Frontend testing
npm run test:frontend              # Unit tests
npm run test:frontend:e2e          # E2E tests with backend integration
npm run test:frontend:visual       # Visual regression tests

# Full test suite
npm test
```

### Code Quality Workflow

```bash
# Format code
npm run format

# Lint code
npm run lint
npm run lint:fix

# Type check
npm run check:ts

# Build verification
npm run build
```

## Critical Constraints

### Testing Constraints

- **Never make real API calls** in tests - Use HTTP-VCR fixtures
- **Tests must be deterministic** - Configure faker seed
- **Use test isolation** - Avoid shared state between tests
- **Mock external dependencies** - Don't rely on external services

### Development Constraints

- **Don't make real API calls during development** - Use mock data
- **Database uses synchronize: true** - Entity changes immediately affect schema
- **Background tasks are always running** - Be aware of active processes
- **Frontend-backend integration is complete** - Don't duplicate auth work

### Production Constraints

- **All services are production-ready** - Don't rebuild existing infrastructure
- **Authentication uses three systems** - JWT for API access, HttpOnly cookies for refresh only, streaming keys for video
- **Streaming endpoint is functional** - `/api/stream/:token` is complete
- **Database has field-level encryption** - Sensitive data is protected

## Common Gotchas

### Dependency Management

```bash
# ❌ NEVER install in workspace directories
cd backend && npm install package-name

# ✅ ALWAYS use workspace flag from root
npm install --workspace backend package-name
```

### Mock Placement

```typescript
// ❌ WRONG - Mock in describe block
describe('Service', () => {
  jest.mock('@services/auth'); // Won't work
});

// ✅ CORRECT - Mock at file top
jest.mock('@services/auth');
describe('Service', () => {
  // Tests here
});
```

### Shared Test State

```typescript
// ❌ WRONG - Shared service instance
describe('Service', () => {
  let service: Service; // Shared state causes race conditions

// ✅ CORRECT - Test isolation
describe('Service', () => {
  const setupTest = () => {
    return new Service(mockRepository);
  };
```

## Development Environment Setup

### Environment Variables

```bash
# Required
TMDB_API_ACCESS_TOKEN=your_tmdb_token
TMDB_API_URL=https://api.themoviedb.org/3

# Optional
TRAKT_CLIENT_ID=your_trakt_client_id
TRAKT_API_URL=https://api.trakt.tv
NORDVPN_PRIVATE_KEY=your_nordvpn_private_key

# Development
NODE_ENV=development
LOG_LEVEL=debug
```

### Development Commands

```bash
# Configuration wizard
npm run config

# Start development environment
npm run dev                          # Backend + Frontend
npm run start:backend               # Backend only
npm run start:frontend              # Frontend with hot reload

# Testing environments
npm run start:backend:e2e           # Backend with mock data
npm run test:e2e                    # Full E2E test environment
```

## Debugging Strategies

### Backend Debugging

```bash
# Debug logging
DEBUG=* npm run start:backend

# Specific modules
DEBUG=miauflix:auth npm run start:backend

# Database queries
DEBUG=typeorm npm run start:backend
```

### Frontend Debugging

- Use React Developer Tools
- Enable Redux DevTools
- Check browser network tab for API calls
- Use browser console for runtime errors

### Integration Debugging

```bash
# Check backend health
curl http://localhost:3001/health

# Test authentication
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password"}'
```

## Performance Optimization

### Backend Performance

- Use database query optimization
- Implement proper caching strategies
- Monitor background task performance
- Optimize API response times

### Frontend Performance

- Use React.memo for expensive components
- Implement proper state management
- Use lazy loading for routes
- Optimize bundle size with code splitting

## Security Considerations

### Authentication Security

**Three-Tier Authentication System:**

- **Primary API Auth**: JWT tokens in Authorization headers (15min expiration)
- **Token Refresh Only**: HttpOnly cookies exclusively for `/api/auth/refresh/:session`
- **Streaming Access**: Non-JWT streaming keys for `/api/stream/:token`

**Security Measures:**

- Implement proper CSRF protection
- Validate all user inputs
- Use secure password hashing

### Data Security

- Encrypt sensitive data at rest
- Use HTTPS in production
- Implement audit logging
- Follow principle of least privilege

This guide provides the essential patterns and workflows for effective AI assistance on the Miauflix codebase while avoiding common pitfalls and maintaining the high quality of the existing implementation.
