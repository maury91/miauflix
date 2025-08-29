# 🧠 Project Context for AI Assistants

> **CRITICAL**: Read this before making any code changes. Contains essential project status info.

## Implementation Status

**DO NOT rebuild these systems:**

- **Authentication**: Full JWT system with refresh tokens (AuthService: 325 lines, ~15 methods)
- **Source Discovery**: Multi-provider content aggregation (YTS + THERARBG) with background processing
- **Media Streaming Infrastructure**: Complete client with peer-to-peer networking (DownloadService)
- **Database Layer**: 13 entities with AES-256-GCM encryption, complete repository pattern
- **Background Tasks**: 7 scheduled tasks running continuously (0.1s - 5s intervals)
- **API Infrastructure**: All routes implemented, including streaming endpoint

### Frontend Status

- **Framework**: React + Redux Toolkit + Vite (well-structured)
- **Build Status**: Builds successfully (no TypeScript errors)
- **Authentication**: JWT access tokens + HttpOnly refresh token cookies
- **Integration**: Backend serves frontend, API mounted under `/api`

## 🎯 **What This Means for Development**

### **DO THIS** ✅

- Add new features and enhancements
- Optimize performance and user experience
- Extend functionality with additional streaming sources

### **DON'T DO THIS** ❌

- Rebuild authentication (already complete: JWT API auth + HttpOnly refresh cookies + streaming keys)
- Rebuild frontend integration (it's complete)
- Rebuild source aggregation (it's complete)
- Rebuild WebTorrent infrastructure (it's complete)
- Create new database entities (13 already exist)
- Rebuild background processing (7 tasks already running)

## 🏗️ **Architecture Quick Facts**

- **Backend**: Node.js + Hono framework + SQLite + TypeORM
- **Frontend**: React + Redux Toolkit + Vite
- **Deployment**: Docker + docker-compose + nginx
- **Media Streaming**: WebTorrent library for peer-to-peer delivery
- **Auth**: JWT tokens with JOSE library
- **Database**: SQLite with field-level encryption

## 📈 **Project Timeline Reality**

- **Previous estimates**: "Months of infrastructure work needed"
- **Actual status**: Production-ready streaming platform
- **Key insight**: Documentation was severely outdated vs implementation
- **Current state**: Fully functional with backend serving frontend

## 🔍 **Key Service Files (All Complete)**

```typescript
// These are production-ready, don't rebuild:
backend/src/services/auth/auth.service.ts       // 325 lines, ~15 methods
backend/src/services/source/source.service.ts   // 464 lines
backend/src/services/download/download.service.ts // 587 lines
backend/src/services/media/                      // TMDB + Trakt integration
```

## 🎬 **Episode Sync Management (New Feature)**

### **Configuration**

- **Environment Variable**: `EPISODE_SYNC_MODE`
- **Values**: `GREEDY` (sync all episodes) or `ON_DEMAND` (sync only watched shows)
- **Default**: `ON_DEMAND`

### **How It Works**

1. **GREEDY Mode**: Background task syncs all incomplete seasons (original behavior)
2. **ON_DEMAND Mode**:
   - Shows are marked as "watching" when user accesses them
   - Background task only syncs episodes for shows where `watching: true`
   - Efficient tracking without heavy progress queries

### **Database Changes**

- **TVShow Entity**: Added `watching: boolean` field (default: false)
- **TVShowRepository**: Methods to manage watching status
- **MediaService**: Automatically marks shows as watching on access

### **Usage**

```bash
# Set sync mode
export EPISODE_SYNC_MODE=ON_DEMAND  # Default behavior
export EPISODE_SYNC_MODE=GREEDY     # Sync all episodes

# Background task automatically adapts to mode
```

## 🧪 **Testing Infrastructure**

- **E2E Tests**: Docker-based with mock services
- **Unit Tests**: Jest with comprehensive mocks
- **HTTP Fixtures**: Pre-recorded API responses (don't make real API calls in tests)
- **Commands**: `npm test --workspace backend`, `npm run test:e2e`, `npm run test:backend:e2e`, `npm run test:frontend:e2e`

## 🚨 **Critical Context for AI Assistants**

1. **Previous Documentation Was Wrong**: Massive 95%+ implementation was documented as "incomplete"
2. **Platform is Complete**: All core functionality implemented and integrated
3. **Background Tasks Active**: 7 tasks running every 0.1-5 seconds, system is live
4. **Frontend Fully Integrated**: Complete three-tier auth flow (JWT APIs, HttpOnly refresh, streaming keys)
5. **Stream Endpoint Implemented**: Streaming available at `/api/stream/:token` with separate auth system
6. **Architecture**: Backend serves frontend, API under `/api`, JWT for API auth, cookies for refresh only

---

**Bottom Line**: This is a complete, production-ready streaming platform with backend serving frontend and full authentication integration.
