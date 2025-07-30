# 🤖 AI Agent Documentation

> **PURPOSE**: Essential information for AI assistants working on the Miauflix-Bun project.

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

- `AuthService` - JWT authentication with refresh tokens
- `SourceService` - Multi-provider torrent source aggregation
- `DownloadService` - WebTorrent client management
- `MediaService` - TMDB integration and episode sync management

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

- ✅ **Authentication**: Full JWT system with refresh tokens
- ✅ **Source Discovery**: Multi-provider aggregation (YTS + THERARBG)
- ✅ **Media Streaming**: WebTorrent infrastructure with stream endpoint
- ✅ **Database Layer**: 13 entities with encryption
- ✅ **Background Tasks**: 7 scheduled tasks operational

### **Frontend Status: Authentication Implemented**

- ✅ **JWT Authentication**: Complete auth API with login, device auth, and token management
- ✅ **Login Components**: LoginPage, LoginForm, DeviceLogin components exist
- ✅ **Auth Store**: Redux store with auth API and slices
- ✅ **Frontend Build**: No TypeScript errors

### **What's Actually Missing**

Based on current verification, the project appears to be **fully functional** with both backend and frontend authentication implemented. The main areas for improvement would be:

1. **Frontend Re-implementation**: Frontend builds but it's not up-to-date with the backend, functionality needs to be restored
2. **Frontend Polish**: UI/UX improvements and bug fixes
3. **Performance Optimization**: Caching, lazy loading, etc.
4. **Feature Enhancements**: Additional streaming features, better error handling
5. **Documentation**: Keeping docs synchronized with implementation

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

**Remember**: The ENV function is your friend! It provides type safety, validation, and clear error messages. Always use it instead of direct `process.env` access.
