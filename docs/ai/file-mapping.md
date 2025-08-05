# 🗺️ File Mapping Quick Reference

> **PURPOSE**: Instantly know which files to modify for different development tasks.

## 🎯 **Common Development Tasks**

### 🚪 **Adding New API Endpoints**

```bash
# 1. Define the route
backend/src/routes/[feature].routes.ts

# 2. Add business logic
backend/src/services/[service]/[service].service.ts

# 3. Add authentication if needed
backend/src/middleware/auth.middleware.ts

# 4. Register route in main app
backend/src/routes/index.ts
```

**Example**: Adding `/api/stream/:sourceId`

- Add to `backend/src/routes/stream.routes.ts` (create new file)
- Business logic in `backend/src/services/download/download.service.ts` (already exists)
- Register in `backend/src/routes/index.ts`

### 🗄️ **Database Changes**

```bash
# 1. Modify entity
backend/src/entities/[entity-name].entity.ts

# 2. Update repository if needed
backend/src/repositories/[entity-name].repository.ts

# 3. Schema automatically syncs (synchronize: true)
# No manual migrations needed - TypeORM handles schema updates

# 4. Test changes thoroughly
npm test --workspace backend
```

### 🎨 **Frontend Changes**

```bash
# New page/screen
frontend/src/app/pages/[page-name]/

# Reusable components
frontend/src/app/components/

# State management
frontend/src/store/slices/[feature].ts

# API calls
frontend/src/store/api/[api-name].ts

# Types
frontend/src/types/[feature].ts
```

### 🔒 **Authentication Changes**

```bash
# Backend JWT logic
backend/src/services/auth/auth.service.ts           # Core auth logic (complete)
backend/src/middleware/auth.middleware.ts           # Route protection (complete)

# Frontend auth integration (MISSING - needs implementation)
frontend/src/store/api/auth.ts                     # API calls
frontend/src/store/slices/auth.ts                  # Auth state
frontend/src/app/pages/login/                      # Login UI
```

### 🔍 **Adding New Content Providers**

```bash
# 1. Create content provider implementation
backend/src/content-directories/[provider-name]/
├── index.ts                    # Main content directory class
├── index.test.ts               # Main content directory tests
├── [provider-name].api.ts      # API client
├── [provider-name].api.test.ts # API client tests
├── [provider-name].types.ts    # Type definitions
└── [provider-name].utils.ts    # Helper functions

# 2. Register content provider
backend/src/services/source-metadata/content-directory.service.ts

# 3. Add to source service
backend/src/services/source/source.service.ts
```

## 📊 **By Feature Area**

### **Authentication (95% Complete)**

- `backend/src/services/auth/` - JWT generation, password hashing
- `backend/src/middleware/auth.middleware.ts` - Route protection
- `backend/src/entities/user.entity.ts` - User model
- `backend/src/entities/refresh-token.entity.ts` - Token storage

**Missing**: Frontend integration

### **Source Discovery (100% Complete)**

- `backend/src/services/source/source.service.ts` - Main aggregation logic
- `backend/src/content-directories/yts/` - YTS content provider integration
- `backend/src/content-directories/therarbg/` - THERARBG content provider integration
- `backend/src/entities/movie-source.entity.ts` - Source storage

### **Media Management (100% Complete)**

- `backend/src/services/media/` - TMDB integration
- `backend/src/entities/movie.entity.ts` - Movie model
- `backend/src/entities/genre.entity.ts` - Genre categorization
- `backend/src/services/trakt/` - Trakt.tv integration

### **Streaming (Implemented)**

- `backend/src/services/download/download.service.ts` - WebTorrent client (complete)
- `backend/src/routes/stream.routes.ts` - Streaming endpoint implementation
- `frontend/src/app/pages/player/` - Video player UI (connects to backend)

## 🔧 **Configuration & Environment**

```bash
# Environment variables
.env                                    # Main config file
backend/src/configuration.ts           # Interactive setup system

# Docker setup
docker-compose.yml                      # Main orchestration
backend.Dockerfile                     # Backend container
nginx/conf.d/default.conf.template     # Web server config
```

## 🧪 **Testing Files**

### **Unit Tests (Enterprise Pattern)**

```bash
# Service tests (follow source.service.test.ts pattern)
backend/src/services/[service]/[service].service.test.ts

# Repository tests
backend/src/repositories/[entity].repository.test.ts

# API client tests (HTTP-VCR)
backend/src/content-directories/[provider]/[provider].api.test.ts

# Utility tests
backend/src/utils/[utility].test.ts
```

### **E2E Tests**

```bash
# Integration tests
backend-e2e/src/tests/

# E2E configuration
backend-e2e/src/config/
```

### **Test Infrastructure**

```bash
# Mock factories (centralized, faker-based)
backend/src/__test-utils__/mocks/
├── movie.mock.ts           # Movie/source mock factories
├── user.mock.ts            # User/auth mock factories
└── [entity].mock.ts        # Entity-specific factories

# Test utilities
backend/src/__test-utils__/
├── utils.ts                # configureFakerSeed, delayedResult helpers
├── http-vcr.ts            # HTTP recording system
└── http-vcr.config.ts     # VCR configuration

# HTTP-VCR fixtures (pre-recorded API responses)
backend/test-fixtures/
├── tmdb/                  # TMDB API responses
├── yts/                   # YTS API responses
├── therarbg/              # THERARBG API responses
└── torrage/               # Source file download responses
```

### **Testing Patterns to Follow**

#### **Service Tests (✅ Use This Pattern)**

```bash
# Location: backend/src/services/[service]/[service].service.test.ts
# Pattern: Follow source.service.test.ts exactly
# Features:
# - jest.mock() at top
# - setupTest() for isolation
# - Faker with seeds for data
# - Auto-generated type-safe mocks
# - Comprehensive error testing
# - Async timeout testing
```

#### **API Tests (✅ Use HTTP-VCR)**

```bash
# Location: backend/src/content-directories/[provider]/[provider].api.test.ts
# Pattern: Follow yts.api.test.ts
# Features:
# - Automatic HTTP recording/replay
# - No manual mocking needed
# - Real API response testing
# - Fixture management included
```

#### **Mock Data (✅ Use Factories)**

```bash
# Location: backend/src/__test-utils__/mocks/[entity].mock.ts
# Pattern: Follow movie.mock.ts
# Features:
# - Faker-generated realistic data
# - Configurable overrides
# - Proper relational references
# - Seeded for reproducibility
```

## 🚨 **Emergency File Locations**

### **If something breaks:**

- **Logs**: Check Docker container logs
- **Database**: `backend/data/` (SQLite files)
- **Config**: `backend/src/configuration.ts` (interactive setup)
- **Main app**: `backend/src/app.ts` (application startup)

### **If tests fail:**

- **Backend tests**: `npm test --workspace backend`
- **E2E tests**: `npm run test:backend:e2e`
- **Fixtures**: `backend/test-fixtures/` (pre-recorded responses)

---

**Quick Rule**: If you're unsure where something goes, look for similar existing functionality in the codebase - the patterns are very consistent.
