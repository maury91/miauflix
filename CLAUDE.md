# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Miauflix is a self-hosted movie and TV streaming platform in an npm workspace monorepo. Read `docs/ai/context.md` and `docs/ai/gotchas.md` before changes. Use `docs/features.md` for implemented capabilities and `ToDo.md` for planned work, then verify behavior against the current code. Documentation is not proof of passing builds or production readiness.

## Key Commands

### Build Commands

```bash
# Build everything (recommended for development)
npm run build                        # Builds everything
npm run build:backend                # Build backend's dependencies and then backend
npm run build:frontend               # Build frontend dependencies and frontend only
npm run build:libs                   # All library packages

# Type checking
npm run check:ts                     # TypeScript type checking
```

### Development Commands

```bash
# Start development environment
npm run dev                          # Backend, frontend, catalog, lists, and sources
npm run start:backend               # Backend only

# Production deployment
npm run start:backend:docker:prod   # Start backend in production using Docker Compose (builds automatically)

# Frontend development
npm run start:frontend              # Frontend with hot reload (recommended for development)
npm run start:frontend:ssr            # Frontend with SSR build + preview (for testing SSR)

# Backend configuration
npm run config                      # Interactive configuration wizard
npm run config-only                 # Configuration wizard only
```

### Frontend Development Workflow

For frontend development, there are two main approaches:

1. **Development with Hot Reload (Recommended)**:

   ```bash
   npm run start:frontend
   ```

   - Uses Vite dev server with instant hot reload
   - Perfect for UI development and styling
   - Changes appear immediately without manual refresh
   - No SSR (Server-Side Rendering) - uses client-side rendering only

2. **SSR Testing Mode**:

   ```bash
   npm run start:frontend:ssr
   ```

   - Builds the application with SSR and serves it via preview
   - Use this to test SSR functionality specifically
   - No hot reload - requires manual rebuild after changes
   - Matches production behavior more closely

**When to use each:**

- **Use `npm run start:frontend`** for day-to-day development, component styling, and UI work
- **Use `npm run start:frontend:ssr`** only when you need to test SSR-specific functionality or debug SSR issues

### Testing Commands

```bash
# Backend tests
npm run test:backend                # Unit tests
npm run test:backend:e2e            # E2E tests (spins up Docker environment)
npm run test:backend:e2e:dev        # Run E2E tests against existing environment

# Start/stop E2E environment manually
npm run start:backend:e2e           # Start Docker environment for development
npm run stop:backend:e2e            # Stop Docker environment

# Frontend tests
npm test --workspace frontend      # Frontend unit tests
npm run test:e2e                    # E2E tests with full backend integration
npm run test:frontend:visual        # Visual regression tests (Storybook components)
```

### Code Quality

```bash
npm run lint                        # Lint backend code
npm run lint:fix                    # Fix linting issues automatically
npm run format                      # Format all code with Prettier
npm run format:check                # Check formatting without changes
```

## Architecture Overview

### Technology Stack

- **Runtime**: Node.js 22 with ESM modules
- **Backend Framework**: Hono
- **Frontend**: React with Vite, Redux Toolkit, styled-components
- **Database**: TypeORM with SQLite
- **Authentication**: JWT access and opaque rotating refresh tokens. Browsers receive session-scoped HttpOnly access/refresh cookies; the TV app requests token transport and sends token headers. Streaming uses separate grants.
- **Streaming**: WebTorrent for peer-to-peer content delivery
- **Supporting services**: Bun catalog (TMDB), lists (Trakt), and sources (Cardigann/Torznab), accessed through versioned contracts; NordVPN status checks run in the relevant network owners

### Project Structure

```
miauflix/
├── backend/                     # Node.js TypeScript backend
│   ├── src/
│   │   ├── services/           # Business logic services
│   │   ├── routes/             # HTTP route handlers
│   │   ├── entities/           # TypeORM database entities
│   │   ├── repositories/       # Data access layer
│   │   ├── middleware/         # HTTP middleware (auth, rate limiting)
│   │   └── utils/              # Utility functions
│   └── docs/                   # API and system documentation
├── frontend/                   # React application (served by backend; auth fully integrated)
├── packages/                   # Shared libraries
│   └── source-metadata-extractor/ # Content metadata processing
└── docs/                       # Project documentation
```

### Core Services

- **AuthService**: Account authentication, sessions, and user/admin roles
- **SourceService**: Backend source persistence, discovery orchestration, and verification
- **services/media-load**: Bun torrent engine: WebTorrent client (`DownloadService`), encrypted media storage and its own storage database (`StorageService`), retention and tracker scrapes. The backend reaches it through `MediaLoadClientService`
- **StreamService / PlaybackSessionService**: Playback selection, preparation, grants, and delivery
- **MediaService / CatalogClient**: Local indexes and access to the catalog service
- **services/media-catalog**: TMDB-backed metadata, freshness, artwork, and season workers
- **services/list-service**: Trakt lists, account linking, watchlists, and playback synchronization
- **services/sources**: Supported Cardigann/Torznab providers and search planning
- **EncryptionService**: Encryption for selected sensitive data
- **backend/src/services/background-job/**: Bunqueue workers and recurring schedule coordination

## Current Implementation Status

Authentication is integrated in both the browser and packaged TV app. Movie/TV browsing, source discovery, playback sessions, seeking, audio conversion, local text subtitles, progress, ratings, watchlists, notifications, and storage administration have implementations. Reuse these owners rather than assuming they need creating.

Known boundaries include movie-only OpenSubtitles search, optional HEVC conversion, partial Cardigann support, and pending account/profile UI work. See `docs/ai/context.md`, `docs/features.md`, and `ToDo.md` for the detailed boundaries. Run relevant checks for the current checkout; verify build and completion claims against relevant checks.

## Streaming Implementation

`/api/stream/:token` delivers a source authorized by an expiring streaming grant and supports byte ranges for direct playback. Playback sessions select and prepare sources using stored-download, codec, quality, and bitrate preferences; incompatible sources can fall back. Audio/video adaptation, local subtitle delivery, next-episode preparation, and encrypted storage have dedicated owners.

See `backend/docs/streaming-services.md` and inspect the current route/service definitions for limits, endpoints, and configuration. The existing automatic quality preference is not the planned Watch Now quality-selection UI.

## Development Guidelines

### Workspace Management (CRITICAL)

```bash
# ✅ ALWAYS install dependencies from root using workspaces
npm install --workspace backend package-name
npm install --workspace frontend package-name

# ❌ NEVER install directly in subdirectories (breaks workspace)
cd backend && npm install package-name  # BREAKS PROJECT
```

### Import Conventions

The project uses path aliases to avoid deep relative imports:

```typescript
// ✅ Use aliases (backend)
import { User } from '@entities/user.entity';
import { AuthService } from '@services/auth/auth.service';

// ❌ Avoid deep relative paths
import { User } from '../../../entities/user.entity';
```

Available aliases: `@entities/`, `@services/`, `@repositories/`, `@routes/`, `@middleware/`, `@utils/`, `@database/`, `@mytypes/`, `@errors/`

### Testing Patterns (MANDATORY)

#### jest.mock() Placement

```typescript
// ✅ CORRECT - At file top before imports
jest.mock('@services/media-load/media-load-client.service');
jest.mock('@repositories/movie.repository');

import { MediaLoadClientService } from '@services/media-load/media-load-client.service';

describe('Service', () => {
  // Tests here
});
```

#### Test Isolation Pattern

```typescript
const setupTest = () => {
  const mockRepository = new Repository({} as never) as jest.Mocked<Repository>;
  const service = new Service(mockRepository);
  return { service, mockRepository };
};

it('should work', async () => {
  const { service, mockRepository } = setupTest();
  // Test implementation
});
```

#### Timer and Faker Setup

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

- Tests use HTTP-VCR fixtures (pre-recorded API responses)
- NEVER make real API calls in tests (breaks CI and rate limits)
- Startup explicitly synchronizes TypeORM schema after registered column renames; ordered data migrations also run
- Test in isolation to avoid race conditions

## Development Focus Areas

Follow the user's task and the current backlog in `ToDo.md`. Existing API account creation/logout must not be mistaken for a finished account-management interface. Profile selection/editing, account-creation screens, a logout control, interface translations, and other future work are tracked separately.

Current authentication endpoints include:

- `POST /api/auth/login` - Email/password login
- `POST /api/auth/refresh/:session` - Session token rotation
- `POST /api/auth/logout/:session` - Session logout
- `/api/auth/qr/*` - QR approval and claim flow

Browser API calls use session cookies; token-transport clients use headers. Trakt account linking is an integration, not Miauflix login.

## Configuration System

The browser editor and CLI wizard (`npm run config` or `npm run config-only`) validate settings and persist application configuration in the data directory. Saved values can override bootstrap environment defaults. Connected services publish configuration schemas; retain their data volumes and encryption keys.

TMDB credentials are needed for catalog access; Trakt credentials enable optional list/synchronization features. Signing/encryption secrets can be generated automatically. NordVPN credentials belong to the VPN deployment. See `docs/setup/environment-variables.md` rather than treating every setting as a required backend environment variable.

## Common Pitfalls to Avoid

- **Don't rebuild existing backend infrastructure** - Verify and extend the responsible owner
- **Don't install dependencies in workspace directories** - Will break npm workspaces
- **Don't make real API calls in tests** - Use HTTP-VCR fixtures only
- **Don't put jest.mock() in describe blocks** - Must be at file top
- **Don't assume streaming needs implementation** - It's already complete and working
- **Don't assume frontend needs auth work** - It's fully integrated with session-based auth

## Key File References

### Critical Backend Files

- `backend/src/app.ts` - Main application entry point, serves frontend
- `backend/src/routes/stream.routes.ts` - Streaming endpoint (complete)
- `backend/src/services/stream/stream.service.ts` - Stream service (complete)
- `backend/src/services/media-load/media-load-client.service.ts` - Client for the media-load torrent engine (complete)
- `services/media-load/src/engine/download.service.ts` - WebTorrent client, in the media-load service (complete; tests use `bun test`)
- `backend/src/services/auth/auth.service.ts` - Authentication (complete)
- `backend/src/routes/index.ts` - Route registration under `/api`

### Frontend Files

- `frontend/src/store/` - Redux store setup (complete)
- `frontend/src/features/*/api/` - Feature API integrations
- `frontend/src/store/slices/` - State management (complete auth slice)
- `frontend/src/features/auth/ui/login/` - Email/password and QR login controls
- `frontend/src/pages/login/` - Login page

## Documentation Resources

Essential reading before making changes:

- `docs/ai/context.md` - Current project status for AI assistants
- `docs/ai/gotchas.md` - Critical constraints that will break things
- `docs/ai/development-guide.md` - Development patterns and workflows
- `docs/architecture/system-overview.md` - Complete system architecture
- `docs/development/workflow.md` - Development workflow and conventions
- `backend/docs/streaming-services.md` - Streaming implementation details
- `backend/docs/authentication.md` - Authentication system documentation

## Project Reality Check

Verify behavior against implementation, using the owning modules and task-relevant checks. Read `docs/ai/context.md`, `docs/features.md`, and `ToDo.md` for current capabilities and gaps.

- always run npm commands from the workspace root, never from subfolders
