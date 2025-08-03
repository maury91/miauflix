# 🧪 Testing Patterns & Best Practices

## **Critical Testing Rules**

### **1. jest.mock() MUST be at file top**

```typescript
// ✅ CORRECT - At file top before imports
jest.mock('@services/download/download.service');
jest.mock('@repositories/movie.repository');

import { DownloadService } from '@services/download/download.service';
// ... other imports

describe('Service', () => {
  // Tests here
});
```

```typescript
// ❌ WRONG - In describe block (hoisting issues)
describe('Service', () => {
  jest.mock('@services/external.service'); // ❌ Too late, won't work
});
```

### **2. ALWAYS Use setupTest() Pattern**

```typescript
// ✅ CORRECT - Prevents race conditions
const setupTest = () => {
  const mockRepository = new Repository({} as never) as jest.Mocked<Repository>;
  const service = new Service(mockRepository);
  return { service, mockRepository };
};

it('should work', async () => {
  const { service, mockRepository } = setupTest(); // ✅ Fresh state
});
```

### **3. ALWAYS Configure Faker Seed and Clean Timers**

```typescript
beforeAll(() => {
  configureFakerSeed(); // ✅ Required for reproducible tests
});

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers(); // ✅ Clean up timers
});
```

## **Mocking ENV Function**

```typescript
// Mock at file top
jest.mock('@constants', () => ({
  ENV: jest.fn(),
}));

// In test setup
const { ENV } = jest.requireMock('@constants');

// Mock specific values
ENV.mockImplementation((key: string) => {
  switch (key) {
    case 'EPISODE_SYNC_MODE':
      return 'ON_DEMAND';
    case 'PORT':
      return 3000;
    default:
      return 'default-value';
  }
});
```

## **Testing Commands**

```bash
# Run all backend tests
npm test --workspace backend

# Run specific test file
npm test --workspace backend -- --testPathPattern=media.service.test.ts

# Run E2E tests (spins up Docker environment)
npm run test:backend:e2e

# Development E2E workflow
npm run start:backend:e2e  # Start environment (background)
npm run test:backend:e2e:dev  # Run tests (repeat as needed)
```

## **Testing Constraints**

- ❌ **NEVER make real API calls in tests**
- ✅ **Use HTTP-VCR fixtures** (pre-recorded responses)
- ✅ **Tests must be deterministic and work offline**

## **Mocking External Services**

```typescript
// Mock external API calls
jest.mock('@services/external/tmdb.api');

const mockTMDBApi = {
  getTVShowDetails: jest.fn(),
  getMovieDetails: jest.fn(),
};

jest.mocked(TMDBApi).mockImplementation(() => mockTMDBApi as any);
```

## **Testing Database Operations**

```typescript
// Mock repositories
const mockRepository = {
  findOneBy: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
} as jest.Mocked<Repository<Entity>>;

// Mock database
const mockDb = {
  getTVShowRepository: () => mockRepository,
  getMovieRepository: () => mockRepository,
} as jest.Mocked<Database>;
```

## **Testing Background Tasks**

```typescript
// Mock scheduler
jest.mock('@services/scheduler/scheduler.service');

const mockScheduler = {
  addTask: jest.fn(),
  removeTask: jest.fn(),
  startTask: jest.fn(),
  stopTask: jest.fn(),
};

jest.mocked(SchedulerService).mockImplementation(() => mockScheduler as any);
```

## **Testing Error Scenarios**

```typescript
// Test error handling
it('should handle API errors gracefully', async () => {
  const { service, mockRepository } = setupTest();

  mockRepository.findOneBy.mockRejectedValue(new Error('Database error'));

  await expect(service.getEntity(1)).rejects.toThrow('Database error');
});
```

## **Testing Configuration Dependencies**

```typescript
// Test different configuration scenarios
describe('with different EPISODE_SYNC_MODE values', () => {
  it('should sync all shows in GREEDY mode', async () => {
    ENV.mockReturnValue('GREEDY');
    const { service } = setupTest();

    await service.syncIncompleteSeasons();

    expect(mockRepository.findIncompleteSeasons).toHaveBeenCalled();
  });

  it('should sync only watching shows in ON_DEMAND mode', async () => {
    ENV.mockReturnValue('ON_DEMAND');
    const { service } = setupTest();

    await service.syncIncompleteSeasons();

    expect(mockRepository.getWatchingTVShowIds).toHaveBeenCalled();
  });
});
```

## **Testing Async Operations**

```typescript
// Test async operations with proper timing
it('should handle async operations correctly', async () => {
  const { service } = setupTest();

  // Use fake timers for time-based tests
  jest.useFakeTimers();

  const promise = service.asyncOperation();

  // Fast-forward time
  jest.advanceTimersByTime(1000);

  await promise;

  jest.useRealTimers();
});
```

## **Testing File Operations**

```typescript
// Mock file system operations
jest.mock('fs/promises');

const mockFs = {
  readFile: jest.fn(),
  writeFile: jest.fn(),
  mkdir: jest.fn(),
  stat: jest.fn(),
};

jest.mocked(fs).mockImplementation(() => mockFs as any);
```

## **Testing HTTP Requests**

```typescript
// Mock fetch for HTTP requests
global.fetch = jest.fn();

beforeEach(() => {
  (fetch as jest.Mock).mockClear();
});

it('should make HTTP request', async () => {
  (fetch as jest.Mock).mockResolvedValueOnce({
    ok: true,
    json: async () => ({ data: 'test' }),
  });

  const result = await service.makeHttpRequest();

  expect(fetch).toHaveBeenCalledWith('https://api.example.com/data');
  expect(result).toEqual({ data: 'test' });
});
```

## **Testing Validation**

```typescript
// Test input validation
describe('input validation', () => {
  it('should reject invalid input', () => {
    expect(() => service.validateInput('')).toThrow('Input cannot be empty');
    expect(() => service.validateInput(null)).toThrow('Input is required');
  });

  it('should accept valid input', () => {
    expect(() => service.validateInput('valid')).not.toThrow();
  });
});
```

## **Testing Edge Cases**

```typescript
// Test edge cases and boundary conditions
describe('edge cases', () => {
  it('should handle empty arrays', async () => {
    const { service } = setupTest();
    mockRepository.find.mockResolvedValue([]);

    const result = await service.processItems();

    expect(result).toEqual([]);
  });

  it('should handle null values', async () => {
    const { service } = setupTest();
    mockRepository.findOneBy.mockResolvedValue(null);

    const result = await service.getEntity(999);

    expect(result).toBeNull();
  });
});
```

## **Performance Testing**

```typescript
// Test performance characteristics
it('should complete within reasonable time', async () => {
  const startTime = Date.now();

  await service.expensiveOperation();

  const duration = Date.now() - startTime;
  expect(duration).toBeLessThan(1000); // Should complete within 1 second
});
```

## **Integration Testing**

```typescript
// Test integration between components
it('should integrate with other services', async () => {
  const { service } = setupTest();

  // Mock dependencies
  mockAuthService.validateToken.mockResolvedValue(true);
  mockDatabaseService.connect.mockResolvedValue();

  const result = await service.processWithDependencies();

  expect(mockAuthService.validateToken).toHaveBeenCalled();
  expect(mockDatabaseService.connect).toHaveBeenCalled();
  expect(result).toBeDefined();
});
```

---

**Key Principles**:

1. **Isolation**: Each test should be independent
2. **Determinism**: Tests should always produce the same results
3. **Speed**: Tests should run quickly
4. **Clarity**: Test names should clearly describe what they test
5. **Coverage**: Test both happy path and error scenarios
