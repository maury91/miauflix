# ⚠️ Critical Gotchas for AI Assistants

> **PURPOSE**: Avoid these pitfalls to prevent breaking the codebase or wasting time.

## 🚨 **Dependency Management**

### ❌ **NEVER install dependencies in workspace directories**

```bash
# DON'T DO THIS:
cd backend && npm install package-name       # BREAKS WORKSPACE
cd frontend && npm install package-name      # BREAKS WORKSPACE
```

### ✅ **ALWAYS install from root with workspace flag**

```bash
# DO THIS:
npm install --workspace backend package-name
npm install --workspace frontend package-name
```

**Why**: Project uses npm workspaces. Installing directly in subdirs breaks dependency resolution.

## 🧪 **Testing Constraints**

### ❌ **NEVER make real API calls in tests**

- Tests use HTTP-VCR fixtures (pre-recorded responses)
- Making real calls will break CI and violate rate limits
- Tests must be deterministic and work offline

### ✅ **Use existing fixtures or record new ones properly**

```bash
# To update fixtures, run specific test file:
npm test --workspace backend -- yts.api.test.ts
```

### 🚨 **Critical Testing Gotchas**

#### ❌ **DON'T use shared state between tests**

```typescript
// WRONG - Shared service instance leads to race conditions
describe('Service', () => {
  let service: Service; // ❌ Shared state

  beforeEach(() => {
    service = new Service(); // ❌ Tests can interfere with each other
  });
});
```

#### ✅ **ALWAYS use setupTest() pattern for test isolation**

```typescript
// CORRECT - Fresh instances prevent race conditions
const setupTest = () => {
  const mockRepository = new Repository({} as never) as jest.Mocked<Repository>;
  const service = new Service(mockRepository);
  return { service, mockRepository };
};

it('should work', async () => {
  const { service, mockRepository } = setupTest(); // ✅ Fresh state
});
```

#### ❌ **DON'T put jest.mock() inside describe blocks**

```typescript
// WRONG - Mocks won't be hoisted properly
describe('Service', () => {
  jest.mock('@services/external.service'); // ❌ Too late, won't work
});
```

#### ✅ **ALWAYS put jest.mock() at the top of the file**

```typescript
// CORRECT - Mocks are hoisted before any imports
jest.mock('@services/external.service'); // ✅ At file top

import { Service } from './service'; // ✅ After mocks
```

#### ⚠️ **Mock module paths must be exact**

- Use exact TypeScript paths: `@services/auth/auth.service`
- Relative paths won't work reliably
- Check existing working test files for correct paths

#### 🎯 **Faker seed is critical for reproducible tests**

```typescript
// REQUIRED for reproducible random data
beforeAll(() => {
  configureFakerSeed(); // ✅ Must call this
});
```

#### ❌ **DON'T forget to clean up timers in async tests**

```typescript
// WRONG - Timers leak between tests
it('should timeout', async () => {
  jest.useFakeTimers(); // ❌ Not cleaned up
  // test code...
});
```

#### ✅ **ALWAYS clean up timers**

```typescript
// CORRECT - Proper timer cleanup
beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers(); // ✅ Clean up
});
```

## 🗄️ **Database Safety**

### ⚠️ **Database uses TypeORM synchronize mode**

- Database schema automatically syncs with entity changes (`synchronize: true`)
- No migrations system - TypeORM handles schema updates automatically
- Changes to entities immediately affect database structure

### ✅ **Safe entity modifications**

- Adding new optional fields: Safe
- Renaming fields: Will lose existing data
- Removing fields: Will lose existing data
- Changing field types: May cause data loss

### 🚨 **For production changes**

- Test entity changes thoroughly in development
- Consider data migration scripts for destructive changes
- Backup database before major entity modifications

## 🔄 **Background Tasks Are Live**

### ⚠️ **7 background tasks run continuously**

- Movie source search (0.1s intervals)
- Source metadata processing (0.2s intervals)
- Stats updates (2s intervals)
- List sync (1h intervals)
- Movie metadata sync (1.5h intervals)

**Impact**:

- **E2E environment** (`npm run start:backend:e2e`): Supports hot reloading, changes affect running tasks
- **Production**: Tasks run in Docker containers, require rebuild/redeploy to update

## 🎯 **Frontend Build Issues**

### ✅ **Frontend builds successfully**

- Build currently passes
- No TypeScript errors
- Frontend is ready for feature development

### ✅ **Verify build status before adding features**

```bash
npm run build -w frontend  # Verify build status
```

## 🔒 **Security Constraints**

### ❌ **DON'T hardcode secrets or API keys**

- Use environment variables only
- Follow existing configuration.ts pattern
- Never commit .env files

### ⚠️ **VPN detection is active**

- Backend detects if VPN is running
- Some features may behave differently without VPN
- NordVPN integration is production-ready

## 📁 **File Organization Patterns**

### ❌ **DON'T break established patterns**

```bash
# Existing patterns:
services/[service-name]/[service-name].service.ts
routes/[feature].routes.ts
entities/[entity-name].entity.ts
repositories/[entity-name].repository.ts
```

### ✅ **Follow existing conventions**

- Services handle business logic
- Routes handle HTTP endpoints
- Repositories handle database queries
- Entities define database schema

## 🐳 **Docker Development**

### ⚠️ **Hot reload varies by environment**

- **E2E environment** (`start:backend:e2e`): Supports hot reload, watches for changes
- **Production Docker**: No hot reload, requires container restart
- **Regular Docker Compose**: No hot reload, restart needed

### ✅ **Use proper development workflow**

```bash
# For backend changes:
npm run test:backend                    # Unit tests (fast)
npm run test:backend:e2e               # Full E2E (slower)

# For Docker E2E development:
npm run start:backend:e2e              # Start environment
npm run test:backend:e2e:dev           # Run specific tests
npm run docker:cleanup                 # Clean up when done
```

## 🌐 **API Integration**

### ❌ **DON'T assume external APIs are always available**

- TMDB API has rate limits
- YTS mirrors can be unreliable
- Trakt.tv has OAuth requirements

### ✅ **Follow existing error handling patterns**

- Check existing services for retry logic
- Use exponential backoff for external calls
- Handle timeouts gracefully

## 📚 **Documentation Accuracy**

### ⚠️ **Previous documentation was massively outdated**

- Todo lists marked complete features as incomplete
- Implementation status was wrong by ~90%
- Always verify against actual codebase

### ✅ **Trust codebase over documentation**

- If docs contradict code, code is usually correct
- Check actual file implementation before assuming something needs to be built

---

**Golden Rule**: When in doubt, check the actual implementation in `backend/src/services/` - most things are already built and working.
