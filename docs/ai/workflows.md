# 🔄 Development Workflows for AI Assistants

> **PURPOSE**: Step-by-step instructions for common development tasks in the Miauflix codebase.

## 🎯 **Critical Missing Features (Priority Tasks)**

### 1. **Implement Stream Endpoint** (Blocks Video Playback)

**Location**: `backend/src/routes/stream.routes.ts` (create new file)

```typescript
// Step 1: Create stream routes file
import { Hono } from 'hono';
import { authMiddleware } from '@middleware/auth.middleware';
import { DownloadService } from '@services/download/download.service';

const routes = new Hono();

routes.get('/:sourceId', authMiddleware, async c => {
  const { sourceId } = c.req.param();
  const downloadService = new DownloadService(); // Already implemented

  // Use existing media streaming infrastructure
  const stream = await downloadService.getStreamForSource(sourceId);

  // Set appropriate headers for video streaming
  c.header('Content-Type', 'video/mp4');
  c.header('Accept-Ranges', 'bytes');

  return c.stream(stream);
});

export default routes;
```

```typescript
// Step 2: Register in main routes (backend/src/routes/index.ts)
import streamRoutes from './stream.routes';

app.route('/stream', streamRoutes);
```

**Note**: DownloadService already has peer-to-peer streaming client - just need to expose streaming endpoint.

### 2. **Fix Frontend Build Issues**

**Current Problems**: TypeScript errors, build failures

```bash
# Step 1: Identify errors
cd frontend
npm run type-check

# Step 2: Common fixes needed
# - Missing type imports
# - Component prop type mismatches
# - Redux store type issues

# Step 3: Test build
npm run build
```

### 3. **Implement Frontend JWT Authentication**

**Missing Files to Create**:

```typescript
// frontend/src/store/api/auth.ts
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

export const authApi = createApi({
  reducerPath: 'authApi',
  baseQuery: fetchBaseQuery({ baseUrl: '/api/auth' }),
  endpoints: builder => ({
    login: builder.mutation<LoginResponse, LoginRequest>({
      query: credentials => ({
        url: '/login',
        method: 'POST',
        body: credentials,
      }),
    }),
    refresh: builder.mutation<TokenResponse, void>({
      query: () => ({
        url: '/refresh',
        method: 'POST',
      }),
    }),
  }),
});
```

```typescript
// frontend/src/store/slices/auth.ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface AuthState {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
}

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setToken: (state, action: PayloadAction<string>) => {
      state.token = action.payload;
      state.isAuthenticated = true;
    },
    logout: state => {
      state.token = null;
      state.user = null;
      state.isAuthenticated = false;
    },
  },
});
```

## 🔧 **Adding New Features**

### **Add New API Endpoint**

```bash
# 1. Create route file
touch backend/src/routes/[feature].routes.ts

# 2. Implement route
# Follow pattern from auth.routes.ts or movie.routes.ts

# 3. Add business logic to service
# Edit backend/src/services/[service]/[service].service.ts

# 4. Register route
# Edit backend/src/routes/index.ts

# 5. Add authentication if needed
# Import and use authMiddleware

# 6. Test
npm test --workspace backend
npm run test:backend:e2e
```

### **Add New Database Entity**

```bash
# 1. Create entity
touch backend/src/entities/[entity-name].entity.ts

# 2. Create repository
touch backend/src/repositories/[entity-name].repository.ts

# 3. Add entity to database.ts entities array
# Edit backend/src/database/database.ts

# 4. Schema automatically syncs (synchronize: true)
# No manual migrations needed

# 5. Test changes
npm test --workspace backend

# 6. Update related services to use new entity
```

### **Add New Content Provider**

```bash
# 1. Create content provider directory
mkdir backend/src/content-directories/[provider-name]

# 2. Create required files
touch backend/src/content-directories/[provider-name]/index.ts
touch backend/src/content-directories/[provider-name]/[provider-name].api.ts
touch backend/src/content-directories/[provider-name]/[provider-name].types.ts
touch backend/src/content-directories/[provider-name]/[provider-name].utils.ts
touch backend/src/content-directories/[provider-name]/[provider-name].api.test.ts

# 3. Implement following YTS/THERARBG pattern

# 4. Register in source service
# Edit backend/src/services/source-metadata/content-directory.service.ts

# 5. Add to aggregation
# Edit backend/src/services/source/source.service.ts

# 6. Create test fixtures
npm test --workspace backend -- [provider-name].api.test.ts
```

## 🧪 **Testing Workflows**

### **Running Tests**

```bash
# Backend unit tests (fast)
npm test --workspace backend

# Backend E2E tests (comprehensive, slower)
npm run test:backend:e2e

# Specific test file
npm test --workspace backend -- auth.service.test.ts

# Source metadata package tests
npm test --workspace=packages/source-metadata-extractor
```

### **E2E Development Workflow**

```bash
# Start E2E environment (background)
npm run start:backend:e2e

# Run development tests (repeat as needed)
npm run test:backend:e2e:dev

# Clean up when done
npm run docker:cleanup
```

### **Adding New Tests**

```typescript
// Unit test pattern
describe('ServiceName', () => {
  let service: ServiceName;

  beforeEach(() => {
    service = new ServiceName();
  });

  it('should handle normal case', async () => {
    const result = await service.method();
    expect(result).toBeDefined();
  });
});
```

## 🚀 **Deployment & Environment**

### **Local Development Setup**

```bash
# Install dependencies
npm install

# Setup environment
npm run start:backend  # Interactive configuration wizard

# Start with Docker
docker-compose up

# Start development servers
npm run dev --workspace backend
npm run dev --workspace frontend
```

### **Environment Configuration**

```bash
# Required environment variables
TMDB_API_ACCESS_TOKEN=your_token
JWT_SECRET=your_secret

# Optional
TRAKT_CLIENT_ID=your_client_id
NORDVPN_PRIVATE_KEY=your_key
```

## 🔍 **Debugging Common Issues**

### **Backend Won't Start**

- Check environment variables in configuration wizard
- Verify database permissions
- Check Docker container logs

### **Tests Failing**

- Run `npm run docker:cleanup` to reset E2E environment
- Check test fixtures in `backend/test-fixtures/`
- Verify no real API calls in tests

### **Frontend Build Errors**

- Run `npm run type-check` to see TypeScript errors
- Check import paths and type definitions
- Verify Redux store configuration

### **Database Issues**

- Database uses `synchronize: true` - no migrations
- Reset database: Delete files in `backend/data/`
- Schema rebuilds automatically on next startup

## 📊 **Performance Considerations**

- **Background tasks run continuously** - E2E environment supports hot reloading, production requires rebuild/redeploy
- **Cache extensively used** - check cache patterns in existing services
- **Rate limiting active** - respect external API limits
- **Database encryption** - sensitive data automatically encrypted
- **Media streaming client** - handles peer-to-peer delivery, don't rebuild

---

**Remember**: Most infrastructure is already built and working. Focus on the 2 missing pieces (stream endpoint, frontend JWT) rather than rebuilding existing systems.
