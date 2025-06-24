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

### **Unit Test Structure**

```typescript
// [file-name].test.ts
import { [Service] } from './[service].service';

describe('[Service]', () => {
  let service: [Service];

  beforeEach(() => {
    service = new [Service]();
  });

  describe('method', () => {
    it('should handle normal case', async () => {
      const result = await service.method();
      expect(result).toBeDefined();
    });

    it('should handle error case', async () => {
      await expect(service.method()).rejects.toThrow();
    });
  });
});
```

### **Mock Pattern for External APIs**

```typescript
// Use Jest auto-mocks, don't make real API calls
jest.mock('@services/external/external.service');
import { ExternalService } from '@services/external/external.service';

const mockExternalService = new ExternalService() as jest.Mocked<ExternalService>;

beforeEach(() => {
  mockExternalService.method.mockReturnValue('mocked-result');
});
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
