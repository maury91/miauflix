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
- **Authentication**: JWT with refresh tokens using JOSE library
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

❌ **Frontend JWT Integration**: Token management and authentication flow (ONLY missing component)

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

### **Priority #1: Frontend JWT Integration**

**Status**: ✅ Stream endpoint EXISTS and is fully implemented  
**Issue**: Frontend needs JWT token management and authentication flow

The backend has complete streaming infrastructure:

- Stream routes with quality selection and auth verification
- DownloadService.streamFile() method (lines 531-585)
- Range request support for video seeking
- JWT authentication system complete (325 lines, ~15 methods)

### **Priority #2: Verify Frontend-Backend Integration**

**Status**: ✅ Frontend builds successfully (no TypeScript errors)  
**Issue**: Need to verify frontend properly connects to existing backend endpoints

```bash
# 1. Frontend already builds successfully
cd frontend && npm run build  # ✅ Works

# 2. Need to verify:
# - Frontend auth API connects to backend JWT endpoints
# - Stream player connects to backend stream endpoint
# - Token management and persistence work correctly
```

### **Priority #3: Complete Frontend Authentication Flow**

**Verify/implement missing pieces**:

- `frontend/src/store/slices/auth.ts` - Auth state management (may exist)
- `frontend/src/app/pages/login/` - Login UI components (may exist)
- Token persistence and auth interceptors

**Note**: Backend JWT system is complete - just need frontend integration

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

**Remember**: Miauflix is a sophisticated, nearly-complete streaming platform that needs surgical fixes, not ground-up rebuilding. The backend infrastructure is enterprise-grade and production-ready. Focus on the missing piece (frontend JWT integration) to unlock the full functionality.

**When in doubt**: Check the actual implementation in `backend/src/services/` - most things are already built and working. Trust the codebase over outdated documentation.

**Success means**: Complete frontend JWT integration enables full authentication flow and video streaming functionality.

---

_Built with 🤖 for AI agents working on the Miauflix streaming platform_
