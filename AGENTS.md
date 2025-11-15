# 🤖 AI Agent Guide for Miauflix

> **Purpose**: Comprehensive reference for AI assistants working on the Miauflix codebase. This document consolidates critical information, constraints, and patterns to help agents work effectively without breaking things.

## 📋 Quick Start Checklist

**Before making ANY changes, do these in order:**

1. ✅ Read `docs/ai/context.md` - Current project status for AI assistants
2. ✅ Check `docs/ai/gotchas.md` - Critical constraints that will break things
3. ✅ Verify implementation status - Don't assume incomplete means incomplete
4. ✅ Understand workspace structure - This is an npm workspace monorepo

## 🎯 Project Reality Check

### Implementation Status Overview

- **Backend Infrastructure**: **95% complete and production-ready** ⚡
- **Frontend**: Basic structure exists, has TypeScript build errors, JWT authentication missing
- **Timeline Reality**: **2-3 weeks to full functionality** (not months)
- **Critical Reality**: **Only 2 missing pieces prevent full operation**

### Key Insight: Documentation Was Wrong

- Previous documentation marked 95%+ implemented features as "incomplete"
- Always verify against actual codebase implementation
- Most infrastructure is production-ready - don't rebuild it

### Production-Ready Components (DON'T REBUILD THESE)

✅ **Source Aggregation**: Multi-provider (YTS + THERARBG) with background processing  
✅ **WebTorrent Infrastructure**: Complete client with tracker management and stats scraping  
✅ **Streaming Infrastructure**: Complete `/api/stream/:token` endpoint with quality selection and range requests  
✅ **Authentication Backend**: Full JWT system with refresh tokens and role-based access  
✅ **Database Layer**: Complete entity model with AES-256-GCM encryption  
✅ **Background Tasks**: All 7 scheduled tasks operational  
✅ **API Infrastructure**: Comprehensive routes with auth/rate limiting

### Only Missing Component

❌ **Frontend JWT Auth**: Login page, token management, interceptors to connect with existing backend auth system

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

- Database uses TypeORM `synchronize: true`
- Entity changes **immediately affect database schema**
- No migrations system - changes can cause data loss
- **Test entity changes thoroughly in development**

### ❌ Frontend Has Build Errors - Fix First

```bash
# Check current errors before adding features:
cd frontend && npm run type-check
npm run build  # Must pass before adding features
```

### ❌ NEVER Read or Share `.env` Contents

- Treat `.env` files as off-limits for AI agents
- Never open, copy, or log sensitive configuration values
- Use the `ENV()` helper from `@constants` for any required configuration access

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

### Key Services (All Implemented - DON'T REBUILD)

- `AuthService` - JWT authentication with refresh tokens (228 lines, 18 methods)
- `SourceService` - Multi-provider torrent source aggregation (719 lines, 24 methods)
- `DownloadService` - WebTorrent client management (179 lines)
- `MediaService` - TMDB integration and movie metadata
- `TraktService` - Trakt.tv integration for lists

### File Structure Patterns

- Services: `backend/src/services/[service-name]/[service-name].service.ts`
- Routes: `backend/src/routes/[feature].routes.ts`
- Entities: `backend/src/entities/[entity-name].entity.ts`
- Repositories: `backend/src/repositories/[entity-name].repository.ts`
- Frontend features: `frontend/src/features/[feature-name]/api/`, `ui/`, `lib/`

### Background Tasks Overview

**7 background tasks run continuously:**

- Movie source search (0.1s intervals)
- Source metadata processing (0.2s intervals)
- Stats updates (2s intervals)
- List sync (1h intervals)
- Movie metadata sync (1.5h intervals)
- **Episode sync (1s intervals)** - Mode-aware (GREEDY/ON_DEMAND)

**Episode Sync Modes:**

- **GREEDY Mode** (`EPISODE_SYNC_MODE=GREEDY`): Syncs all incomplete seasons for all shows
- **ON_DEMAND Mode** (`EPISODE_SYNC_MODE=ON_DEMAND`) - **Default**: Only syncs episodes for shows marked as "watching"

### Authentication System

**Three-Tier Authentication System:**

1. **Primary API Auth**: JWT tokens in Authorization headers (15min expiration)
2. **Token Refresh Only**: HttpOnly cookies exclusively for `/api/auth/refresh/:session`
3. **Streaming Access**: Non-JWT streaming keys for `/api/stream/:token`

**Backend is complete** - Frontend needs to integrate with this system.

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
import { UserEntity } from '@entities/user.entity';
import { AuthService } from '@services/auth/auth.service';

// ❌ BAD - Deep relative paths
import { UserEntity } from '../../../entities/user.entity';
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
import { ValidationError, NotFoundError } from '@errors/index';

// ✅ GOOD - Specific error types
if (!movie) {
  throw new NotFoundError('Movie not found');
}

if (!isValidId(movieId)) {
  throw new ValidationError('Invalid movie ID format');
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
npm run test:frontend                 # Unit tests
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
npm run check:ts:backend
npm run check:ts:frontend

# Build verification
npm run build           # Builds libs, backend,     backend-client, and frontend
npm run build:backend
npm run build:frontend
```

### Development Environment Commands

```bash
# Start full stack
npm run dev                           # Backend + Frontend concurrently

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

- Reusable UI: `frontend/src/shared/components/`
- Page-level: `frontend/src/pages/`
- Feature-specific: `frontend/src/features/[feature-name]/ui/`
- Redux state: `frontend/src/store/` or `frontend/src/features/[feature-name]/api/`

**Database Changes:**

- Entities: `backend/src/entities/`
- Data access: `backend/src/repositories/`
- Database config: `backend/src/database/`

**Background Tasks:**

- Task scheduling: `backend/src/services/scheduler/`
- Content discovery: `backend/src/services/source/`
- Metadata processing: `backend/src/services/media/`

### Key File Locations

**Most Important Files:**

- `backend/src/app.ts` - Main application setup
- `backend/src/services/source/source.service.ts` - Source aggregation (complete)
- `backend/src/services/download/download.service.ts` - WebTorrent client (complete)
- `backend/src/services/auth/auth.service.ts` - Authentication (complete)
- `backend/src/routes/index.ts` - Route definitions
- `frontend/src/app/AppShell.tsx` - Application shell
- `frontend/src/features/auth/` - Auth feature module (needs completion)

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
│   ├── backend-client/             # Generated API client
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

- ⚠️ Entity changes immediately affect schema (synchronize: true)
- ⚠️ No migrations system - test thoroughly in development
- ⚠️ Adding optional fields: Safe
- ⚠️ Renaming/removing fields: Will lose data

### Background Tasks

- ⚠️ 7 tasks run continuously - be aware of active processes
- ⚠️ E2E environment supports hot reloading
- ⚠️ Production Docker requires rebuild/redeploy to update tasks

### Frontend Status

- ✅ Frontend builds successfully
- ⚠️ Frontend JWT auth integration is missing (backend is complete)

---

## 🔍 Before Starting Any Task

1. **Read AI-Specific Documentation**
   - `docs/ai/context.md` - Current project status for AI assistants
   - `docs/ai/gotchas.md` - Critical constraints that will break things
   - `docs/ai/development-guide.md` - Patterns and workflows

2. **Verify Implementation Status**
   - Don't assume tasks marked as incomplete are actually incomplete
   - Check actual codebase implementation vs todo status
   - **95% of backend is production-ready** - focus on what's actually missing

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

1. **Frontend JWT Integration** - Connect to existing backend auth
2. **Documentation Updates** - Keep docs synchronized with implementation
3. **Bug Fixes** - Address issues in existing functionality

---

## 🚨 Common Pitfalls to Avoid

- **Don't rebuild existing infrastructure** - 95% of backend is production-ready
- **Don't trust todo status blindly** - Verify against actual implementation
- **Don't create authentication from scratch** - Backend JWT system is complete
- **Don't implement source aggregation** - YTS + THERARBG providers are fully functional
- **Don't assume WebTorrent needs setup** - DownloadService is complete and operational
- **Don't install dependencies in workspace directories** - Will break npm workspaces
- **Don't make real API calls in tests** - Use HTTP-VCR fixtures only
- **Don't put jest.mock() in describe blocks** - Must be at file top

---

## 🔒 Security & Environment

### Environment Variables

- **Never hardcode secrets** - Use environment variables only
- **Follow existing configuration.ts pattern** - Interactive setup system exists
- **Use `ENV()` helper** - Never read `process.env` directly
- **VPN detection is active** - Backend detects VPN status
- **Encryption is production-ready** - AES-256-GCM for sensitive fields

### Configuration Access

```typescript
// ✅ CORRECT - Use ENV() helper
import { ENV } from '@constants';
const apiUrl = ENV('TMDB_API_URL');

// ❌ WRONG - Direct process.env access
const apiUrl = process.env.TMDB_API_URL; // Don't do this
```

---

## 📚 Additional Resources

- **AI Documentation**: `docs/ai/README.md` - Overview of AI-specific docs
- **Development Guide**: `docs/development/workflow.md` - Detailed development workflows
- **Architecture Docs**: `docs/architecture/` - System overview and technical details
- **Setup Guides**: `docs/setup/` - Installation and configuration guides

---

## 🎬 Remember

This is a **complete, sophisticated streaming platform** that needs **only frontend JWT authentication integration**, not a ground-up rebuild. The backend including streaming is fully functional. Focus surgically on connecting the frontend to existing backend authentication.

**Golden Rule**: When in doubt, check the actual implementation in `backend/src/services/` - most things are already built and working.

---

_Last updated: Based on project status as of 2025-01-30_
