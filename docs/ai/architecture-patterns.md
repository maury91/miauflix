# 🏗️ Architecture Patterns & System Design

## **Service Layer Pattern**

```typescript
// Services handle business logic
export class MediaService {
  private readonly tvShowRepository: TVShowRepository;
  private readonly movieRepository: MovieRepository;

  constructor(
    db: Database,
    private readonly tmdbApi: TMDBApi,
    private readonly defaultLanguage: string = 'en'
  ) {
    this.tvShowRepository = db.getTVShowRepository();
    this.movieRepository = db.getMovieRepository();
  }
}
```

## **Repository Pattern**

```typescript
// Repositories handle database operations
export class TVShowRepository {
  private readonly tvShowRepository: Repository<TVShow>;

  constructor(datasource: DataSource) {
    this.tvShowRepository = datasource.getRepository(TVShow);
  }

  async findByTMDBId(tmdbId: number): Promise<TVShow | null> {
    return this.tvShowRepository.findOneBy({ tmdbId });
  }
}
```

## **Entity Pattern**

```typescript
// Entities define database schema
@Entity()
export class TVShow {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  tmdbId: number;

  @Column()
  name: string;

  @Column({
    default: false,
  })
  watching: boolean = false;
}
```

## **Route Pattern**

```typescript
// Routes handle HTTP endpoints
export const createShowRoutes = ({ mediaService, auditLogService }: Deps) => {
  return new Hono().get('/:id', rateLimitGuard(5), authGuard(), async context => {
    const { id } = context.req.valid('param');
    const show = await mediaService.getTVShowByTmdbId(parseInt(id, 10));
    return context.json(show);
  });
};
```

## **Background Tasks System**

### **Active Background Tasks**

The system has 7 background tasks running continuously:

1. **Movie source search** (0.1s intervals)
2. **Source metadata processing** (0.2s intervals)
3. **Stats updates** (2s intervals)
4. **List sync** (1h intervals)
5. **Movie metadata sync** (1.5h intervals)
6. **Episode sync** (1s intervals) - **Mode-aware (GREEDY/ON_DEMAND)**

### **Background Task Behavior**

```typescript
// Tasks automatically adapt to configuration
public async syncIncompleteSeasons() {
  const episodeSyncMode = ENV('EPISODE_SYNC_MODE');

  // Mode-aware behavior
  const incompleteSeasons =
    episodeSyncMode === 'GREEDY'
      ? await this.tvShowRepository.findIncompleteSeasons()
      : await this.findIncompleteSeasonsForWatchingShows();
}
```

### **Development vs Production**

- **E2E environment**: Supports hot reloading, changes affect running tasks
- **Production**: Tasks run in Docker containers, require rebuild/redeploy

## **Database Patterns**

### **TypeORM Synchronize Mode**

- Database schema automatically syncs with entity changes (`synchronize: true`)
- No migrations system - TypeORM handles schema updates automatically
- Changes to entities immediately affect database structure

### **Safe Entity Modifications**

- ✅ **Adding new optional fields**: Safe
- ❌ **Renaming fields**: Will lose existing data
- ❌ **Removing fields**: Will lose existing data
- ⚠️ **Changing field types**: May cause data loss

### **Entity Relationships**

```typescript
// One-to-Many relationships
@OneToMany(() => Season, season => season.tvShow)
seasons: Relation<Season>[];

// Many-to-Many relationships
@ManyToMany(() => Genre)
@JoinTable()
genres: Relation<Genre>[];

// Many-to-One relationships
@ManyToOne(() => TVShow, tvShow => tvShow.seasons)
tvShow: Relation<TVShow>;
```

## **Security & Authentication**

### **JWT Authentication System**

```typescript
// Complete JWT system with refresh tokens
export class AuthService {
  private readonly secretKey: Uint8Array;
  private readonly refreshSecretKey: Uint8Array;

  constructor() {
    this.secretKey = new TextEncoder().encode(ENV('JWT_SECRET'));
    this.refreshSecretKey = new TextEncoder().encode(ENV('REFRESH_TOKEN_SECRET'));
  }
}
```

### **VPN Detection**

```typescript
// Active VPN detection system
export class VPNDetectionService {
  private readonly disabled = ENV('DISABLE_VPN_CHECK');

  async isVPNRunning(): Promise<boolean> {
    // NordVPN integration is production-ready
  }
}
```

### **Encryption**

```typescript
// AES-256-GCM encryption for sensitive fields
export class EncryptionService {
  private readonly key = ENV('SOURCE_SECURITY_KEY');

  async encrypt(data: string): Promise<string> {
    // Production-ready encryption
  }
}
```

## **File Organization**

### **Standard Directory Structure**

```
backend/src/
├── services/           # Business logic
│   ├── auth/
│   ├── media/
│   ├── source/
│   └── download/
├── routes/            # HTTP endpoints
├── entities/          # Database models
├── repositories/      # Database operations
├── middleware/        # Request processing
└── utils/            # Shared utilities
```

### **Naming Conventions**

- **Services**: `[service-name].service.ts`
- **Routes**: `[feature].routes.ts`
- **Entities**: `[entity-name].entity.ts`
- **Repositories**: `[entity-name].repository.ts`
- **Configurations**: `[service-name].configuration.ts`

## **API Integration Patterns**

### **External API Handling**

```typescript
// Rate limiting and error handling
export class TMDBApi {
  private readonly apiKey = ENV('TMDB_API_ACCESS_TOKEN');

  async getTVShowDetails(showId: number) {
    // Handles rate limits, timeouts, retries
  }
}
```

### **Error Handling**

- ✅ **Exponential backoff for external calls**
- ✅ **Graceful timeout handling**
- ✅ **Retry logic for transient failures**

## **Dependency Injection Pattern**

```typescript
// Services receive dependencies through constructor
export class MediaService {
  constructor(
    private readonly db: Database,
    private readonly tmdbApi: TMDBApi,
    private readonly scheduler: SchedulerService
  ) {}
}

// Routes receive service dependencies
export const createMediaRoutes = ({ mediaService }: Deps) => {
  return new Hono().get('/shows/:id', async context => {
    // Use injected mediaService
  });
};
```

## **Configuration Management**

```typescript
// Service-specific configurations
export const mediaConfigurationDefinition = serviceConfiguration({
  name: 'Media',
  variables: {
    EPISODE_SYNC_MODE: variable({
      description: 'Episode sync strategy',
      defaultValue: 'ON_DEMAND',
      transform: transforms.string({
        pattern: /^(GREEDY|ON_DEMAND)$/,
      }),
    }),
  },
});

// Centralized configuration
export const services = {
  MEDIA: mediaConfigurationDefinition,
  AUTH: authConfigurationDefinition,
  // ... other services
};
```

## **Middleware Pattern**

```typescript
// Authentication middleware
export const authGuard = () => async (context: Context, next: Next) => {
  const token = context.req.header('Authorization')?.replace('Bearer ', '');

  if (!token) {
    return context.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const user = await authService.validateToken(token);
    context.set('user', user);
    await next();
  } catch (error) {
    return context.json({ error: 'Invalid token' }, 401);
  }
};

// Rate limiting middleware
export const rateLimitGuard = (maxRequests: number) => async (context: Context, next: Next) => {
  // Rate limiting logic
  await next();
};
```

## **Error Handling Patterns**

```typescript
// Service-level error handling
export class MediaService {
  async getTVShow(id: number): Promise<TVShow> {
    try {
      const show = await this.tvShowRepository.findOneBy({ id });

      if (!show) {
        throw new NotFoundError(`TV Show with ID ${id} not found`);
      }

      return show;
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }

      // Log unexpected errors
      this.logger.error('Failed to get TV show', { id, error });
      throw new InternalServerError('Failed to retrieve TV show');
    }
  }
}

// Route-level error handling
export const createShowRoutes = ({ mediaService }: Deps) => {
  return new Hono()
    .get('/:id', async (context, next) => {
      try {
        await next();
      } catch (error) {
        if (error instanceof NotFoundError) {
          return context.json({ error: error.message }, 404);
        }

        return context.json({ error: 'Internal server error' }, 500);
      }
    })
    .get('/:id', async context => {
      const { id } = context.req.valid('param');
      const show = await mediaService.getTVShow(parseInt(id, 10));
      return context.json(show);
    });
};
```

## **Validation Patterns**

```typescript
// Input validation with Zod
export const showParamsSchema = z.object({
  id: z.string().transform(val => parseInt(val, 10)),
});

export const createShowRoutes = ({ mediaService }: Deps) => {
  return new Hono().get('/:id', validate('param', showParamsSchema), async context => {
    const { id } = context.req.valid('param');
    const show = await mediaService.getTVShow(id);
    return context.json(show);
  });
};
```

## **Logging Patterns**

```typescript
// Structured logging
export class MediaService {
  private readonly logger = new Logger('MediaService');

  async syncIncompleteSeasons() {
    this.logger.info('Starting episode sync', {
      mode: ENV('EPISODE_SYNC_MODE'),
      timestamp: new Date().toISOString(),
    });

    try {
      // Sync logic
      this.logger.info('Episode sync completed successfully');
    } catch (error) {
      this.logger.error('Episode sync failed', { error });
      throw error;
    }
  }
}
```

## **Caching Patterns**

```typescript
// Service-level caching
export class MediaService {
  private readonly cache = new Map<string, { data: any; expires: number }>();

  async getTVShow(id: number): Promise<TVShow> {
    const cacheKey = `tvshow:${id}`;
    const cached = this.cache.get(cacheKey);

    if (cached && cached.expires > Date.now()) {
      return cached.data;
    }

    const show = await this.tvShowRepository.findOneBy({ id });

    this.cache.set(cacheKey, {
      data: show,
      expires: Date.now() + 5 * 60 * 1000, // 5 minutes
    });

    return show;
  }
}
```

## **Event-Driven Patterns**

```typescript
// Event emission
export class MediaService {
  async syncIncompleteSeasons() {
    const seasons = await this.findIncompleteSeasons();

    for (const season of seasons) {
      await this.syncSeason(season);

      // Emit event for other services
      this.eventEmitter.emit('season.synced', {
        seasonId: season.id,
        showId: season.tvShow.id,
        episodeCount: season.episodes.length,
      });
    }
  }
}

// Event handling
export class NotificationService {
  constructor(private readonly eventEmitter: EventEmitter) {
    this.eventEmitter.on('season.synced', this.handleSeasonSynced.bind(this));
  }

  private async handleSeasonSynced(data: SeasonSyncedEvent) {
    // Send notifications, update UI, etc.
  }
}
```

---

**Key Architectural Principles**:

1. **Separation of Concerns**: Each layer has a specific responsibility
2. **Dependency Injection**: Services receive dependencies through constructors
3. **Error Handling**: Comprehensive error handling at all layers
4. **Validation**: Input validation at the boundary
5. **Logging**: Structured logging for observability
6. **Configuration**: Type-safe configuration management
7. **Testing**: Architecture supports comprehensive testing
