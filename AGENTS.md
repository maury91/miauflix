# 🤖 AI Agent Guide for Miauflix

> **Purpose**: Comprehensive reference for AI assistants working on the Miauflix codebase. This document consolidates critical information, constraints, and patterns to help agents work effectively without breaking things.

## 📋 Quick Start Checklist

**Before making ANY changes, do these in order:**

1. ✅ Read `docs/ai/context.md` - Current project status for AI assistants
2. ✅ Check `docs/ai/gotchas.md` - Critical constraints that will break things
3. ✅ Verify implementation status - Don't assume incomplete means incomplete
4. ✅ Understand workspace structure - This is an npm workspace monorepo

## 🎯 Project Reality Check

Use [current project context](docs/ai/context.md), the [feature guide](docs/features.md), and [ToDo.md](ToDo.md) for implemented capabilities and planned work. Verify them against the code before editing. Do not infer completion percentages, delivery dates, passing builds, or deployment readiness from a status summary.

Authentication is integrated in the browser and TV app. Catalog data, source discovery, streaming, subtitles, progress, ratings, notifications, and storage management already have implementations. Extend the existing owners rather than rebuilding these systems. Account/profile UI improvements and other remaining tasks are listed separately in the backlog.

---

## 🚨 CRITICAL CONSTRAINTS (Will Break System)

### ❌ NEVER Install Dependencies in Workspace Directories

```bash
# ❌ DON'T DO THIS - BREAKS PROJECT:
cd backend && npm install package-name       # BREAKS WORKSPACE
cd frontend && npm install package-name      # BREAKS WORKSPACE

# ✅ ALWAYS DO THIS FROM ROOT:
npm install --workspace backend package-name
npm install --workspace frontend package-name
```

**Why**: Project uses npm workspaces. Installing directly in subdirs breaks dependency resolution.

### ❌ NEVER Make Real API Calls in Tests

- Tests use HTTP-VCR fixtures (pre-recorded responses)
- Making real calls **breaks CI** and violates rate limits
- Tests must be deterministic and work offline
- **Use existing fixtures or record new ones properly**

### ❌ Database Schema Changes Are Immediate

- Startup explicitly synchronizes TypeORM schema after registered column renames
- Entity changes **immediately affect database schema**
- TypeORM synchronizes schema; ordered data migrations and pre-sync column renames also exist. Follow `docs/ai/gotchas.md` to preserve existing data
- **Test entity changes thoroughly in development**

### Verify the Current Frontend Build Before Adding Features

Resolve current type-check/build failures before adding frontend features.

```bash
# Run from the workspace root; documentation is not evidence of a passing build
npm run check:ts --workspace frontend
npm run build:frontend
```

### ❌ NEVER Read or Share `.env` Contents

- Treat `.env` files as off-limits for AI agents
- Never open, copy, or log sensitive configuration values
- Use the injected `ConfigurationService` for backend configuration access through `get()` or `getOrThrow()`

---

## 🧪 Testing Guidelines (CRITICAL PATTERNS)

### ⚠️ Mandatory Testing Patterns

#### jest.mock() MUST be at file top (NOT in describe blocks)

```typescript
// ✅ CORRECT - At file top before imports
jest.mock('@services/download/download.service');
jest.mock('@repositories/movie.repository');

import { DownloadService } from '@services/download/download.service';
// ... other imports

describe('Service', () => {
  // Tests here
});
```

```typescript
// ❌ WRONG - In describe block (hoisting issues)
describe('Service', () => {
  jest.mock('@services/external.service'); // ❌ Too late, won't work
});
```

#### ALWAYS Use setupTest() Pattern for Test Isolation

```typescript
// ✅ CORRECT - Prevents race conditions
const setupTest = () => {
  const mockRepository = new Repository({} as never) as jest.Mocked<Repository>;
  const service = new Service(mockRepository);
  return { service, mockRepository };
};

it('should work', async () => {
  const { service, mockRepository } = setupTest(); // ✅ Fresh state
});
```

#### ALWAYS Configure Faker Seed and Clean Timers

```typescript
beforeAll(() => {
  configureFakerSeed(); // ✅ Required for reproducible tests
});

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers(); // ✅ Clean up timers
});
```

### Test Commands (Always run from root)

- `npm test --workspace backend` - Backend unit tests
- `npm run test:backend:e2e` - E2E tests (spins up Docker environment)
- `npm test --workspace=packages/source-metadata-extractor` - Source metadata tests
- `npm run test:frontend:e2e` - Frontend E2E tests
- `npm run test:frontend:visual` - Visual regression tests

### E2E Testing Methods

**Method 1 (One-time):** `npm run test:backend:e2e`

**Method 2 (Development):**

1. `npm run start:backend:e2e` (background)
2. `npm run test:backend:e2e:dev` (repeat as needed)
3. `npm run stop:backend:e2e` (when finished)

---

## 🏗️ Architecture Awareness

### Key Services (Extend Existing Owners)

- `AuthService` - Account authentication, session tokens, and user/admin roles
- `SourceService` - Backend candidate persistence, discovery orchestration, and verification
- `DownloadService` - WebTorrent client, encrypted downloads, and retention
- `MediaService` - Local catalog-index mirroring through the catalog client
- `services/media-catalog` - TMDB-backed catalog data and catalog workers
- `services/list-service` - Trakt lists, watchlists, and playback synchronization
- `services/sources` - Indexer access, constrained Cardigann/Torznab providers, and search planning
- `backend/src/services/background-job/` - Bunqueue workers and recurring schedule coordination

### File Structure Patterns

- Services: `backend/src/services/[service-name]/[service-name].service.ts`
- Routes: `backend/src/routes/[feature].routes.ts`
- Entities: `backend/src/entities/[entity-name].entity.ts`
- Repositories: `backend/src/repositories/[entity-name].repository.ts`
- Frontend features: `frontend/src/features/[feature-name]/api/`, `ui/`, `lib/`

### Background Tasks Overview

Recurring jobs run through the shared Bunqueue broker. Backend workers handle lists, sources, and maintenance; catalog workers handle metadata scans and season synchronization. Schedules depend on configuration and service readiness. Inspect the schedule definitions before assuming a fixed number of jobs or polling intervals.

**Episode Sync Modes:**

- **GREEDY Mode** (`EPISODE_SYNC_MODE=GREEDY`): Syncs all incomplete seasons for all shows
- **ON_DEMAND Mode** (`EPISODE_SYNC_MODE=ON_DEMAND`) - **Default**: Only syncs episodes for shows marked as "watching"

### Authentication System

- **Browser API authentication**: session-scoped HttpOnly access and refresh cookies; `X-Session-Id` selects the session.
- **TV authentication**: `X-Auth-Transport: token` requests token delivery; the app sends Bearer access tokens and refresh-token headers.
- **Streaming access**: separate expiring grants for `/api/stream/:token`.

Reuse the existing frontend and backend authentication flow. See `backend/src/utils/auth-transport.util.ts` and `backend/src/routes/auth.routes.ts` for current transport behavior.

---

## 💻 Development Patterns

### Workspace Management

**CRITICAL**: Always use workspace commands from the root directory:

```bash
# ✅ CORRECT
npm install --workspace backend package-name
npm install --workspace frontend package-name
npm run build:backend
npm run build:frontend

# ❌ WRONG - Breaks dependency resolution
cd backend && npm install package-name
```

### Import Conventions

Use TypeScript path aliases consistently:

```typescript
// ✅ GOOD - Use aliases
import { User } from '@entities/user.entity';
import { AuthService } from '@services/auth/auth.service';

// ❌ BAD - Deep relative paths
import { User } from '../../../entities/user.entity';
```

**Backend Path Aliases:**

- `@constants` - Configuration constants
- `@entities/*` - Database entities
- `@services/*` - Business logic services
- `@repositories/*` - Data access layer
- `@routes/*` - HTTP route handlers
- `@middleware/*` - HTTP middleware
- `@utils/*` - Utility functions
- `@errors/*` - Error classes

**Frontend Path Aliases:**

- `@app/*` - Application shell and bootstrap
- `@features/*` - Feature modules (api, ui, lib)
- `@pages/*` - Route-level screens
- `@shared/*` - Cross-feature utilities and components
- `@store/*` - Redux store configuration
- `@types/*` - Shared TypeScript contracts

### Coding Style

- **TypeScript** everywhere (backend and frontend)
- **Two-space indentation**
- **Run `npm run format`** (Prettier) before committing
- **ESLint** for backend: `npm run lint`
- **Naming conventions**:
  - Services: `FeatureNameService`
  - Routes: `feature.routes.ts`
  - React components: PascalCase files
  - Hooks/utilities: lowerCamelCase modules

### Error Handling Pattern

```typescript
import { RepositoryError } from '@errors/repository.errors';

// ✅ GOOD - Specific error types
if (!movie) {
  throw new RepositoryError('Movie not found', 'not_found');
}
```

---

## 🚀 Development Workflows

### Feature Development Workflow

1. **Analyze existing code** - Understand current implementation
2. **Plan changes** - Identify files that need modification
3. **Implement incrementally** - Make small, testable changes
4. **Test thoroughly** - Unit tests, E2E tests, and manual testing
5. **Update documentation** - Keep docs in sync with changes

### Testing Workflow

```bash
# Backend testing
npm test --workspace backend          # Unit tests
npm run test:backend:e2e              # E2E tests with Docker

# Frontend testing
npm test --workspace frontend        # Unit tests
npm run test:frontend:e2e            # E2E tests with backend integration
npm run test:frontend:visual         # Visual regression tests

# Full test suite
npm test                              # Backend + Frontend unit tests
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
npm run check:ts --workspace backend
npm run check:ts --workspace frontend

# Build verification
npm run build           # Builds everything
npm run build:backend
npm run build:frontend
```

### Development Environment Commands

```bash
# Start full stack
npm run dev                           # Backend, frontend, catalog, lists, and sources

# Backend only
npm run start:backend                # With configuration wizard
npm run start:backend:e2e            # With mock data (Docker-based)

# Frontend only
npm run start:frontend               # Hot reload (recommended for development)
npm run start:frontend:ssr           # SSR build + preview (for testing SSR)

# Configuration
npm run config                       # Interactive configuration wizard
npm run config-only                  # Configuration wizard only
```

### Docker/E2E Environment Usage

```bash
# Start E2E environment (Docker-based with mock services)
npm run start:backend:e2e            # Start environment
npm run test:backend:e2e:dev         # Run tests repeatedly
npm run stop:backend:e2e             # Clean up when done
```

---

## 📁 Quick Reference

### File Mapping for Common Tasks

**Adding New API Endpoints:**

- Route definitions: `backend/src/routes/`
- Business logic: `backend/src/services/`
- Request/response middleware: `backend/src/middleware/`

**Frontend Components:**

- Reusable UI: `frontend/src/shared/ui/`
- Page-level: `frontend/src/pages/`
- Feature-specific: `frontend/src/features/[feature-name]/ui/`
- Redux state: `frontend/src/store/` or `frontend/src/features/[feature-name]/api/`

**Database Changes:**

- Entities: `backend/src/entities/`
- Data access: `backend/src/repositories/`
- Database config: `backend/src/database/`

**Background Tasks:**

- Task scheduling: `backend/src/services/background-job/`
- Content discovery: `backend/src/services/source/`
- Catalog metadata and season sync: `services/media-catalog/`

### Key File Locations

**Most Important Files:**

- `backend/src/app.ts` - Main application setup
- `backend/src/services/source/source.service.ts` - Source aggregation (complete)
- `backend/src/services/download/download.service.ts` - WebTorrent client (complete)
- `backend/src/services/auth/auth.service.ts` - Authentication (complete)
- `backend/src/routes/index.ts` - Route definitions
- `frontend/src/app/AppShell.tsx` - Application shell
- `frontend/src/features/auth/` - Auth APIs, login, QR flows, and session integration

### Project Structure

```text
miauflix/
├── backend/                        # Node.js TypeScript backend
│   ├── src/
│   │   ├── services/              # Business logic services
│   │   ├── routes/                # HTTP route handlers
│   │   ├── entities/              # TypeORM database entities
│   │   ├── repositories/          # Data access layer
│   │   ├── middleware/             # HTTP middleware
│   │   └── utils/                  # Utility functions
│   └── test-fixtures/              # HTTP-VCR fixtures
├── frontend/                       # React application
│   ├── src/
│   │   ├── app/                    # Application shell, bootstrapping
│   │   ├── pages/                 # Route-level screens
│   │   ├── features/              # Domain modules (api, ui, lib)
│   │   ├── shared/                 # Cross-feature utilities
│   │   └── store/                  # Redux store
├── packages/                       # Shared libraries
│   └── source-metadata-extractor/  # Content metadata processing
├── backend-e2e/                   # End-to-end tests (for backend)
└── docs/                           # Project documentation
    └── ai/                         # AI-specific documentation
```

---

## 🎯 Common Gotchas Summary

### Dependency Management

- ❌ Never install in workspace directories (`cd backend && npm install`)
- ✅ Always use workspace flag from root (`npm install --workspace backend`)

### Mock Placement

- ❌ Don't put `jest.mock()` in describe blocks
- ✅ Always put `jest.mock()` at file top before imports

### Shared Test State

- ❌ Don't use shared service instances (causes race conditions)
- ✅ Always use `setupTest()` pattern for test isolation

### Database Changes

- ⚠️ Entity changes affect schema through explicit startup synchronization
- ⚠️ Follow ordered data migrations and pre-sync column renames; test preservation of existing data
- ⚠️ Adding optional fields: Safe
- ⚠️ Renaming/removing fields requires a preservation plan; see `docs/ai/gotchas.md`

### Background Tasks

- ⚠️ Configured recurring jobs may be active through Bunqueue; inspect schedules and readiness
- ⚠️ E2E environment supports hot reloading
- ⚠️ Production Docker requires rebuild/redeploy to update tasks

### Frontend Status

- Authentication is integrated; account/profile UI work remains in `ToDo.md`
- Run build and type checks against the current checkout

---

## 🔍 Before Starting Any Task

1. **Read AI-Specific Documentation**
   - `docs/ai/context.md` - Current project status for AI assistants
   - `docs/ai/gotchas.md` - Critical constraints that will break things
   - `docs/ai/development-guide.md` - Patterns and workflows

2. **Verify Implementation Status**
   - Don't assume tasks marked as incomplete are actually incomplete
   - Check actual codebase implementation vs todo status
   - Use `docs/features.md` and `ToDo.md`, then verify what the implementation already owns

3. **Understand Dependencies**
   - Check if required infrastructure already exists (it probably does)
   - Identify what's actually missing vs what's documented as missing
   - Consider impact on other components

4. **Plan Complex Tasks**
   - Use sequential thinking tool for complex tasks
   - Show plan to user before implementation
   - Verify approach aligns with existing patterns

---

## 💡 Development Priorities

1. **Current task scope** - Use `ToDo.md` and verified implementation gaps
2. **Documentation Updates** - Keep docs synchronized with implementation
3. **Bug Fixes** - Address issues in existing functionality

---

## 🚨 Common Pitfalls to Avoid

- **Don't rebuild existing infrastructure** - Verify and extend its existing owner
- **Don't trust todo status blindly** - Verify against actual implementation
- **Don't create authentication from scratch** - Backend JWT system is complete
- **Don't implement source aggregation** - the sources service and its indexer definitions are fully functional
- **Don't assume WebTorrent needs setup** - DownloadService is complete and operational
- **Don't install dependencies in workspace directories** - Will break npm workspaces
- **Don't make real API calls in tests** - Use HTTP-VCR fixtures only
- **Don't put jest.mock() in describe blocks** - Must be at file top

---

## 🔒 Security & Environment

### Environment Variables

- **Never hardcode secrets** - Use the managed configuration system
- **Follow existing configuration services and helpers** - Browser and CLI setup already exist
- **Use the injected `ConfigurationService`** - It is the backend source of truth for environment configuration. Use `get()` for optional values and `getOrThrow()` for required values; never read `process.env` directly in backend application code
- **VPN detection is active** - Backend detects VPN status
- **Encryption is implemented** - Preserve keys and existing encrypted data

### Configuration Access

```typescript
// ✅ CORRECT - Inside a service with an injected configurationService
const port = this.configurationService.getOrThrow('PORT');

// ❌ WRONG - Direct process.env access
const port = process.env.PORT; // Don't do this
```

---

## 📚 Additional Resources

- **AI Documentation**: `docs/ai/README.md` - Overview of AI-specific docs
- **Development Guide**: `docs/development/workflow.md` - Detailed development workflows
- **Architecture Docs**: `docs/architecture/` - System overview and technical details
- **Setup Guides**: `docs/setup/` - Installation and configuration guides

---

## 🎬 Remember

Verify the existing implementation before planning new work. Authentication is integrated, and the backend and supporting services already own discovery, catalog data, playback, and personal state. Follow [current context](docs/ai/context.md), [features](docs/features.md), and the [task list](ToDo.md) and verify the implementation relevant to the task.

**Golden Rule**: When in doubt, check the responsible service and its current tests before rebuilding it.
