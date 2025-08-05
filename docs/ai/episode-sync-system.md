# 🎬 Episode Sync Management System

The project implements a sophisticated episode sync management system with two modes: GREEDY and ON_DEMAND.

## **Configuration**

```typescript
// Environment variable controls sync behavior
const syncMode = ENV('EPISODE_SYNC_MODE'); // 'GREEDY' | 'ON_DEMAND'
```

## **How It Works**

### **GREEDY Mode** (`EPISODE_SYNC_MODE=GREEDY`)

- Background task syncs ALL incomplete seasons for ALL shows
- Original behavior, high resource usage
- Good for complete episode libraries

### **ON_DEMAND Mode** (`EPISODE_SYNC_MODE=ON_DEMAND`) - **Default**

- Shows are marked as "watching" when user accesses them via API
- Background task only syncs episodes for shows where `watching: true`
- Efficient resource usage, user-driven syncing

## **Database Schema**

```typescript
// TVShow entity has watching flag
@Entity()
export class TVShow {
  @Column({
    default: false,
  })
  watching: boolean = false;
}
```

## **Repository Methods**

```typescript
// TVShowRepository provides watching management
async getWatchingTVShowIds(): Promise<number[]>
async markAsWatching(tvShowId: number): Promise<void>
async markAsNotWatching(tvShowId: number): Promise<void>
async findIncompleteSeasonsByShowIds(showIds: number[]): Promise<Season[]>
```

## **Service Integration**

```typescript
// MediaService automatically marks shows as watching
public async getTVShowByTmdbId(showTmdbId: number): Promise<TVShow> {
  // ... existing logic ...

  // Always mark as watching when accessed
  await this.tvShowRepository.markAsWatching(show.id);

  return show;
}

// Background task adapts to sync mode
public async syncIncompleteSeasons() {
  const episodeSyncMode = ENV('EPISODE_SYNC_MODE');

  const incompleteSeasons =
    episodeSyncMode === 'GREEDY'
      ? await this.tvShowRepository.findIncompleteSeasons()
      : await this.findIncompleteSeasonsForWatchingShows();

  // ... sync logic ...
}
```

## **Implementation Details**

### **Repository Implementation**

```typescript
export class TVShowRepository {
  /**
   * Get TV show IDs where the user has marked shows as watching
   */
  async getWatchingTVShowIds(): Promise<number[]> {
    const watchingShows = await this.tvShowRepository.find({
      where: { watching: true },
      select: ['id'],
    });
    return watchingShows.map(show => show.id);
  }

  /**
   * Mark a TV show as watching
   */
  async markAsWatching(tvShowId: number): Promise<void> {
    await this.tvShowRepository.update({ id: tvShowId }, { watching: true });
  }

  /**
   * Mark a TV show as not watching
   */
  async markAsNotWatching(tvShowId: number): Promise<void> {
    await this.tvShowRepository.update({ id: tvShowId }, { watching: false });
  }

  /**
   * Find incomplete seasons for specific TV show IDs
   */
  async findIncompleteSeasonsByShowIds(showIds: number[]): Promise<Season[]> {
    if (showIds.length === 0) {
      return [];
    }
    return this.seasonRepository.find({
      where: {
        synced: false,
        tvShow: { id: In(showIds) },
      },
      relations: {
        tvShow: true,
      },
    });
  }
}
```

### **Service Implementation**

```typescript
export class MediaService {
  /**
   * Find incomplete seasons for shows the user is watching
   */
  private async findIncompleteSeasonsForWatchingShows(): Promise<Season[]> {
    const watchingShowIds = await this.tvShowRepository.getWatchingTVShowIds();
    return this.tvShowRepository.findIncompleteSeasonsByShowIds(watchingShowIds);
  }

  /**
   * Get watching TV show IDs (delegates to repository)
   */
  private async getWatchingTVShowIds(): Promise<number[]> {
    return this.tvShowRepository.getWatchingTVShowIds();
  }

  /**
   * Main sync method - mode-aware
   */
  public async syncIncompleteSeasons() {
    const episodeSyncMode = ENV('EPISODE_SYNC_MODE');

    const incompleteSeasons =
      episodeSyncMode === 'GREEDY'
        ? await this.tvShowRepository.findIncompleteSeasons()
        : await this.findIncompleteSeasonsForWatchingShows();

    for (const season of incompleteSeasons) {
      await this.syncSeason(season);
    }
  }

  /**
   * Get TV show by TMDB ID - always marks as watching
   */
  public async getTVShowByTmdbId(
    showTmdbId: number,
    tvShowSummary?: TVShowMediaSummary
  ): Promise<TVShow> {
    let show = await this.tvShowRepository.findByTMDBId(showTmdbId);

    if (!show) {
      // Create new show logic...
    } else {
      // Update existing show logic...
    }

    // Always mark the show as watching when accessed
    await this.tvShowRepository.markAsWatching(show.id);

    return show;
  }
}
```

## **Background Task Integration**

The episode sync system integrates with the background task scheduler:

```typescript
// In scheduler configuration
{
  name: 'syncIncompleteSeasons',
  task: () => mediaService.syncIncompleteSeasons(),
  interval: 1000, // 1 second intervals
  enabled: true,
}
```

## **API Endpoint Integration**

When users access TV shows through the API, shows are automatically marked as watching:

```typescript
// GET /api/shows/:id
export const createShowRoutes = ({ mediaService }: Deps) => {
  return new Hono().get('/:id', rateLimitGuard(5), authGuard(), async context => {
    const { id } = context.req.valid('param');
    // This call automatically marks the show as watching
    const show = await mediaService.getTVShowByTmdbId(parseInt(id, 10));
    return context.json(show);
  });
};
```

## **Configuration Management**

The episode sync mode is configured through the media service configuration:

```typescript
// backend/src/services/media/media.configuration.ts
export const mediaConfigurationDefinition = serviceConfiguration({
  name: 'Media',
  description: 'Media service configuration',
  variables: {
    EPISODE_SYNC_MODE: variable({
      description: 'Episode metadata sync strategy',
      example: 'ON_DEMAND',
      defaultValue: 'ON_DEMAND',
      required: false,
      transform: transforms.string({
        pattern: /^(GREEDY|ON_DEMAND)$/,
      }),
    }),
  },
  test: async () => {
    return;
  },
});
```

## **Testing the System**

### **Testing Different Modes**

```typescript
describe('Episode sync modes', () => {
  it('should sync all shows in GREEDY mode', async () => {
    ENV.mockReturnValue('GREEDY');
    const { service, mockRepository } = setupTest();

    await service.syncIncompleteSeasons();

    expect(mockRepository.findIncompleteSeasons).toHaveBeenCalled();
    expect(mockRepository.getWatchingTVShowIds).not.toHaveBeenCalled();
  });

  it('should sync only watching shows in ON_DEMAND mode', async () => {
    ENV.mockReturnValue('ON_DEMAND');
    const { service, mockRepository } = setupTest();

    await service.syncIncompleteSeasons();

    expect(mockRepository.findIncompleteSeasons).not.toHaveBeenCalled();
    expect(mockRepository.getWatchingTVShowIds).toHaveBeenCalled();
  });
});
```

### **Testing Watching Flag**

```typescript
describe('Watching flag management', () => {
  it('should mark show as watching when accessed', async () => {
    const { service, mockRepository } = setupTest();
    mockRepository.findByTMDBId.mockResolvedValue({ id: 1, name: 'Test Show' });

    await service.getTVShowByTmdbId(123);

    expect(mockRepository.markAsWatching).toHaveBeenCalledWith(1);
  });
});
```

## **Performance Considerations**

### **GREEDY Mode**

- **Pros**: Complete episode library, no user interaction required
- **Cons**: High resource usage, syncs unnecessary data
- **Use Case**: Complete media libraries, high-bandwidth environments

### **ON_DEMAND Mode**

- **Pros**: Efficient resource usage, user-driven syncing
- **Cons**: Requires user interaction, may miss some episodes initially
- **Use Case**: Limited resources, focused viewing habits

## **Migration Strategy**

When switching from GREEDY to ON_DEMAND:

1. **Existing shows**: Will continue to sync if already marked as watching
2. **New shows**: Will only sync when user accesses them
3. **Backward compatibility**: System works with both modes seamlessly

## **Monitoring and Observability**

```typescript
// Logging sync behavior
public async syncIncompleteSeasons() {
  const episodeSyncMode = ENV('EPISODE_SYNC_MODE');

  this.logger.info('Starting episode sync', {
    mode: episodeSyncMode,
    timestamp: new Date().toISOString(),
  });

  const incompleteSeasons =
    episodeSyncMode === 'GREEDY'
      ? await this.tvShowRepository.findIncompleteSeasons()
      : await this.findIncompleteSeasonsForWatchingShows();

  this.logger.info('Found incomplete seasons', {
    count: incompleteSeasons.length,
    mode: episodeSyncMode,
  });

  // ... sync logic ...
}
```

## **Future Enhancements**

Potential improvements to the episode sync system:

1. **Smart Watching Detection**: Automatically detect when user stops watching a show
2. **Batch Processing**: Process multiple shows in parallel
3. **Priority Queue**: Prioritize shows based on user activity
4. **Predictive Syncing**: Sync shows similar to what user is watching
5. **Storage Optimization**: Clean up unused episode data

---

**Key Benefits**:

- **Resource Efficiency**: ON_DEMAND mode reduces unnecessary syncing
- **User Experience**: Shows sync automatically when accessed
- **Flexibility**: Easy to switch between modes via configuration
- **Scalability**: System adapts to user behavior and resource constraints
