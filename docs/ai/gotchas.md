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
npm test --workspace backend -- tmdb.api.test.ts
```

For browser and screenshot work, follow the repository's [E2E and CI Playbook](./e2e-ci-playbook.md). It covers the ordered CI lanes, offline API harnesses, and Linux versus macOS snapshot baselines.

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

- Backend initialization explicitly calls TypeORM schema synchronization after registered column renames (the DataSource option itself is `synchronize: false`)
- TypeORM synchronizes schema changes; ordered data migrations also run at startup (see below)
- Changes to entities immediately affect database structure

### 🔁 **Data migrations**

When existing rows must be rewritten (backfills, recomputed values), add a data migration instead of running it at boot:

- Write a `Migration` in `backend/src/database/migrations/` and append it to the `migrations` array in `index.ts`. Never edit, reorder or remove a released entry: a database's version (`migration_version` table) is its index into that array.
- `MigrationService.run()` runs every migration after the stored version, in order, right after the database is initialized and before any service starts. The version is saved after each step, and a failure stops startup.
- Each migration must be a no-op on an empty database (new installs run them all) and safe to run twice (a crash between finishing and saving the version reruns it).

### 🔒 **Encrypted columns**

Text that would reveal what is stored or watched (file paths, ffprobe output, searches, notification titles, "Notify me" requests) is encrypted with `encryptedText()` from `@utils/encrypted-column.util` and stored under a short name that does not describe it (`k`, `v`, `a`, `b`):

- Use `deterministic: true` only for columns that are looked up, compared with `In()` or part of a unique index; everything else uses a random IV.
- Repository `find`/`update`/`delete` conditions and inserts are encrypted for you. Raw SQL and query-builder parameters are not: pass `EncryptedColumns.encrypt(value, true)` and write the stored column name (`k`), since raw SQL and `orUpdate()` conflict lists use column names.
- A new encrypted column on existing data needs a `COLUMN_RENAMES` entry, a row in `ENCRYPTED_COLUMNS` and a migration that encrypts the old values, then rewrites the file (`VACUUM`): replaced plain text otherwise stays readable in freed pages.

### ✅ **Safe entity modifications**

- Adding new optional fields: Safe
- Renaming fields: Will lose existing data, unless the rename is listed in `COLUMN_RENAMES` (`backend/src/database/migrations/column-renames.ts`), which renames the column in place before `synchronize()`
- Removing fields: Will lose existing data
- Changing field types: May cause data loss

### 🚨 **For production changes**

- Test entity changes thoroughly in development
- Consider data migration scripts for destructive changes
- Backup database before major entity modifications

## 🔄 **Background Tasks Are Live**

### Queue schedules depend on configuration and service readiness

Recurring work is registered with Bunqueue, not a fixed set of seven polling loops. Backend schedules cover source discovery, metadata, availability checks, stats, lists, and maintenance. Catalog workers consume catalog scan and season-sync jobs; the backend coordinates their recurring schedules.

Inspect the [schedule coordinator](../../backend/src/services/background-job/service-schedule.coordinator.ts), [source schedules](../../backend/src/services/source/source.schedule.ts), and [catalog workers](../../services/media-catalog/src/workers/worker.ts) before assuming a task is active or relying on a particular interval. Disabled background work and unavailable services affect execution.

### 🎬 **Episode Sync Behavior**

#### **GREEDY Mode** (`EPISODE_SYNC_MODE=GREEDY`)

- Syncs all incomplete seasons for all shows
- Uses more catalog requests to cover the full set of incomplete seasons
- Good for complete episode libraries

#### **ON_DEMAND Mode** (`EPISODE_SYNC_MODE=ON_DEMAND`) - **Default**

- Only syncs episodes for shows marked as "watching"
- Shows automatically marked as watching when accessed via API
- Efficient resource usage, user-driven syncing
- Background task adapts automatically based on mode

**Impact**:

- **E2E environment** (`npm run start:backend:e2e`): Supports hot reloading, changes affect running tasks
- **Production**: Tasks run in Docker containers, require rebuild/redeploy to update

## 🎯 **Frontend Build Issues**

### Verify the current checkout

The frontend has implemented authentication, browsing, and playback. A documentation status is not a build result; run checks appropriate to the change.

### ✅ **Verify build status before adding features**

```bash
npm run build -w frontend  # Verify build status
```

## 🔒 **Security Constraints**

### ❌ **DON'T hardcode secrets or API keys**

- Use the managed configuration system and its service schemas; normal setup is through the browser
- Keep deployment/bootstrap settings in the documented environment configuration
- Never commit .env files

### ❌ **DON'T read or share `.env` contents**

- Treat `.env` files as off-limits for AI agents
- Never open, copy, or log sensitive configuration values
- Follow the configuration access pattern of the owning module: injected `ConfigService` in backend services, and the existing environment/configuration modules in each standalone service

### ⚠️ **VPN detection is active**

- The backend detector recognizes NordVPN-protected public IPs; it is not a detector for every VPN vendor
- Sources and downloads have VPN-aware behavior unless checks are explicitly disabled
- The supplied Gluetun deployment provides the tunnel/firewall; application checks do not replace that firewall

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
npm run test:e2e                        # Full E2E (slower)
npm run test:backend:e2e                # Backend E2E only

# For frontend changes:
npm run test:frontend:e2e               # Frontend E2E only

# For Docker E2E development:
npm run start:backend:e2e              # Start environment
npm run test:backend:e2e:dev           # Run specific tests
npm run docker:cleanup                 # Clean up when done
```

## 🌐 **API Integration**

### ❌ **DON'T assume external APIs are always available**

- TMDB API has rate limits
- Indexer websites can be unreliable or rate limit
- Trakt.tv has OAuth requirements

### ✅ **Follow existing error handling patterns**

- Check existing services for retry logic
- Use exponential backoff for external calls
- Handle timeouts gracefully

## 📚 **Documentation Accuracy**

### ✅ **Trust codebase over documentation**

- If docs contradict code, code is usually correct
- Check actual file implementation before assuming something needs to be built

---

**Golden Rule**: When in doubt, check the actual implementation in `backend/src/services/` - most things are already built and working.
