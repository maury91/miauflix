# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Miauflix is a self-hosted streaming platform that enables users to discover and stream content from various sources. The backend is production-ready and fully functional, including complete streaming capabilities. The frontend is fully integrated with session-based authentication using HttpOnly cookies. The project uses a monorepo structure with npm workspaces.

## Key Commands

### Build Commands

```bash
# Build everything (recommended for development)
npm run build                        # Builds libs, backend, backend-client, and frontend
npm run build:all:backend            # Builds libs, backend, and backend-client
npm run build:backend                # Backend only
npm run build:frontend               # Frontend only
npm run build:libs                   # All library packages

# Type checking
npm run check:ts                     # TypeScript type checking
```

### Development Commands

```bash
# Start development environment
npm run dev                          # Starts backend and frontend concurrently
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
npm run test:frontend               # Unit tests (limited coverage)
npm run test:e2e                    # E2E tests with full backend integration
npm run test:visual                 # Visual regression tests (Storybook components)
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
- **Backend Framework**: Hono (Express-like but faster)
- **Frontend**: React with Vite, Redux Toolkit, styled-components
- **Database**: TypeORM with SQLite
- **Authentication**: Three-tier system: (1) JWT tokens for API authentication, (2) HttpOnly refresh token cookies for token renewal only, (3) Non-JWT streaming keys for video access (jose library)
- **Streaming**: WebTorrent for peer-to-peer content delivery
- **External APIs**: TMDB (metadata), Trakt.tv (lists), NordVPN (status)

### Project Structure

```
miauflix/
├── backend/                     # Node.js TypeScript backend (production-ready)
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
│   ├── backend-client/         # Generated API client
│   └── source-metadata-extractor/ # Content metadata processing
└── docs/                       # Project documentation
```

### Core Services (All Production-Ready)

- **AuthService**: JWT access tokens with HttpOnly refresh cookies and role-based access
- **SourceService**: Multi-provider torrent source aggregation (YTS, THERARBG)
- **DownloadService**: WebTorrent client management for streaming
- **StreamService**: Source selection and streaming optimization
- **MediaService**: TMDB integration for movie/TV metadata
- **TraktService**: Trakt.tv integration for list synchronization
- **EncryptionService**: AES-256-GCM encryption for sensitive data
- **SchedulerService**: Background task management (7 operational tasks)

## Current Implementation Status

### ✅ Fully Functional Components

- **Complete Streaming Infrastructure**: WebTorrent client with streaming endpoint `/api/stream/:token`
- **Source Aggregation**: Multi-provider background processing (YTS + THERARBG)
- **Authentication System**: Full JWT implementation with refresh tokens and role-based access
- **Database Layer**: Complete entity model with AES-256-GCM encryption
- **Background Processing**: All 7 scheduled tasks operational and production-ready
- **API Infrastructure**: Comprehensive routes with authentication and rate limiting
- **VPN Integration**: Detection and enforcement system
- **Security**: Audit logging, encryption, rate limiting, and timing attack protection

### ✅ Frontend Status

- **Build System**: Frontend builds successfully without TypeScript errors
- **Architecture**: React application with Vite, Redux Toolkit setup
- **Authentication**: Complete session-based auth with HttpOnly cookies
- **Components**: Full login system with email/password and QR code flows
- **Integration**: Backend serves frontend with API mounted under `/api`

### ✅ Integration Complete

The frontend-backend integration is now **fully implemented**:

- ✅ Session-based authentication with secure HttpOnly cookies
- ✅ User authentication flow with email and QR code login
- ✅ Protected route management
- ✅ Backend serves frontend static assets and handles client-side routing
- ✅ API requests properly authenticated via session cookies

### Current Status

- **Backend**: 100% complete and production-ready with full streaming capabilities
- **Frontend**: 100% complete with full authentication integration
- **Status**: Production-ready streaming platform

## Streaming Implementation (Completed)

The streaming system is fully implemented and production-ready:

### Stream Endpoint: `/api/stream/:token`

- **Authentication**: Uses streaming keys with timing attack protection
- **Quality Selection**: Supports quality preference and codec filtering (HEVC support)
- **Range Requests**: Full support for video seeking and partial content delivery
- **Error Handling**: Comprehensive error handling for various streaming scenarios
- **Rate Limiting**: 60 requests per minute for streaming operations

### Stream Service Features

- **Best Source Selection**: Automatically selects optimal source based on quality and codec preferences
- **On-Demand Search**: Real-time source discovery with 3-second timeout
- **Fallback Logic**: Quality fallback when exact matches aren't available
- **Statistics**: Real-time seeders/leechers data

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
import { UserEntity } from '@entities/user.entity';
import { AuthService } from '@services/auth/auth.service';

// ❌ Avoid deep relative paths
import { UserEntity } from '../../../entities/user.entity';
```

Available aliases: `@entities/`, `@services/`, `@repositories/`, `@routes/`, `@middleware/`, `@utils/`, `@database/`, `@mytypes/`, `@content-directories/`, `@errors/`

### Testing Patterns (MANDATORY)

#### jest.mock() Placement

```typescript
// ✅ CORRECT - At file top before imports
jest.mock('@services/download/download.service');
jest.mock('@repositories/movie.repository');

import { DownloadService } from '@services/download/download.service';

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
- Database uses `synchronize: true` - entity changes immediately affect schema
- Test in isolation to avoid race conditions

## Development Focus Areas

### 1. ✅ Authentication System Complete

The frontend authentication system is fully implemented:

**Completed implementations:**

- ✅ User login/logout flow with email and QR code options
- ✅ Session-based authentication with HttpOnly cookies
- ✅ Protected route components
- ✅ API request authentication via session cookies
- ✅ User session management

**Available backend endpoints:**

- `POST /api/auth/login` - User authentication
- `POST /api/auth/refresh/:session` - Token refresh
- `POST /api/auth/logout` - User logout
- All protected endpoints accessible via session cookies

### 2. ✅ Frontend-Backend Integration Complete

- ✅ Movie listing and search endpoints connected
- ✅ Stream key generation for video playback
- ✅ User progress tracking
- ✅ List management (Trakt integration)
- ✅ Backend serves frontend and handles all API requests

### 3. ✅ Video Player Integration Ready

- ✅ Integrated with `/api/stream/:token` endpoint for video playback
- ✅ Streaming key generation and management
- ✅ Video player controls and seeking capabilities

## Configuration System

The project includes an interactive configuration wizard:

- Detects missing environment variables
- Guides through setup with real-time API credential testing
- Saves settings to `.env` file
- Run with `npm run config` or `npm run config-only`

Required environment variables:

- `TMDB_API_ACCESS_TOKEN` - TMDB API access token
- `TRAKT_CLIENT_ID` - Trakt.tv client ID (optional)
- `JWT_SECRET` - JWT signing secret
- `NORDVPN_PRIVATE_KEY` - NordVPN private key (optional)

## Common Pitfalls to Avoid

- **Don't rebuild existing backend infrastructure** - It's production-ready and fully functional
- **Don't install dependencies in workspace directories** - Will break npm workspaces
- **Don't make real API calls in tests** - Use HTTP-VCR fixtures only
- **Don't put jest.mock() in describe blocks** - Must be at file top
- **Don't assume streaming needs implementation** - It's already complete and working
- **Don't assume frontend needs auth work** - It's fully integrated with session-based auth

## Key File References

### Critical Backend Files (Production-Ready)

- `backend/src/app.ts` - Main application entry point, serves frontend
- `backend/src/routes/stream.routes.ts` - Streaming endpoint (complete)
- `backend/src/services/stream/stream.service.ts` - Stream service (complete)
- `backend/src/services/download/download.service.ts` - WebTorrent client (complete)
- `backend/src/services/auth/auth.service.ts` - Authentication (complete)
- `backend/src/routes/index.ts` - Route registration under `/api`

### Frontend Files (Complete Integration)

- `frontend/src/store/` - Redux store setup (complete)
- `frontend/src/store/api/` - API integration layer (complete with auth)
- `frontend/src/store/slices/` - State management (complete auth slice)
- `frontend/src/app/pages/login/` - Login page components (complete)
- `frontend/src/app/pages/login/components/` - LoginWithEmail, LoginWithQR components

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

This is a **sophisticated, production-ready streaming platform** with:

- ✅ Complete backend infrastructure including full streaming capabilities
- ✅ WebTorrent integration with peer-to-peer streaming
- ✅ Multi-provider content aggregation
- ✅ JWT authentication with refresh tokens
- ✅ Database layer with encryption
- ✅ Background processing and scheduling
- ✅ VPN integration and security features
- ✅ Frontend builds successfully without errors

**The platform is production-ready** - Both backend infrastructure and frontend integration are complete. The system features session-based authentication with HttpOnly cookies, full streaming capabilities, and a responsive React frontend. Development efforts can now focus on new features, performance optimizations, and user experience enhancements.

- always run npm commands from the workspace root, never from subfolders
