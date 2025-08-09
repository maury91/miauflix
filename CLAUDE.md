# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Miauflix is a self-hosted streaming platform that enables users to discover and stream content from various sources. The backend is production-ready and fully functional, including complete streaming capabilities. The frontend builds successfully but needs JWT authentication integration. The project uses a monorepo structure with npm workspaces.

## Key Commands

### Build Commands

```bash
# Build everything (recommended for development)
npm run build:all                    # Builds libs, backend, and backend-client, and frontend
npm run build:all:backend            # Builds libs, backend, and backend-client
npm run build                        # Builds backend and frontend
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
npm run start:frontend              # Frontend only

# Backend configuration
npm run config                      # Interactive configuration wizard
npm run config-only                 # Configuration wizard only
```

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
- **Authentication**: JWT with refresh tokens (jose library)
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
├── frontend/                   # React application (builds successfully, needs JWT auth)
├── packages/                   # Shared libraries
│   ├── backend-client/         # Generated API client
│   └── source-metadata-extractor/ # Content metadata processing
└── docs/                       # Project documentation
```

### Core Services (All Production-Ready)

- **AuthService**: JWT authentication with refresh tokens, role-based access
- **SourceService**: Multi-provider torrent source aggregation (YTS, THERARBG)
- **DownloadService**: WebTorrent client management for streaming
- **StreamService**: Source selection and streaming optimization
- **MediaService**: TMDB integration for movie/TV metadata
- **TraktService**: Trakt.tv integration for list synchronization
- **EncryptionService**: AES-256-GCM encryption for sensitive data
- **SchedulerService**: Background task management (7 operational tasks)

## Current Implementation Status

### ✅ Fully Functional Components

- **Complete Streaming Infrastructure**: WebTorrent client with streaming endpoint `/stream/:token`
- **Source Aggregation**: Multi-provider background processing (YTS + THERARBG)
- **Authentication System**: Full JWT implementation with refresh tokens and role-based access
- **Database Layer**: Complete entity model with AES-256-GCM encryption
- **Background Processing**: All 7 scheduled tasks operational and production-ready
- **API Infrastructure**: Comprehensive routes with authentication and rate limiting
- **VPN Integration**: Detection and enforcement system
- **Security**: Audit logging, encryption, rate limiting, and timing attack protection

### ✅ Frontend Status

- **Build System**: Frontend builds successfully without TypeScript errors
- **Basic Structure**: React application with Vite, Redux Toolkit setup
- **Components**: Existing UI components and pages structure

### 🔄 Integration Needed

The primary remaining work is **JWT authentication integration**:

- Frontend needs to connect to existing backend auth endpoints
- User authentication flow implementation
- Protected route management
- API request authentication

### Current Status

- **Backend**: 100% complete and production-ready with full streaming capabilities
- **Frontend**: Builds successfully, needs JWT authentication integration with backend
- **Timeline**: 1 week for complete JWT authentication integration

## Streaming Implementation (Completed)

The streaming system is fully implemented and production-ready:

### Stream Endpoint: `/stream/:token`

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

## Priority Development Tasks

### 1. Implement Frontend JWT Authentication

The main remaining task is connecting the frontend to the existing backend authentication system:

**Missing implementations:**

- User login/logout flow
- JWT token management (storage, refresh)
- Protected route components
- API request authentication interceptors
- User session management

**Existing backend endpoints to integrate:**

- `POST /auth/login` - User authentication
- `POST /auth/refresh` - Token refresh
- `POST /auth/logout` - User logout
- All protected endpoints require JWT authentication

### 2. Connect Frontend to Backend APIs

- Movie listing and search endpoints
- Stream key generation for video playback
- User progress tracking
- List management (Trakt integration)
- All backend endpoints are implemented and ready for frontend consumption

### 3. Video Player Integration

- Integrate with `/stream/:token` endpoint for video playback
- Handle streaming key generation and management
- Implement video player controls and seeking

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
- **Don't assume frontend has build issues** - It builds successfully, focus on JWT integration

## Key File References

### Critical Backend Files (Production-Ready)

- `backend/src/app.ts` - Main application entry point
- `backend/src/routes/stream.routes.ts` - Streaming endpoint (complete)
- `backend/src/services/stream/stream.service.ts` - Stream service (complete)
- `backend/src/services/download/download.service.ts` - WebTorrent client (complete)
- `backend/src/services/auth/auth.service.ts` - Authentication (complete)
- `backend/src/routes/index.ts` - Route registration

### Frontend Files for JWT Integration

- `frontend/src/store/` - Redux store setup (existing)
- `frontend/src/store/api/` - API integration layer (needs auth endpoints)
- `frontend/src/store/slices/` - State management (needs auth slice)
- `frontend/src/app/pages/` - Page components (needs login page)

## Documentation Resources

Essential reading before making changes:

- `docs/ai/context.md` - Current project status for AI assistants
- `docs/ai/gotchas.md` - Critical constraints that will break things
- `docs/ai/file-mapping.md` - Where to make different types of changes
- `docs/ai/patterns.md` - Code conventions and patterns
- `docs/overview.md` - Documentation roadmap
- `docs/architecture.md` - System architecture overview
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

**The only remaining work is JWT authentication integration** - connecting the React application's authentication flow to the existing, fully-functional backend authentication endpoints. The infrastructure is complete; focus development efforts on user authentication, token management, and protected routes in the frontend.
