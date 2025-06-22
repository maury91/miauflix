# MiauFlix GitHub Copilot Instructions

## 🏗️ Architecture Principles

- Use **Hono framework** for all API endpoints
- Follow **TypeORM** patterns for database operations
- Implement **repository pattern** for data access layer
- Use **dependency injection** in services
- Follow **clean architecture** with clear separation of concerns

## 🎯 Development Standards

### TypeScript Requirements

- Always use **strict TypeScript** with proper typing
- Prefer `interfaces` over `types` for object shapes
- Use discriminated unions for variant types
- Include explicit return types for public methods
- Avoid `any` types - use `unknown` or proper typing

### Code Organization

```
backend/src/
├── routes/        # Hono route handlers
├── services/      # Business logic
├── repositories/  # Data access layer
├── entities/      # TypeORM entities
├── middleware/    # Auth, rate-limit, audit
├── trackers/      # Torrent providers
└── utils/         # Helper functions
```

### Error Handling

- Use custom error classes from `src/errors/`
- Include context in error messages
- Implement proper HTTP status codes
- Log errors with appropriate severity

## 🧪 Testing Strategy

### HTTP VCR Recording Pattern

- Use **http-vcr** for recording external API responses
- First test run hits real external dependencies (TMDB, torrent trackers)
- Responses are automatically recorded for subsequent test runs
- **Prefer transformers** over manual adjustment of recorded responses
- It's acceptable to not transform on first run to inspect real data
- VCR is used in **both unit tests and e2e tests**

### Unit Tests

- Write tests for all service methods
- Use http-vcr for external API calls
- Use descriptive test names
- Aim for 90%+ coverage on business logic

### E2E Tests

- Test complete API flows using http-vcr
- Use test fixtures from `backend/test-fixtures/`
- Include authentication scenarios

### Test Commands

```bash
npm run test:backend                    # Unit tests
npm run test:backend:e2e               # Full e2e suite (manages docker lifecycle)

# For iterative development:
npm run start:backend:e2e &            # Start docker composer in background
npm run test:backend:e2e:dev           # Run e2e tests (no docker management)
# Kill background process when done
```

**Testing Workflow**:

- **Single run**: Use `npm run test:backend:e2e` (handles docker up → test → down)
- **Multiple iterations**:
  1. Start server in background: `npm run start:backend:e2e &`
  2. Run tests repeatedly: `npm run test:backend:e2e:dev`
  3. Kill background process when finished

## 🔐 Security Standards

- Always validate input parameters
- Use JWT tokens for authentication
- Implement rate limiting on public endpoints
- Encrypt sensitive database fields
- Use parameterized queries to prevent SQL injection

## 🌐 API Development

- Follow RESTful conventions
- Include proper request/response types
- Apply `authGuard` middleware for protected routes
- Implement comprehensive error responses
- Use consistent response formats

## 🎬 Domain-Specific Patterns

### Movie Sources

- Use `source.service.ts` for source management
- Implement torrent tracker integrations in `trackers/`
- Handle magnet links with `magnet.service.ts`
- Use `movie-source.entity.ts` for persistence

### Authentication

- JWT implementation in `auth.service.ts`
- Refresh token rotation
- Role-based access control
- Session management

### Background Tasks

- Use scheduler service for background jobs
- Implement proper task queuing
- Handle task failures gracefully
- Log task execution

## 📝 Documentation Requirements

- Update relevant docs in `/docs/` for user-facing changes
- Include JSDoc comments for public APIs
- Update API documentation for new endpoints
- Add entries to CHANGELOG.md for significant changes

## 🔄 Development Workflow

1. Implement feature in `backend/src/`
2. Choose testing route: unit-only, e2e-only, or hybrid
3. Set up http-vcr recordings for external API calls
4. Use transformers for recorded responses when needed
5. Update documentation if needed
6. Add changelog entry

## 🚫 Avoid These Patterns

- Console.log in production code
- Hardcoded values (use environment variables)
- Direct database queries (use repositories)
- Blocking operations without proper async handling
- Missing input validation
- Incomplete error handling
- Manual mocking of external APIs (use http-vcr instead)

## 🎯 File Location Mapping

| Feature        | Primary Files                                             |
| -------------- | --------------------------------------------------------- |
| Authentication | `auth.service.ts`, `auth.routes.ts`, `auth.middleware.ts` |
| Movie Sources  | `source.service.ts`, `tracker.service.ts`, `trackers/`    |
| Streaming      | `webtorrent.service.ts`, `magnet.service.ts`              |
| User Lists     | `list.service.ts`, `trakt.service.ts`                     |
| Configuration  | `configuration.ts` (interactive setup)                    |

## 🎥 HTTP VCR Best Practices

- Let first test run hit real APIs to capture authentic responses
- Review recorded responses before committing
- Create transformers to sanitize sensitive data or normalize responses
- Use descriptive cassette names that reflect the test scenario
- Commit VCR cassettes to ensure consistent test behavior across environments
