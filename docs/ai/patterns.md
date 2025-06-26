# 🏗️ Code Patterns & Conventions

> **PURPOSE**: Follow these patterns for consistent, maintainable code that fits the existing architecture.

## 📁 **File Organization Patterns**

### **Service Pattern**

```typescript
// backend/src/services/[service-name]/[service-name].service.ts
export class [ServiceName]Service {
  constructor(private dependency: Dependency) {}

  async method(): Promise<Result> {
    // Business logic here
  }
}
```

### **Route Pattern**

```typescript
// backend/src/routes/[feature].routes.ts
import { Hono } from 'hono';
import { authGuard } from '@middleware/auth.middleware';
import type { [Service]Service } from '@services/[service]/[service].service';

export const create[Feature]Routes = ([service]Service: [Service]Service) => {
  return new Hono()
    .get('/endpoint', authGuard(), async (c) => {
      // Handle request
      return c.json(result);
    })
    .post('/endpoint', authGuard(), async (c) => {
      // Handle request
      return c.json(result);
    });
};
```

### **Entity Pattern**

```typescript
// backend/src/entities/[entity-name].entity.ts
import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class [EntityName] {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  field: string;
}
```

## 🎯 **Naming Conventions**

### **Files**

- Services: `auth.service.ts`, `source.service.ts`
- Routes: `auth.routes.ts`, `movie.routes.ts`
- Entities: `user.entity.ts`, `movie.entity.ts`
- Tests: `auth.service.test.ts`, `yts.api.test.ts`

### **Classes**

- Services: `AuthService`, `SourceService`
- Entities: `User`, `Movie`, `MovieSource`
- Repositories: `UserRepository`, `MovieRepository`

### **Variables**

- camelCase: `movieTitle`, `userToken`
- Constants: `UPPERCASE_WITH_UNDERSCORES`
- Private fields: `private readonly api: TMDBApi`

## 🔒 **Authentication Patterns**

### **JWT Service Usage**

```typescript
// Existing pattern - don't rebuild this
import { AuthService } from '@services/auth/auth.service';

const authService = new AuthService();
const token = await authService.generateAccessToken(user);
const verified = await authService.verifyToken(token);
```

### **Authentication Pattern**

```typescript
// authMiddleware is applied globally in routes/index.ts
// It extracts JWT tokens and sets user context (optional)
.use(createAuthMiddleware(authService))

// authGuard is used on specific protected routes
// It requires user to be authenticated and optionally checks role
import { authGuard } from '@middleware/auth.middleware';

return new Hono()
  .get('/protected', authGuard(), async (c) => {
    const user = c.get('user'); // Set by authMiddleware, verified by authGuard
    // Handle authenticated request
  })
  .get('/admin-only', authGuard(UserRole.ADMIN), async (c) => {
    // Only admins can access this route
  });
```

## 🗄️ **Database Patterns**

### **Repository Pattern**

```typescript
// backend/src/repositories/[entity-name].repository.ts
import { Repository } from 'typeorm';
import { [Entity] } from '@entities/[entity].entity';

export class [Entity]Repository extends Repository<[Entity]> {
  async findByCustomField(field: string): Promise<[Entity] | null> {
    return this.findOne({ where: { field } });
  }
}
```

### **Entity Relationships**

```typescript
// Import Relation wrapper from TypeORM
import { Entity, JoinTable, ManyToMany, ManyToOne, OneToMany, type Relation } from 'typeorm';

// One-to-many relationship pattern
@Entity()
export class Movie {
  @OneToMany(() => MovieSource, source => source.movie)
  sources: Relation<MovieSource>[];

  // Many-to-many relationship pattern
  @ManyToMany(() => Genre, { eager: true })
  @JoinTable()
  genres: Relation<Genre>[];
}

@Entity()
export class MovieSource {
  @ManyToOne(() => Movie, movie => movie.sources)
  movie: Relation<Movie>;
}
```

## 🔍 **API Integration Patterns**

### **External API Client**

```typescript
// backend/src/content-directories/[provider]/[provider].api.ts
import { logger } from '@logger';
import type { Cache } from 'cache-manager';

import { Api } from '@utils/api.util';
import { Cacheable } from '@utils/cacheable.util';
import { enhancedFetch } from '@utils/fetch.util';
import { TrackStatus } from '@utils/trackStatus.util';

// Extend Api class for built-in rate limiting and status tracking
export class [Provider]API extends Api {
  constructor(cache: Cache) {
    super(
      cache,
      'https://api.provider.com', // Base URL
      2, // Rate limit: 2 requests per second
      2 // High priority rate limit: 2 requests per second ( on top of the normal rate limit, and with it's own separate queue )
    );
  }

  /**
   * Private request method with common error handling and rate limiting
   */
  @TrackStatus()
  private async request<T>(
    endpoint: string,
    params: Record<string, boolean | number | string> = {},
    highPriority = false
  ): Promise<T> {
    await this.throttle(highPriority);

    const url = `${this.apiUrl}/${endpoint}`;

    try {
      const response = await enhancedFetch(url, {
        queryString: params,
        timeout: 15000,
      });

      if (!response.ok) {
        logger.error('[Provider]', `API error for ${url}:`, response.status, response.statusText);
        throw new Error(`[Provider] API error: (${response.status}) ${response.statusText}`);
      }

      // Handle HTML responses (usually error pages)
      if (response.headers.get('content-type')?.includes('text/html')) {
        logger.error('[Provider]', `Received HTML response for ${url}. May indicate error page.`);
        throw new Error(`[Provider] API returned HTML response for ${url}`);
      }

      return (await response.json()) as T;
    } catch (error) {
      logger.error('[Provider]', `Request failed for ${url}:`, error);
      throw error;
    }
  }

  // Use @Cacheable decorator and call private request method
  @Cacheable(36e5 /* 1 hour */)
  async searchMovies(query: string, highPriority = false): Promise<SearchResult> {
    return this.request<SearchResult>('search', { q: query }, highPriority);
  }

  // Test method for health checks
  async test(): Promise<boolean> {
    try {
      await this.request<any>('health', {});
      return true;
    } catch {
      return false;
    }
  }
}
```

### **Content Directory Implementation**

```typescript
// Follow existing YTS/THERARBG pattern
export class NewProviderDirectory extends AbstractContentDirectory<NewProviderAPI> {
  name = 'NewProvider';

  private normalize(rawData: ProviderResponse): SourceMetadata {
    return {
      // Transform provider data to standard format
    };
  }

  async getMovie(imdbId: string): Promise<{ sources: SourceMetadata[] }> {
    const response = await this.api.searchMovies(imdbId);
    return {
      sources: response.items.map(item => this.normalize(item)),
    };
  }
}
```

## 🧪 **Testing Patterns**

### **Enterprise Testing Architecture**

The codebase uses sophisticated testing patterns for maintainable, reliable tests. Follow these **exact** patterns for consistency.

### **1. Mock Module Declaration (Always at Top)**

```typescript
// CRITICAL: Mock declarations MUST be at the top, before imports
jest.mock('@database/database');
jest.mock('@repositories/movie.repository');
jest.mock('@services/download/download.service');

// Then imports come AFTER mocks
import { SourceService } from '@services/source/source.service';
import { Database } from '@database/database';
import { MovieRepository } from '@repositories/movie.repository';
```

### **2. Centralized Mock Data with Seeded Faker**

```typescript
// Use centralized factory functions with faker for realistic, reproducible data
import {
  createMockMovie,
  createMockMovieSource,
  createMockSourceMetadata,
} from '@__test-utils__/mocks/movie.mock';
import { configureFakerSeed } from '@__test-utils__/utils';

describe('ServiceName', () => {
  beforeAll(() => {
    configureFakerSeed(); // Ensures reproducible randomness
  });

  // Use factory functions with overrides for specific test cases
  const mockMovie = createMockMovie();
  const mockMovieSource = createMockMovieSource({
    movieId: mockMovie.id, // Proper relational references
    quality: Quality.FHD, // Specific test requirements
  });
});
```

### **3. Auto-Generated Type-Safe Class Mocks**

```typescript
// Create type-safe mocks with Jest auto-generation
const mockMovieRepository = new MovieRepository({} as never) as jest.Mocked<MovieRepository>;
const mockDownloadService = new DownloadService() as jest.Mocked<DownloadService>;

// Benefits:
// - {} as never bypasses constructor requirements
// - jest.Mocked<T> provides typed mock methods
// - All methods automatically become jest.MockedFunction
// - Full TypeScript intellisense support
```

### **4. setupTest() Pattern for Test Isolation**

```typescript
// CRITICAL: Use setupTest() to prevent race conditions between tests
const setupTest = () => {
  // Create FRESH instances for every test
  const mockMovieRepository = new MovieRepository({} as never) as jest.Mocked<MovieRepository>;
  const mockDownloadService = new DownloadService() as jest.Mocked<DownloadService>;

  // Pre-configure common behaviors
  mockMovieRepository.findMoviesPendingSourceSearch.mockResolvedValue([mockMovie]);
  mockDownloadService.generateLink.mockReturnValue('magnet:?xt=urn:btih:test');

  // Setup dependency injection
  const service = new SourceService(
    mockDatabase,
    mockVpnService,
    mockContentDirectoryService,
    mockSourceMetadataFileService
  );

  // Return everything needed for the test
  return {
    service,
    mockMovieRepository,
    mockDownloadService,
    // ... all mocks and data
  };
};

// Each test gets completely isolated instances
it('should process movies', async () => {
  const { service, mockMovieRepository } = setupTest();
  // Test implementation...
});
```

### **5. Specialized Test Helpers for Scenarios**

```typescript
// Create domain-specific setup functions for common scenarios
const createServiceWithDisconnectedVpn = () => {
  const { mockVpnService, ...rest } = setupTest();
  jest.clearAllMocks();
  mockVpnService.isVpnActive.mockResolvedValueOnce(false);
  return {
    ...rest,
    mockVpnService,
    service: new SourceService(/* modified dependencies */),
  };
};

const createMockSourceForStats = (overrides: Partial<MovieSource> = {}): MovieSource => {
  return createMockMovieSource({
    file: Buffer.from('mock file'),
    lastStatsCheck: new Date(Date.now() - 7 * 60 * 60 * 1000),
    nextStatsCheckAt: new Date(Date.now() - 1000),
    ...overrides,
  });
};
```

### **6. Advanced Async Testing with Time Control**

```typescript
import { delayedResult } from '@__test-utils__/utils';

describe('async operations', () => {
  beforeEach(() => {
    jest.useFakeTimers(); // Enable time manipulation
  });

  afterEach(() => {
    jest.useRealTimers(); // Clean up timers
  });

  it('should handle timeout scenarios', async () => {
    // Mock delayed responses
    mockContentDirectoryService.searchSourcesForMovie.mockResolvedValueOnce(
      delayedResult({ sources: [mockSource1] }, 1500) // Custom utility for delays
    );

    const searchPromise = service.getSourcesForMovieWithOnDemandSearch(mockMovie, 1200);
    jest.advanceTimersByTime(1200); // Precise time control
    const sources = await searchPromise;

    expect(sources).toEqual([]); // Verify timeout behavior
  });
});
```

### **7. Comprehensive Error Handling Tests**

```typescript
// Test ALL error paths explicitly
it('should handle API service errors gracefully', async () => {
  const { service, mockSourceMetadataFileService, mockMovieSourceRepository } = setupTest();

  mockSourceMetadataFileService.getStats.mockRejectedValueOnce(new Error('Stats fetch failed'));

  await service.syncStatsForSources();

  // Verify method was called
  expect(mockSourceMetadataFileService.getStats).toHaveBeenCalledWith(sourceToUpdate.hash);
  // Verify graceful failure (no update called)
  expect(mockMovieSourceRepository.updateStats).not.toHaveBeenCalled();
});
```

### **8. Side Effect Verification**

```typescript
// Test method calls and their parameters, not just return values
expect(mockContentDirectoryService.searchSourcesForMovie).toHaveBeenCalledWith(
  mockMovie.imdbId,
  true, // isOnDemand
  expect.anything() // contentDirectoriesSearched
);

// Verify call counts
expect(mockMovieRepository.markSourceSearched).toHaveBeenCalledTimes(1);
expect(mockMovieSourceRepository.createMany).toHaveBeenCalledTimes(1);
```

### **9. Test Structure Best Practices**

```typescript
describe('SourceService', () => {
  // Helper functions at top
  const setupTest = () => {
    /* ... */
  };
  const createServiceWithDisconnectedVpn = () => {
    /* ... */
  };

  beforeAll(() => {
    configureFakerSeed(); // Reproducible randomness
  });

  // Mirror service method structure
  describe('searchSourcesForMovies', () => {
    it('should process movies without sources', async () => {
      // Single responsibility per test
    });

    it('should handle search failures gracefully', async () => {
      // Error path testing
    });
  });

  describe('getSourcesForMovie', () => {
    describe('when movie has existing sources', () => {
      it('should return immediately without triggering API calls', async () => {
        // Nested describe for different scenarios
      });
    });

    describe('when movie has no sources', () => {
      it('should trigger high priority search', async () => {
        // Test conditional logic paths
      });
    });
  });
});
```

### **Key Testing Principles**

1. **Mock at Module Boundaries**: Use jest.mock() at the top level
2. **Fresh State Per Test**: setupTest() prevents race conditions
3. **Realistic Data**: Faker with seeds for reproducible variety
4. **Type Safety**: Maintain full TypeScript benefits in tests
5. **Error Path Coverage**: Test all failure scenarios explicitly
6. **Time Control**: Use fake timers for async operation testing
7. **Side Effect Verification**: Test method calls, not just return values
8. **Test Isolation**: No shared state between tests

### **HTTP-VCR Pattern for External APIs**

```typescript
// For testing external API integrations, use HTTP-VCR fixtures
// Tests run against pre-recorded responses, not live APIs

// Example: YTS API test
it('should search for movies', async () => {
  // HTTP-VCR automatically replays recorded response
  const results = await ytsApi.searchMovies('Inception');

  expect(results).toMatchObject({
    status: 'ok',
    data: {
      movies: expect.arrayContaining([
        expect.objectContaining({
          title: 'Inception',
          year: 2010,
        }),
      ]),
    },
  });
});

// No manual mocking needed - VCR handles it
// Run `npm test --workspace backend -- yts.api.test.ts` to update fixtures
```

## 📊 **State Management (Frontend)**

### **Redux Slice Pattern**

```typescript
// frontend/src/store/slices/[feature].ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface [Feature]State {
  items: [Item][];
  loading: boolean;
  error: string | null;
}

const [feature]Slice = createSlice({
  name: '[feature]',
  initialState,
  reducers: {
    setItems: (state, action: PayloadAction<[Item][]>) => {
      state.items = action.payload;
    },
  },
});
```

### **RTK Query API Pattern**

```typescript
// frontend/src/store/api/[feature].ts
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

export const [feature]Api = createApi({
  reducerPath: '[feature]Api',
  baseQuery: fetchBaseQuery({
    baseUrl: '/api/',
    prepareHeaders: (headers, { getState }) => {
      // Add auth token from state
      const token = selectAuthToken(getState());
      if (token) {
        headers.set('authorization', `Bearer ${token}`);
      }
      return headers;
    },
  }),
  endpoints: (builder) => ({
    get[Items]: builder.query<[Item][], void>({
      query: () => '[endpoint]',
    }),
  }),
});
```

## 🔧 **Configuration Patterns**

### **Environment Variables**

```typescript
// Use the ENV function from constants.ts (type-safe with validation)
import { ENV } from '@constants';

// Correct usage - ENV is a function that takes a variable name
const port = ENV('PORT'); // Returns number (auto-transformed)
const apiKey = ENV('TMDB_API_KEY'); // Returns string or undefined
const jwtSecret = ENV('JWT_SECRET'); // Returns string (required, throws if missing)

// Wrong - don't access process.env directly
// const port = process.env.PORT; // ❌ No type safety, no validation
```

### **Service Configuration**

```typescript
// Configuration schema pattern
export const serviceConfigurationDefinition = serviceConfiguration({
  API_URL: variable({
    type: 'string',
    description: 'API base URL',
    required: true,
    transform: transformers.url(),
  }),
  API_KEY: {
    type: 'string',
    description: 'API authentication key',
    required: false,
  },
});
```

## 🚀 **Error Handling Patterns**

### **Service Level**

```typescript
export class [Service]Service {
  async method(): Promise<Result> {
    try {
      return await this.operation();
    } catch (error) {
      if (error instanceof [KnownError]) {
        throw new [DomainError]('Specific error message');
      }
      throw error; // Re-throw unknown errors
    }
  }
}
```

### **Route Level**

```typescript
// Let Hono's onError handler catch and format errors
routes.get('/endpoint', async c => {
  const result = await service.method(); // Throws domain errors
  return c.json(result);
});
```

---

**Key Principle**: Follow existing patterns rather than inventing new ones. The codebase has consistent conventions - use them!
