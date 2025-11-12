# Development Workflow Guide

This guide covers the development workflow, coding conventions, and best practices for contributing to Miauflix.

## Project Structure

Miauflix uses an npm workspace monorepo structure:

```text
miauflix/
├── backend/                     # Node.js TypeScript backend
│   ├── src/
│   │   ├── services/           # Business logic services
│   │   ├── routes/             # HTTP route handlers
│   │   ├── entities/           # TypeORM database entities
│   │   ├── repositories/       # Data access layer
│   │   ├── middleware/         # HTTP middleware
│   │   └── utils/              # Utility functions
│   └── docs/                   # Backend-specific documentation
├── frontend/                   # React application
├── packages/                   # Shared libraries
│   ├── backend-client/         # Generated API client
│   └── source-metadata-extractor/ # Content metadata processing
└── docs/                       # Project documentation
```

## Development Setup

### Prerequisites

- Node.js 22 or later
- Docker and Docker Compose (for full stack testing)
- Git

### Initial Setup

```bash
# Clone repository
git clone <repository-url>
cd miauflix

# Install all dependencies (uses workspaces)
npm install

# Run configuration wizard
npm run config

# Start development environment
npm run dev
```

## Workspace Management

**CRITICAL**: Always use workspace commands from the root directory:

```bash
# ✅ CORRECT - Install dependencies from root
npm install --workspace backend package-name
npm install --workspace frontend package-name

# ❌ WRONG - Will break workspace resolution
cd backend && npm install package-name
```

## Development Commands

### Backend Development

```bash
# Start backend with configuration wizard
npm run start:backend

# Backend development with mock data
npm run start:backend:e2e

# Backend tests
npm run test:backend
npm run test:backend:e2e
```

### Frontend Development

```bash
# Start with hot reload (recommended for development)
npm run start:frontend

# SSR testing (for production-like behavior)
npm run dev:ssr -w frontend

# Frontend tests
npm run test:frontend
npm run test:frontend:e2e
npm run test:frontend:visual
```

### Full-stack Development

```bash
# Start both backend and frontend
npm run dev

# Run all tests
npm test

# Build everything
npm run build
```

## Coding Conventions

### Import Style

Use path aliases to avoid deep relative imports:

```typescript
// ✅ GOOD - Use aliases
import { UserEntity } from '@entities/user.entity';
import { AuthService } from '@services/auth/auth.service';

// ❌ BAD - Deep relative paths
import { UserEntity } from '../../../entities/user.entity';
```

### Backend Path Aliases

- `@entities/*` - `src/entities/*` - Database entities
- `@services/*` - `src/services/*` - Business logic services
- `@repositories/*` - `src/repositories/*` - Data access layer
- `@routes/*` - `src/routes/*` - HTTP route handlers
- `@middleware/*` - `src/middleware/*` - HTTP middleware
- `@utils/*` - `src/utils/*` - Utility functions
- `@database` - `src/database` - Database configuration
- `@database/*` - `src/database/*` - Database configuration
- `@mytypes/*` - `src/types/*` - TypeScript type definitions
- `@errors/*` - `src/errors/*` - Error classes
- `@dto/*` - `src/dto/*` - Data transfer objects
- `@content-directories/*` - `src/content-directories/*` - Content directory handling
- `@logger` - `src/logger` - Logger configuration
- `@constants` - `src/constants` - Application constants
- `@__test-utils__/*` - `src/__test-utils__/*` - Test utility functions

### Frontend Path Aliases

**Vite Config Aliases (for bundling):**

- `@` - `./src` - Source root directory
- `@components` - `./src/app/components` - React components
- `@pages` - `./src/app/pages` - Page components
- `@store` - `./src/store` - Redux store and slices
- `@types` - `./src/types` - TypeScript type definitions
- `@utils` - `./src/utils` - Utility functions
- `@hooks` - `./src/app/hooks` - React hooks
- `@consts` - `./src/consts` - Application constants

**TypeScript Config Aliases (for type checking):**

- `@/*` - `./src/*` - Source root directory (includes subdirectories)
- `@components/*` - `./src/app/components/*` - React components
- `@pages/*` - `./src/app/pages/*` - Page components
- `@store/*` - `./src/store/*` - Redux store and slices
- `@types/*` - `./src/types/*` - TypeScript type definitions
- `@utils/*` - `./src/utils/*` - Utility functions
- `@hooks/*` - `./src/app/hooks/*` - React hooks
- `@consts/*` - `./src/consts/*` - Application constants
- `@miauflix/types` - `./src/types/api` - API type definitions

**Note**: Frontend Jest tests include `moduleNameMapper` for `^@/(.*)$` → `./src/$1` and `^~icons/(.*)$` → icon mocks. Add any other needed aliases to `frontend/jest.config.ts`.

### TypeScript Standards

- Always use explicit types for function parameters
- Prefer interfaces over type aliases for object shapes
- Use strict TypeScript settings
- Document complex types and interfaces

```typescript
// ✅ GOOD
interface MovieSearchParams {
  query: string;
  page?: number;
  includeAdult?: boolean;
}

async function searchMovies(params: MovieSearchParams): Promise<Movie[]> {
  // Implementation
}

// ❌ BAD
function searchMovies(query, page, includeAdult) {
  // Implementation
}
```

### Error Handling

Use the custom error classes and consistent error patterns:

```typescript
import { ValidationError, NotFoundError } from '@errors/index';

// ✅ GOOD - Specific error types
if (!movie) {
  throw new NotFoundError('Movie not found');
}

if (!isValidId(movieId)) {
  throw new ValidationError('Invalid movie ID format');
}
```

## Testing Guidelines

### Test Structure

Use the isolation pattern for consistent test setup:

```typescript
// ✅ GOOD - Test isolation pattern
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

### Mock Placement

```typescript
// ✅ CORRECT - Mocks at file top before imports
jest.mock('@services/download/download.service');
jest.mock('@repositories/movie.repository');

import { DownloadService } from '@services/download/download.service';

describe('Service', () => {
  // Tests here
});
```

### Timer and Faker Setup

```typescript
beforeAll(() => {
  configureFakerSeed(); // Required for reproducible tests
});

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers(); // Clean up timers
});
```

### Test Constraints

- **Never make real API calls** - Use HTTP-VCR fixtures
- **Test in isolation** - Avoid shared state between tests
- **Use deterministic data** - Configure faker seed
- **Mock external dependencies** - Don't rely on external services

## Git Workflow

### Branch Naming

- `feature/description` - New features
- `fix/description` - Bug fixes
- `docs/description` - Documentation updates
- `refactor/description` - Code refactoring

### Commit Messages

Follow conventional commit format:

```bash
feat: add streaming quality selection
fix: resolve authentication token expiry
docs: update API documentation
refactor: simplify database connection logic
```

### Pre-commit Hooks

The project uses Husky for pre-commit hooks:

- **Prettier** - Code formatting
- **ESLint** - Code linting (backend only)
- **Type checking** - TypeScript validation

## Code Quality

### Linting and Formatting

```bash
# Format all code
npm run format

# Check formatting without changes
npm run format:check

# Lint backend code
npm run lint

# Fix linting issues automatically
npm run lint:fix

# TypeScript type checking
npm run check:ts
```

### Build Validation

Always ensure builds pass before committing:

```bash
# Build everything
npm run build

# Check TypeScript types
npm run check:ts
```

## Performance Guidelines

### Database Queries

- Use proper indexing for frequently queried fields
- Implement pagination for large datasets
- Use TypeORM query builder for complex queries
- Cache frequently accessed data

### API Design

- Implement proper rate limiting
- Use appropriate HTTP status codes
- Include pagination metadata
- Validate input parameters

### Frontend Performance

- Use React.memo for expensive components
- Implement proper state management with Redux Toolkit
- Use lazy loading for routes and components
- Optimize bundle size with code splitting

## Security Practices

### Authentication

**Three-Tier Authentication System:**

- **API Endpoints**: Use JWT tokens in `Authorization: Bearer` headers (most endpoints)
- **Token Refresh**: HttpOnly cookies used only for `/api/auth/refresh/:session` endpoint
- **Streaming Access**: Non-JWT streaming keys for `/api/stream/:token` endpoint

**Security Measures:**

- Implement proper CSRF protection
- Validate all user inputs
- Use secure password hashing (bcrypt)

### Data Protection

- Encrypt sensitive data at rest (AES-256-GCM)
- Use HTTPS in production
- Implement audit logging for security events
- Follow principle of least privilege

## Debugging

### Backend Debugging

```bash
# Start with debug logging
DEBUG=* npm run start:backend

# Debug specific modules
DEBUG=miauflix:auth npm run start:backend
```

### Frontend Debugging

- Use React Developer Tools browser extension
- Enable Redux DevTools for state inspection
- Use browser network tab for API debugging

### Docker Debugging

```bash
# View container logs
docker compose logs -f backend

# Execute commands in containers
docker compose exec backend bash

# Check container health
docker compose ps
```

## Common Pitfalls to Avoid

### Development

- **Don't install dependencies in workspace directories** - Always use workspace commands
- **Don't make real API calls in tests** - Use fixtures only
- **Don't put jest.mock() in describe blocks** - Must be at file top
- **Don't assume features need rebuilding** - Most systems are complete

### Production

- **Don't commit sensitive data** - Use environment variables
- **Don't expose debug information** - Remove debug logging in production
- **Don't skip database migrations** - Always run migrations in order

## Contributing

1. Fork the repository
2. Create a feature branch from `main`
3. Make your changes following the conventions above
4. Ensure all tests pass: `npm test`
5. Ensure builds pass: `npm run build`
6. Create a pull request with a clear description

### Pull Request Guidelines

- Include a clear description of changes
- Reference any related issues
- Ensure CI passes
- Request review from maintainers
- Update documentation as needed

This workflow ensures consistent, high-quality contributions to the Miauflix codebase.
