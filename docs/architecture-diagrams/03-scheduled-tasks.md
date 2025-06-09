# Scheduled Tasks & Background Processes

## Background Task Architecture

### 1. Task Scheduler Overview

```mermaid
flowchart TD
    SCHEDULER[Miauflix Task Scheduler<br/>7 Automated Background Tasks] --> HIGH_FREQ[High Frequency Tasks<br/>Sub-second Intervals]
    SCHEDULER --> MED_FREQ[Medium Frequency Tasks<br/>1-5 Second Intervals]
    SCHEDULER --> LOW_FREQ[Low Frequency Tasks<br/>Hour+ Intervals]

    HIGH_FREQ --> MOVIE_SOURCE[Movie Source Search<br/>0.1 seconds]
    HIGH_FREQ --> FILE_SEARCH[Torrent File Search<br/>0.2 seconds]

    MED_FREQ --> SEASON_SYNC[Season Completion<br/>1 second]
    MED_FREQ --> STATS_UPDATE[Stats Update<br/>2 seconds]
    MED_FREQ --> RESYNC[Source Resync<br/>5 seconds]

    LOW_FREQ --> LIST_REFRESH[List Refresh<br/>1 hour]
    LOW_FREQ --> MOVIE_SYNC[Movie Sync<br/>1.5 hours]

    %% Styling
    classDef scheduler fill:#e3f2fd,stroke:#1976d2,stroke-width:3px
    classDef high fill:#ffebee,stroke:#d32f2f,stroke-width:2px
    classDef medium fill:#fff3e0,stroke:#f57c00,stroke-width:2px
    classDef low fill:#e8f5e8,stroke:#2e7d32,stroke-width:2px
    classDef task fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px

    class SCHEDULER scheduler
    class HIGH_FREQ high
    class MED_FREQ medium
    class LOW_FREQ low
    class MOVIE_SOURCE,FILE_SEARCH,SEASON_SYNC,STATS_UPDATE,RESYNC,LIST_REFRESH,MOVIE_SYNC task
```

### 2. Detailed Task Execution Flow

```mermaid
sequenceDiagram
    participant S as Scheduler
    participant LS as List Service
    participant MS as Media Service
    participant SS as Source Service
    participant TS as Tracker Service
    participant DB as Database
    participant EXT as External APIs

    Note over S,EXT: Background Task Execution Timeline

    %% High Frequency Tasks (Sub-second)
    rect rgb(255, 235, 238)
        Note over S,EXT: High Frequency (0.1-0.2s intervals)
        loop Every 0.1 seconds
            S->>SS: Movie Source Search
            SS->>EXT: Query YTS
            SS->>DB: Store new sources
        end

        loop Every 0.2 seconds
            S->>SS: Torrent File Search
            SS->>TS: Validate torrent files
            SS->>DB: Update source data
        end
    end

    %% Medium Frequency Tasks (1-5 seconds)
    rect rgb(255, 243, 224)
        Note over S,EXT: Medium Frequency (1-5s intervals)
        loop Every 1 second
            S->>MS: Season Completion
            MS->>EXT: Fetch missing seasons
            MS->>DB: Complete TV show data
        end

        loop Every 2 seconds
            S->>SS: Stats Update
            SS->>TS: Get seeds/peers stats
            SS->>DB: Update source statistics
        end

        loop Every 5 seconds
            S->>SS: Source Resync
            SS->>TS: Revalidate sources
            SS->>DB: Update/remove invalid sources
        end
    end

    %% Low Frequency Tasks (Hours)
    rect rgb(232, 245, 232)
        Note over S,EXT: Low Frequency (1+ hour intervals)
        loop Every 1 hour
            S->>LS: List Refresh
            LS->>EXT: Sync TMDB lists
            LS->>DB: Update content lists
        end

        loop Every 1.5 hours
            S->>MS: Movie Sync
            MS->>EXT: Fetch movie updates
            MS->>DB: Update movie metadata
        end
    end
```

### 3. Task Priority & Resource Management

```mermaid
flowchart LR
    subgraph "Critical Priority Tasks"
        MOVIE_SOURCE[Movie Source Search<br/>⏱️ 0.1s<br/>🔄 Continuous<br/>📈 High Impact]
        SEASON_SYNC[Season Completion<br/>⏱️ 1s<br/>🔄 Real-time<br/>📈 User Experience]
    end

    subgraph "Standard Priority Tasks"
        FILE_SEARCH[Torrent File Search<br/>⏱️ 0.2s<br/>🔄 Validation<br/>📊 Quality Control]
        STATS_UPDATE[Stats Update<br/>⏱️ 2s<br/>🔄 Monitoring<br/>📊 Source Health]
        RESYNC[Source Resync<br/>⏱️ 5s<br/>🔄 Maintenance<br/>🛠️ Data Integrity]
    end

    subgraph "Background Priority Tasks"
        LIST_REFRESH[List Refresh<br/>⏱️ 1hr<br/>🔄 Periodic<br/>📚 Content Discovery]
        MOVIE_SYNC[Movie Sync<br/>⏱️ 1.5hr<br/>🔄 Batch Update<br/>🎬 Metadata Sync]
    end

    MOVIE_SOURCE --> RESOURCE_MGMT[Resource Management<br/>• VPN bandwidth allocation<br/>• API rate limiting<br/>• Database connection pooling<br/>• Memory optimization]
    SEASON_SYNC --> RESOURCE_MGMT
    FILE_SEARCH --> RESOURCE_MGMT
    STATS_UPDATE --> RESOURCE_MGMT
    RESYNC --> RESOURCE_MGMT
    LIST_REFRESH --> RESOURCE_MGMT
    MOVIE_SYNC --> RESOURCE_MGMT

    %% Styling
    classDef critical fill:#ffcdd2,stroke:#d32f2f,stroke-width:3px
    classDef standard fill:#fff3e0,stroke:#f57c00,stroke-width:2px
    classDef background fill:#e8f5e8,stroke:#2e7d32,stroke-width:2px
    classDef management fill:#e1f5fe,stroke:#0277bd,stroke-width:2px

    class MOVIE_SOURCE,SEASON_SYNC critical
    class FILE_SEARCH,STATS_UPDATE,RESYNC standard
    class LIST_REFRESH,MOVIE_SYNC background
    class RESOURCE_MGMT management
```

### 4. Task Dependencies & Data Flow

```mermaid
flowchart TD
    subgraph "External Data Sources"
        TMDB_API[TMDB API<br/>Movie/TV Metadata]
        YTS_MIRRORS[YTS Mirrors<br/>Torrent Sources]
        TRACKERS[Distributed Trackers<br/>Source Validation]
    end

    subgraph "Background Tasks"
        LIST_REFRESH[List Refresh<br/>1 hour]
        MOVIE_SYNC[Movie Sync<br/>1.5 hours]
        SEASON_SYNC[Season Completion<br/>1 second]
        MOVIE_SOURCE[Source Search<br/>0.1 seconds]
        FILE_SEARCH[File Search<br/>0.2 seconds]
        STATS_UPDATE[Stats Update<br/>2 seconds]
        RESYNC[Source Resync<br/>5 seconds]
    end

    subgraph "Database Tables"
        MOVIES_TABLE[(Movies Table)]
        TVSHOWS_TABLE[(TV Shows Table)]
        SEASONS_TABLE[(Seasons Table)]
        SOURCES_TABLE[(Movie Sources Table)]
        LISTS_TABLE[(Media Lists Table)]
    end

    %% External API connections
    TMDB_API --> LIST_REFRESH
    TMDB_API --> MOVIE_SYNC
    TMDB_API --> SEASON_SYNC

    YTS_MIRRORS --> MOVIE_SOURCE
    YTS_MIRRORS --> FILE_SEARCH

    TRACKERS --> STATS_UPDATE
    TRACKERS --> RESYNC

    %% Database updates
    LIST_REFRESH --> LISTS_TABLE
    LIST_REFRESH --> MOVIES_TABLE
    LIST_REFRESH --> TVSHOWS_TABLE

    MOVIE_SYNC --> MOVIES_TABLE
    SEASON_SYNC --> SEASONS_TABLE

    MOVIE_SOURCE --> SOURCES_TABLE
    FILE_SEARCH --> SOURCES_TABLE
    STATS_UPDATE --> SOURCES_TABLE
    RESYNC --> SOURCES_TABLE

    %% Task dependencies
    MOVIE_SYNC -.->|Depends on| LIST_REFRESH
    SEASON_SYNC -.->|Triggered by| MOVIE_SYNC
    MOVIE_SOURCE -.->|Uses data from| MOVIES_TABLE
    FILE_SEARCH -.->|Validates| MOVIE_SOURCE
    STATS_UPDATE -.->|Monitors| MOVIE_SOURCE
    RESYNC -.->|Maintains| SOURCES_TABLE

    %% Styling
    classDef external fill:#ffebee,stroke:#c62828,stroke-width:2px
    classDef tasks fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px
    classDef database fill:#fff3e0,stroke:#ef6c00,stroke-width:2px

    class TMDB_API,YTS_MIRRORS,TRACKERS external
    class LIST_REFRESH,MOVIE_SYNC,SEASON_SYNC,MOVIE_SOURCE,FILE_SEARCH,STATS_UPDATE,RESYNC tasks
    class MOVIES_TABLE,TVSHOWS_TABLE,SEASONS_TABLE,SOURCES_TABLE,LISTS_TABLE database
```

### 5. Error Handling & Recovery Mechanisms

```mermaid
flowchart TD
    TASK_EXECUTION[Task Execution] --> ERROR_CHECK{Error Occurred?}

    ERROR_CHECK -->|No| SUCCESS[Task Completed Successfully]
    ERROR_CHECK -->|Yes| ERROR_TYPE{Error Type}

    ERROR_TYPE -->|Network Error| RETRY_LOGIC[Retry with Backoff<br/>Max 3 attempts]
    ERROR_TYPE -->|API Rate Limit| RATE_LIMIT_WAIT[Wait & Retry<br/>Respect rate limits]
    ERROR_TYPE -->|VPN Disconnect| VPN_RECONNECT[VPN Reconnection<br/>Automated recovery]
    ERROR_TYPE -->|Database Error| DB_RECOVERY[Database Recovery<br/>Connection reset]
    ERROR_TYPE -->|Critical Error| CONSOLE_LOG[Console Logging<br/>Error details]

    RETRY_LOGIC --> RETRY_CHECK{Retry Successful?}
    RETRY_CHECK -->|Yes| SUCCESS
    RETRY_CHECK -->|No| FALLBACK[Fallback Mechanism]

    RATE_LIMIT_WAIT --> SUCCESS
    VPN_RECONNECT --> TASK_EXECUTION
    DB_RECOVERY --> TASK_EXECUTION

    FALLBACK --> MIRROR_SWITCH[Switch to backup mirror]
    FALLBACK --> CACHE_FALLBACK[Use cached data]
    FALLBACK --> SKIP_ITERATION[Skip this iteration]

    CONSOLE_LOG --> CONTINUE[Continue Operation]

    %% Styling
    classDef success fill:#e8f5e8,stroke:#2e7d32,stroke-width:2px
    classDef error fill:#ffebee,stroke:#c62828,stroke-width:2px
    classDef recovery fill:#fff3e0,stroke:#ef6c00,stroke-width:2px
    classDef fallback fill:#e1f5fe,stroke:#0277bd,stroke-width:2px

    class SUCCESS,RETRY_CHECK success
    class ERROR_CHECK,ERROR_TYPE,CONSOLE_LOG error
    class RETRY_LOGIC,RATE_LIMIT_WAIT,VPN_RECONNECT,DB_RECOVERY recovery
    class FALLBACK,MIRROR_SWITCH,CACHE_FALLBACK,SKIP_ITERATION,CONTINUE fallback
```

## Task Specifications

### High-Priority Tasks (Sub-second intervals)

#### 1. Movie Source Search (0.1 seconds)

- **Purpose**: Continuously discover new torrent sources
- **Service**: `SourceService.searchSourcesForMovies()`
- **External APIs**: YTS mirrors (5 endpoints)
- **VPN Required**: Yes
- **Database Impact**: High (frequent inserts)
- **Error Handling**: Mirror failover, retry logic

#### 2. Torrent File Search (0.2 seconds)

- **Purpose**: Process and validate torrent files
- **Service**: `SourceService.searchTorrentFilesForSources()`
- **Dependencies**: Tracker services
- **VPN Required**: Yes
- **Database Impact**: Medium (updates existing records)
- **Error Handling**: Skip invalid files, log errors

### Medium-Priority Tasks (1-5 second intervals)

#### 3. Season Completion (1 second)

- **Purpose**: Complete incomplete TV show seasons
- **Service**: `MediaService.syncIncompleteSeasons()`
- **External APIs**: TMDB TV API
- **VPN Required**: No
- **Database Impact**: Medium (TV show updates)
- **Error Handling**: Cache fallback, retry logic

#### 4. Stats Update (2 seconds)

- **Purpose**: Update torrent source statistics
- **Service**: `SourceService.syncStatsForSources()`
- **Dependencies**: Tracker services
- **VPN Required**: Yes
- **Database Impact**: High (frequent updates)
- **Error Handling**: Skip unreachable sources

#### 5. Source Resync (5 seconds)

- **Purpose**: Revalidate and maintain source quality
- **Service**: `SourceService.resyncMovieSources()`
- **Dependencies**: Tracker validation
- **VPN Required**: Yes
- **Database Impact**: Medium (cleanup operations)
- **Error Handling**: Remove invalid sources

### Low-Priority Tasks (Hour+ intervals)

#### 6. List Refresh (1 hour)

- **Purpose**: Synchronize content lists and categories
- **Service**: `ListSynchronizer.synchronize()`
- **External APIs**: TMDB Lists API
- **VPN Required**: No
- **Database Impact**: Low (batch operations)
- **Error Handling**: Cache previous results

#### 7. Movie Sync (1.5 hours)

- **Purpose**: Update movie metadata from TMDB
- **Service**: `MediaService.syncMovies()`
- **External APIs**: TMDB Movie API
- **VPN Required**: No
- **Database Impact**: Medium (batch updates)
- **Error Handling**: Process partial results

## Performance Characteristics

### Resource Usage

- **CPU**: Optimized for concurrent task execution
- **Memory**: Controlled memory usage with cleanup
- **Network**: VPN bandwidth allocation and rate limiting
- **Database**: Connection pooling and transaction management

### Monitoring & Metrics

- **Task Execution Time**: Track performance trends
- **Error Rates**: Monitor failure patterns
- **VPN Health**: Connection stability metrics
- **API Rate Limits**: Usage tracking and optimization

### Scalability Considerations

- **Task Queuing**: Priority-based task scheduling
- **Resource Allocation**: Dynamic resource management
- **Load Balancing**: Distributed task execution capability
- **Graceful Degradation**: Fallback mechanisms for high load

## Integration with System Components

### VPN Integration

- All torrent-related tasks route through VPN
- Automatic VPN health monitoring
- Graceful handling of VPN disconnections
- Bandwidth allocation for background tasks

### Database Optimization

- Efficient indexing for frequent queries
- Batch operations for performance
- Connection pooling for concurrent access
- Transaction management for data integrity

### External API Management

- Respect for rate limits and quotas
- Caching strategies for API responses
- Fallback mechanisms for API failures
- Load balancing across multiple endpoints
