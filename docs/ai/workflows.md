# 🔄 Development Workflows for AI Assistants

> **PURPOSE**: Step-by-step instructions for common development tasks in the Miauflix codebase.

## 🎯 **Critical Missing Features (Priority Tasks)**

### 1. **Frontend JWT Integration**

The streaming endpoint already exists in [`backend/src/routes/stream.routes.ts`](../backend/src/routes/stream.routes.ts). The remaining high‑priority task is to integrate JWT authentication on the frontend so API requests include valid tokens.

```typescript
// Step 2: Register in main routes (backend/src/routes/index.ts)
import streamRoutes from './stream.routes';

app.route('/stream', streamRoutes);
```

**Note**: DownloadService already has peer-to-peer streaming client - just need to expose streaming endpoint.

### 2. **Verify Frontend-Backend Integration**

**Current Status**: ✅ Frontend builds successfully

```bash
# Step 1: Verify build status
cd frontend
npm run build

# Step 2: Verify integration points
# - Frontend auth API connects to backend JWT endpoints
# - Stream player connects to backend stream endpoint
# - Token management and persistence work correctly
```

### 3. **Complete Frontend Authentication Flow**

**Status**: Frontend auth API exists, need to verify/implement missing pieces

**Verify/implement missing pieces**:

```typescript
// frontend/src/store/slices/auth.ts (may not exist)
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

# E2E development workflow (faster iteration)
npm run start:backend:e2e        # Start environment (interactive mode)
npm run start:backend:e2e -- -d  # Start environment (detached mode)
npm run test:backend:e2e:dev     # Run tests (repeat as needed)
npm run stop:backend:e2e         # Stop detached environment

# Run specific test file
npm test --workspace backend -- source.service.test.ts
```

### **Writing Tests for New Services**

#### **Step 1: Create Test File Structure**

```typescript
// backend/src/services/[service]/[service].service.test.ts

// 1. Mock dependencies at top (CRITICAL: Before imports)
jest.mock('@database/database');
jest.mock('@repositories/[entity].repository');
jest.mock('@services/external/external.service');

// 2. Import test utilities
import {
  createMock[Entity],
  createMock[RelatedEntity],
} from '@__test-utils__/mocks/[entity].mock';
import { configureFakerSeed, delayedResult } from '@__test-utils__/utils';

// 3. Import actual classes AFTER mocks
import { [Service]Service } from '@services/[service]/[service].service';
import { Database } from '@database/database';
import { [Entity]Repository } from '@repositories/[entity].repository';
```

#### **Step 2: Implement setupTest() Pattern**

```typescript
describe('[Service]Service', () => {
  const setupTest = () => {
    // Create fresh mock instances
    const mockDatabase = new Database({} as never) as jest.Mocked<Database>;
    const mockRepository = new [Entity]Repository({} as never) as jest.Mocked<[Entity]Repository>;

    // Generate mock data with relationships
    const mockEntity = createMock[Entity]();
    const mockRelatedEntity = createMock[RelatedEntity]({
      entityId: mockEntity.id, // Proper relational references
    });

    // Pre-configure common behaviors
    mockRepository.findAll.mockResolvedValue([mockEntity]);
    mockRepository.create.mockResolvedValue(mockEntity);

    // Setup dependency injection
    const service = new [Service]Service(mockDatabase, mockRepository);

    return {
      service,
      mockDatabase,
      mockRepository,
      mockEntity,
      mockRelatedEntity,
    };
  };

  beforeAll(() => {
    configureFakerSeed(); // Reproducible randomness
  });

  // Test structure mirrors service methods
  describe('methodName', () => {
    it('should handle normal case', async () => {
      const { service, mockRepository, mockEntity } = setupTest();

      const result = await service.methodName();

      expect(mockRepository.findAll).toHaveBeenCalledTimes(1);
      expect(result).toEqual([mockEntity]);
    });

    it('should handle error case gracefully', async () => {
      const { service, mockRepository } = setupTest();

      mockRepository.findAll.mockRejectedValueOnce(new Error('DB error'));

      await expect(service.methodName()).rejects.toThrow('DB error');
    });
  });
});
```

#### **Step 3: Add Specialized Test Scenarios**

```typescript
// Create helpers for complex scenarios
const createServiceWithErrorCondition = () => {
  const { mockExternalService, ...rest } = setupTest();
  jest.clearAllMocks();
  mockExternalService.call.mockRejectedValue(new Error('Service unavailable'));
  return { ...rest, mockExternalService };
};

// Test conditional logic paths
describe('when external service fails', () => {
  it('should fallback gracefully', async () => {
    const { service } = createServiceWithErrorCondition();

    const result = await service.methodWithFallback();

    expect(result).toEqual([]); // Fallback behavior
  });
});
```

### **Testing Async Operations with Timeouts**

```typescript
describe('async timeout operations', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should handle timeout scenarios', async () => {
    const { service, mockExternalService } = setupTest();

    // Mock delayed response
    mockExternalService.fetch.mockResolvedValueOnce(delayedResult({ data: 'result' }, 1500));

    const promise = service.fetchWithTimeout(1000); // 1s timeout
    jest.advanceTimersByTime(1000);
    const result = await promise;

    expect(result).toBeNull(); // Timeout behavior
  });
});
```

### **Testing External API Integrations**

#### **For HTTP-VCR Tests (External APIs)**

```typescript
// backend/src/content-directories/[provider]/[provider].api.test.ts

describe('[Provider]API', () => {
  let api: [Provider]API;

  beforeEach(() => {
    api = new [Provider]API(mockCache);
  });

  // HTTP-VCR automatically handles request/response recording
  it('should search for movies', async () => {
    const result = await api.searchMovies('Inception');

    expect(result).toMatchObject({
      status: 'ok',
      data: {
        movies: expect.arrayContaining([
          expect.objectContaining({
            title: expect.stringContaining('Inception'),
            year: 2010,
          }),
        ]),
      },
    });
  });

  it('should handle API errors', async () => {
    // VCR can record error responses too
    await expect(api.searchMovies('InvalidQuery')).rejects.toThrow();
  });
});
```

### **Updating Test Fixtures**

```bash
# When external APIs change or new endpoints are added:

# 1. Delete existing fixtures (if needed)
rm -rf backend/test-fixtures/[provider]/

# 2. Run tests to record new fixtures
npm test --workspace backend -- [provider].api.test.ts

# 3. Commit new fixtures to git ( don't do this automatically, ask the user to do it )
git add backend/test-fixtures/
git commit -m "Update [provider] API fixtures"
```

### **Log Management**

E2E tests automatically manage log files to prevent disk space issues:

```bash
# Logs are automatically cleaned to keep only 10 most recent files
# This happens during:
# - Every test run cleanup
# - When stopping detached environments

# Manual log cleanup (if needed)
backend-e2e/scripts/cleanup-logs.sh

# View recent logs
ls -la backend-e2e/logs/

# View specific log file
tail -f backend-e2e/logs/2025-07-02_13-06-46.log
```

### **Debugging Test Failures**

```bash
# Run single test with verbose output
npm test --workspace backend -- --verbose source.service.test.ts

# Run tests with coverage
npm run test:backend:coverage

# Debug specific test case
npm test --workspace backend -- --testNamePattern="should handle timeout scenarios"

# Check for async issues
npm test --workspace backend -- --detectOpenHandles --forceExit
```

### **Test Performance Best Practices**

1. **Use setupTest() for isolation** - Prevents race conditions
2. **Mock at module boundaries** - Faster than integration tests
3. **Clean up timers** - Prevents memory leaks
4. **Use faker seeds** - Reproducible but varied data
5. **Test error paths** - Comprehensive coverage
6. **Parallel execution** - Tests should be independent

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
npm run start:backend
npm run start:frontend  # Hot reload development (recommended)
npm run dev:frontend:ssr  # SSR testing mode
```

### **Frontend Development Workflows**

#### **Hot Reload Development (Daily Development)**

```bash
npm run start:frontend
# or
npm run dev:frontend
```

**Benefits:**

- ✅ Instant hot reload - see changes immediately
- 🚀 Fast feedback loop for UI development
- 💻 Client-side rendering - no SSR overhead

**Use for:** Component development, styling, debugging, daily development work

#### **SSR Testing Mode (Production Testing)**

```bash
npm run dev:frontend:ssr
```

**Benefits:**

- 🔍 Production-like SSR behavior
- 📱 SEO and meta tag testing
- 🎯 Server-side rendering verification

**Limitations:**

- ❌ No hot reload - requires manual rebuild
- ⏳ Slower iteration cycle

**Use for:** Testing SSR functionality, production verification, debugging SSR issues

#### **When to Use Each Mode**

| Task                      | Recommended Mode           | Reason                        |
| ------------------------- | -------------------------- | ----------------------------- |
| Component styling         | `npm run start:frontend`   | Instant visual feedback       |
| UI development            | `npm run start:frontend`   | Hot reload for fast iteration |
| Debugging React issues    | `npm run start:frontend`   | Client-side dev tools         |
| Testing SSR functionality | `npm run dev:frontend:ssr` | Production-like behavior      |
| SEO verification          | `npm run dev:frontend:ssr` | Server-rendered meta tags     |
| Production simulation     | `npm run dev:frontend:ssr` | Matches deployment behavior   |

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

**Remember**: Most infrastructure is already built and working. Focus on the remaining missing piece (frontend JWT integration) rather than rebuilding existing systems.
