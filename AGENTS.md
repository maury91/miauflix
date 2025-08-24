# 🤖 AI Agent Documentation

> **PURPOSE**: Essential information for AI assistants working on the Miauflix project.

## 📋 **Quick Start**

### **Before Making ANY Changes**

1. **Read `docs/ai/context.md`** - Current project status for AI assistants
2. **Check `docs/ai/gotchas.md`** - Critical constraints that will break things
3. **Use `docs/ai/file-mapping.md`** - Quick reference for file locations
4. **Follow `docs/ai/patterns.md`** - Code conventions and architectural consistency

### **Project Reality**

- **Backend**: 100% complete and production-ready ⚡
- **Frontend**: Authentication implemented, build passes
- **Timeline**: Project is functionally complete
- **Critical Reality**: Both backend and frontend authentication are fully implemented

## 🔧 **Essential Tools**

### **ENV Function - Type-Safe Environment Variables**

```typescript
import { ENV } from '@constants';

const port = ENV('PORT'); // number (validated: 1-65535)
const syncMode = ENV('EPISODE_SYNC_MODE'); // 'GREEDY' | 'ON_DEMAND'
```

**📖 Detailed Guide**: See `docs/ai/env-function.md`

### **Testing Patterns**

```typescript
// ✅ CORRECT - jest.mock() at file top
jest.mock('@services/download/download.service');

// ✅ CORRECT - Use setupTest() pattern
const setupTest = () => {
  const mockRepository = new Repository({} as never) as jest.Mocked<Repository>;
  return { service: new Service(mockRepository), mockRepository };
};
```

**📖 Detailed Guide**: See `docs/ai/testing-patterns.md`

## 🏗️ **Architecture Overview**

### **Key Services (All Complete - DON'T REBUILD)**

- `AuthService` - Session-based authentication with HttpOnly cookies as refresh tokens and JWT for short lived tokens
- `SourceService` - Multi-provider torrent source aggregation
- `DownloadService` - WebTorrent client management
- `MediaService` - TMDB integration and episode sync management
- `TraktService` - Trakt.tv integration for lists
- `EncryptionService` - AES-256-GCM for sensitive data
- `VpnDetectionService` - VPN status monitoring
- `AuditLogService` - Security event logging

### **File Structure**

```
backend/src/
├── services/           # Business logic
├── routes/            # HTTP endpoints
├── entities/          # Database models
├── repositories/      # Database operations
└── utils/            # Shared utilities
```

**📖 Detailed Guide**: See `docs/ai/architecture-patterns.md`

## 🚨 **Critical Gotchas**

### **Dependency Management**

```bash
# ❌ NEVER install in workspace directories
cd backend && npm install package-name       # BREAKS WORKSPACE

# ✅ ALWAYS install from root with workspace flag
npm install --workspace backend package-name
```

### **Testing Constraints**

- ❌ **NEVER make real API calls in tests**
- ✅ **Use HTTP-VCR fixtures** (pre-recorded responses)
- ✅ **Tests must be deterministic and work offline**

### **Database Safety**

- ⚠️ **Entity changes immediately affect database schema**
- ✅ **Test entity changes thoroughly in development**
- ❌ **No migrations system - changes can cause data loss**

## 🎯 **Development Priorities**

### **Current Status: Fully Functional Backend**

- ✅ **Authentication**: Session-based authentication with HttpOnly cookies as refresh tokens and JWT for short lived tokens
- ✅ **Source Discovery**: Multi-provider aggregation (YTS + THERARBG)
- ✅ **Media Streaming**: WebTorrent infrastructure with stream endpoint
- ✅ **Database Layer**: 13 entities with encryption
- ✅ **Background Tasks**: 7 scheduled tasks operational

### **Frontend Status: Authentication Complete**

- ✅ **Session-Based Authentication**: Complete auth with HttpOnly cookies for security
- ✅ **Login Components**: LoginPage, LoginWithEmail, LoginWithQR, QRDisplay components implemented
- ✅ **Auth Store**: Redux store with auth API and slices fully functional
- ✅ **Frontend Build**: No TypeScript errors, builds successfully
- ✅ **Component Library**: Comprehensive Storybook documentation and visual testing

### **Current Status: Production-Ready Platform**

The project is **100% functional** with both backend and frontend authentication fully implemented. Main areas for future enhancement:

1. **Feature Expansion**: Additional streaming sources, TV show episodes, anime support
2. **UI/UX Polish**: Enhanced user experience and accessibility features
3. **Performance Optimization**: Caching, lazy loading, viewport preload
4. **Mobile Apps**: Native iOS and Android clients
5. **Advanced Features**: Quality selection UI, continue watching, Trakt integration

## 🧪 **Testing Commands**

```bash
# Run all backend tests
npm test --workspace backend

# Run E2E tests (spins up Docker environment)
npm run test:backend:e2e

# Development E2E workflow
npm run start:backend:e2e  -- -d # Start environment (background)
npm run test:backend:e2e:dev  # Run tests (repeat as needed)
npm run stop:backend:e2e # Stop environment
```

## 🐳 **Docker Development**

```bash
# E2E environment - supports hot reload
npm run start:backend:e2e

# Production Docker - no hot reload
docker-compose up
```

## 📚 **Documentation Accuracy**

### **Important Context**

- ⚠️ **Previous documentation was massively outdated**
- ✅ **Todo lists marked complete features as incomplete**
- ✅ **Implementation status was wrong by ~90%**
- ✅ **Always verify against actual codebase**

### **Trust Codebase Over Documentation**

- If docs contradict code, code is usually correct
- Check actual file implementation before assuming something needs to be built
- Most things are already built and working

## 🔍 **Quick File References**

### **Most Important Files**

- `backend/src/app.ts` - Main application setup
- `backend/src/services/source/source.service.ts` - Source aggregation (complete)
- `backend/src/services/download/download.service.ts` - WebTorrent client (complete)
- `backend/src/services/auth/auth.service.ts` - Authentication (complete)
- `backend/src/routes/index.ts` - Route definitions
- `backend/src/routes/stream.routes.ts` - Streaming endpoint (complete)
- `frontend/src/store/api/auth.ts` - Authentication API (complete)
- `frontend/src/pages/LoginPage.tsx` - Login page (complete)

### **Key Frontend Components**

- `frontend/src/components/LoginForm.tsx` - Login form component
- `frontend/src/components/DeviceLogin.tsx` - Device authentication
- `frontend/src/store/slices/` - Redux store slices

---

## 📖 **Detailed Documentation**

For comprehensive information on specific topics:

- **Environment Variables**: `docs/ai/env-function.md`
- **Testing Patterns**: `docs/ai/testing-patterns.md`
- **Architecture**: `docs/ai/architecture-patterns.md`
- **Episode Sync**: `docs/ai/episode-sync-system.md`
- **Project Context**: `docs/ai/context.md`
- **Critical Gotchas**: `docs/ai/gotchas.md`
- **File Mapping**: `docs/ai/file-mapping.md`
- **Code Patterns**: `docs/ai/patterns.md`

---

**Golden Rule**: When in doubt, check the actual implementation in `backend/src/services/` - most things are already built and working. Focus on the 2 missing pieces rather than rebuilding existing infrastructure.

# **Remember**: The ENV function is your friend! It provides type safety, validation, and clear error messages. Always use it instead of direct `process.env` access.

# 🤖 AI Agents Guide to Miauflix

> **Primary Reference**: This document serves as the central guide for AI agents working on the Miauflix streaming platform codebase. Read this before beginning any development work.

> **⚠️ CRITICAL**: This document was corrected after initial analysis. Always verify claims against actual codebase implementation - documentation can be outdated or incorrect. Real code is the source of truth.

## 📋 Table of Contents

- [Project Overview](#-project-overview)
- [Critical Context for Agents](#-critical-context-for-agents)
- [Agent Operating Guidelines](#-agent-operating-guidelines)
- [Development Workflows](#-development-workflows)
- [Architecture Map](#-architecture-map)
- [Testing Strategy](#-testing-strategy)
- [Common Pitfalls & Solutions](#-common-pitfalls--solutions)
- [Resource Index](#-resource-index)
- [Quick Decision Tree](#-quick-decision-tree)

## 🎯 Project Overview

**Miauflix** is a self-hosted media streaming platform that enables users to discover and stream content from various sources through peer-to-peer technology.

### **Current Reality**

- **Backend**: 95% complete and production-ready
- **Infrastructure**: Sophisticated, enterprise-level implementation
- **Timeline**: 2-3 weeks to full functionality (not months)
- **Critical Missing**: Only 1 component prevents full operation

### **Technology Stack**

- **Backend**: Node.js + TypeScript + Hono framework + SQLite + TypeORM
- **Frontend**: React + Redux Toolkit + Vite + TypeScript
- **Streaming**: WebTorrent for peer-to-peer content delivery
- **Deployment**: Docker + nginx + Let's Encrypt SSL
- **Authentication**: Session-based authentication with HttpOnly cookies as refresh tokens and JWT for short lived tokens
- **Database**: SQLite with field-level AES-256-GCM encryption

## 🚨 Critical Context for Agents

### **The Documentation Paradox**

**CRITICAL**: Previous documentation was severely outdated. Todo lists marked 95% of complete features as "incomplete" or "needs implementation." **Always verify against actual codebase implementation.**

### **What's Actually Complete (DON'T REBUILD)**

✅ **Authentication System**: Full JWT implementation (228 lines, 18 methods)  
✅ **Source Discovery**: Multi-provider aggregation (YTS + THERARBG) with background processing  
✅ **WebTorrent Infrastructure**: Complete streaming client with peer management  
✅ **Database Layer**: 13 entities with encryption, complete repository pattern  
✅ **Background Tasks**: 7 scheduled tasks running continuously (0.1s - 5s intervals)  
✅ **API Infrastructure**: All routes except streaming endpoint implemented  
✅ **Media Integration**: TMDB and Trakt.tv APIs fully integrated  
✅ **Security**: VPN detection, audit logging, rate limiting, encryption

### **What's Actually Missing (Verified Against Code)**

❌ **Viewport Preload**: `/api/ui/viewport` endpoint for preload queue optimization (minor performance enhancement)

### **Current Issues**

✅ **Frontend Builds Successfully**: No TypeScript errors (build passes)  
✅ **Stream Endpoint Complete**: Backend streaming infrastructure fully implemented

## 🤖 Agent Operating Guidelines

### **Read First, Code Second**

**MANDATORY**: Before any development work, read these files in order:

1. **`docs/ai/context.md`** - Current project status for AI assistants
2. **`docs/ai/gotchas.md`** - Critical constraints that will break things
3. **`docs/ai/file-mapping.md`** - Where to make different types of changes
4. **`docs/ai/patterns.md`** - Code conventions and architectural patterns

### **Verification Protocol**

1. **Check Implementation vs Documentation**: If docs say something needs building, verify against actual code
2. **Test Real Status**: Run tests to confirm current functionality
3. **Understand Dependencies**: Map what exists before building new components
4. **Focus Surgically**: Address the 2 missing pieces, not fictional rebuilds

### **Development Philosophy**

- **Preserve Working Systems**: This is a nearly-complete platform, not a greenfield project
- **Follow Established Patterns**: Sophisticated conventions exist - use them
- **Test Thoroughly**: Enterprise-level testing infrastructure in place
- **Security First**: Field-level encryption and audit trails are active

## 🔄 Development Workflows

### **Current Status: All Core Functionality Complete**

**Status**: ✅ Complete streaming platform with full authentication integration  
**Implementation**: Session-based authentication with HttpOnly cookies implemented

The platform features complete infrastructure:

- ✅ Stream routes with quality selection and auth verification
- ✅ DownloadService.streamFile() method (lines 531-585)
- ✅ Range request support for video seeking
- ✅ Authentication system complete (Session-based authentication with HttpOnly cookies as refresh tokens and JWT for short lived tokens)
- ✅ Frontend builds successfully with full auth integration

### **Future Enhancement Opportunities**

**Priority #1: Viewport Preload Optimization**

```bash
# Minor performance enhancement - viewport-based preloading
# Implementation: /api/ui/viewport endpoint for smart content preloading
```

**Priority #2: Feature Expansion**

**Potential new features**:

- TV show episode navigation and streaming
- Additional content sources (1337x, Nyan, etc.)
- Anime-specific metadata and fansub integration
- Quality selection UI improvements
- Continue watching functionality

**Note**: Core platform is production-ready - focus on feature expansion

### **Adding New Features**

Follow the established patterns:

1. **API Endpoints**: Use `backend/src/routes/[feature].routes.ts` pattern
2. **Business Logic**: Add to `backend/src/services/[service]/[service].service.ts`
3. **Database Changes**: Modify `backend/src/entities/[entity].entity.ts` (auto-syncs)
4. **Frontend State**: Use `frontend/src/store/slices/[feature].ts` pattern
5. **UI Components**: Follow `frontend/src/app/pages/[page]/` structure

## 🏗️ Architecture Map

### **Backend Services (All Complete)**

```
Services/
├── AuthService (325 lines, ~15 methods) - JWT generation, verification
├── SourceService (464 lines) - Multi-provider aggregation
├── DownloadService (587 lines) - WebTorrent client management
├── MediaService - TMDB integration and movie metadata
├── TraktService - Trakt.tv integration for lists
├── EncryptionService - AES-256-GCM for sensitive data
├── VpnDetectionService - VPN status monitoring
└── AuditLogService - Security event logging
```

### **Background Tasks (All Operational)**

```
Scheduler running 7 tasks:
├── Movie source search (0.1s intervals)
├── Source metadata processing (0.2s intervals)
├── WebTorrent stats updates (2s intervals)
├── List synchronization (1h intervals)
├── Movie metadata sync (1.5h intervals)
├── VPN status monitoring (5s intervals)
└── Audit log cleanup (daily)
```

### **Database Entities (All Complete)**

```
Entities/
├── User - Authentication and profiles
├── Movie - TMDB movie metadata
├── MovieSource - Torrent source links
├── Genre - Movie categorization
├── TraktUser - Trakt.tv integration
├── RefreshToken - JWT token management
├── Progress - User watch progress
├── AuditLog - Security events
├── StreamingKey - Stream authentication
├── SyncState - Background sync status
├── Storage - File management
├── Episode/Season - TV show structure (partial)
└── List - User collections
```

## 🧪 Testing Strategy

### **Testing Philosophy**

The codebase uses sophisticated enterprise testing patterns:

- **Module Mocking**: `jest.mock()` at file top, before imports
- **Test Isolation**: `setupTest()` pattern prevents race conditions
- **Realistic Data**: Faker with seeds for reproducible variety
- **HTTP-VCR**: Pre-recorded API responses, no live calls
- **Type Safety**: Maintain full TypeScript benefits in tests

### **Running Tests**

```bash
# Backend unit tests (fast)
npm test --workspace backend

# Backend E2E tests (comprehensive)
npm run test:backend:e2e

# E2E development workflow
npm run start:backend:e2e -- -d   # Start environment
npm run test:backend:e2e:dev      # Run specific tests
npm run stop:backend:e2e          # Stop environment

# Source metadata tests
npm test --workspace=packages/source-metadata-extractor
```

### **Test Patterns to Follow**

```typescript
// CORRECT pattern from existing tests
jest.mock('@database/database');
jest.mock('@repositories/movie.repository');

import { SourceService } from '@services/source/source.service';
import { configureFakerSeed } from '@__test-utils__/utils';

describe('ServiceName', () => {
  const setupTest = () => {
    const mockRepository = new Repository({} as never) as jest.Mocked<Repository>;
    const service = new Service(mockRepository);
    return { service, mockRepository };
  };

  beforeAll(() => {
    configureFakerSeed(); // Required for reproducible tests
  });

  it('should work', async () => {
    const { service, mockRepository } = setupTest(); // Fresh state
    // Test implementation...
  });
});
```

## ⚠️ Common Pitfalls & Solutions

### **Dependency Management**

❌ **NEVER**: `cd backend && npm install package-name`  
✅ **ALWAYS**: `npm install --workspace backend package-name`

**Why**: Project uses npm workspaces. Installing directly in subdirs breaks dependency resolution.

### **Testing Constraints**

❌ **NEVER**: Make real API calls in tests  
✅ **ALWAYS**: Use HTTP-VCR fixtures (pre-recorded responses)

**Why**: Tests must work offline and be deterministic.

### **Database Changes**

⚠️ **REMEMBER**: Database uses `synchronize: true`

- Entity changes immediately affect database schema
- No migrations system - TypeORM handles schema updates
- Test entity changes thoroughly in development

### **Frontend Build Issues**

✅ **CURRENT STATUS**: Frontend builds successfully  
⚠️ **VERIFICATION**: Check for any remaining TypeScript issues

```bash
# Verify build status
npm run build -w frontend
```

### **Background Tasks**

⚠️ **REMEMBER**: 7 background tasks run continuously

- E2E environment supports hot reloading
- Production requires container rebuild/redeploy for updates

### **Security Constraints**

❌ **NEVER**: Hardcode secrets or API keys  
✅ **ALWAYS**: Use environment variables with configuration system

### **Mock Patterns**

❌ **WRONG**: `jest.mock()` inside describe blocks  
✅ **CORRECT**: Mock declarations at file top, before imports

## 📚 Resource Index

### **Essential AI Documentation**

| File                      | Purpose                          | When to Read          |
| ------------------------- | -------------------------------- | --------------------- |
| `docs/ai/context.md`      | Project status for AI assistants | **ALWAYS READ FIRST** |
| `docs/ai/gotchas.md`      | Critical constraints             | Before making changes |
| `docs/ai/file-mapping.md` | Where to make changes            | When adding features  |
| `docs/ai/patterns.md`     | Code conventions                 | When writing code     |
| `docs/ai/workflows.md`    | Step-by-step guides              | When implementing     |

### **Key Implementation Files**

| Component             | File Location                                       | Status                |
| --------------------- | --------------------------------------------------- | --------------------- |
| **Stream Endpoint**   | `backend/src/routes/stream.routes.ts`               | ✅ **Complete**       |
| **Download Service**  | `backend/src/services/download/download.service.ts` | ✅ Complete           |
| **Auth Service**      | `backend/src/services/auth/auth.service.ts`         | ✅ Complete           |
| **Source Service**    | `backend/src/services/source/source.service.ts`     | ✅ Complete           |
| **Frontend Auth API** | `frontend/src/store/api/auth.ts`                    | ✅ **Complete**       |
| **Auth State Slice**  | `frontend/src/store/slices/auth.ts`                 | ❓ Needs verification |

### **Architecture Documentation**

| Document                             | Focus                     | Completeness            |
| ------------------------------------ | ------------------------- | ----------------------- |
| `docs/architecture.md`               | System overview           | Complete                |
| `backend/docs/authentication.md`     | JWT implementation        | Complete                |
| `backend/docs/chunk-stores.md`       | WebTorrent infrastructure | Complete                |
| `backend/docs/scheduler-service.md`  | Background tasks          | Complete                |
| `backend/docs/streaming-services.md` | Media streaming           | Infrastructure complete |

### **Testing Resources**

| Resource                            | Purpose                        |
| ----------------------------------- | ------------------------------ |
| `backend/src/__test-utils__/`       | Testing utilities and patterns |
| `backend/test-fixtures/`            | HTTP-VCR recorded responses    |
| `backend/src/__test-utils__/mocks/` | Mock data factories            |
| `backend-e2e/`                      | End-to-end testing environment |

## 🌳 Quick Decision Tree

```
📋 New Task Received
├─ 🚨 Is it rebuilding auth/sources/streaming?
│  ├─ YES → ❌ STOP: These systems are complete
│  └─ NO → Continue
├─ 🔍 Does it involve the missing piece?
│  ├─ Frontend JWT → ✅ Priority #1
│  └─ Something else → Verify it's actually needed
├─ 📖 Have you read the AI docs?
│  ├─ NO → 🚨 READ: docs/ai/ files first
│  └─ YES → Continue
├─ 🧪 Are you writing tests?
│  ├─ YES → Follow setupTest() pattern
│  └─ NO → Tests required for all code
├─ 📁 Do you know where the code goes?
│  ├─ NO → Check docs/ai/file-mapping.md
│  └─ YES → Follow established patterns
└─ ✅ Ready to develop
```

## 🎯 Success Criteria for Agents

### **Before Starting**

- [ ] Read all AI documentation (`docs/ai/`)
- [ ] Understand the missing piece vs what's complete
- [ ] Know which files to modify for your task
- [ ] Understand testing patterns and requirements

### **During Development**

- [ ] Follow established code patterns
- [ ] Use existing services and infrastructure
- [ ] Write comprehensive tests with proper isolation
- [ ] Respect security and encryption requirements

### **Before Completing**

- [ ] All tests pass (unit and E2E)
- [ ] TypeScript builds without errors
- [ ] No real API calls in tests
- [ ] Security considerations addressed
- [ ] Documentation updated if needed

---

## 🎉 Final Notes

**Remember**: Miauflix is a sophisticated, production-ready streaming platform with complete authentication and streaming functionality. The backend infrastructure is enterprise-grade and the frontend is fully integrated. Focus on feature expansion and user experience enhancements.

**When in doubt**: Check the actual implementation in `backend/src/services/` - most things are already built and working. Trust the codebase over outdated documentation.

**Success means**: Platform is production-ready with complete streaming and authentication functionality. Focus on feature expansion and enhancements.

---

_Built with 🤖 for AI agents working on the Miauflix streaming platform_
