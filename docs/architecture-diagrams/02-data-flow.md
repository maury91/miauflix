# Data Flow Architecture

## Complete Data Lifecycle Diagrams

### 1. User Content Discovery Flow

```mermaid
sequenceDiagram
    participant U as User Interface
    participant A as API Gateway
    participant M as Media Service
    participant D as Database
    participant C as Cache Layer
    participant T as TMDB API

    U->>A: Request movie/TV lists
    A->>M: Get content lists
    M->>D: Check database for content

    alt Data exists in DB
        D-->>M: Return stored content
        M-->>A: Return content from DB
    else Data not in DB
        M->>C: Check TMDB cache
        alt Cache Hit
            C-->>M: Return cached TMDB data
        else Cache Miss
            M->>T: Fetch from TMDB API
            T-->>M: Return fresh metadata
            M->>C: Store TMDB response in cache
        end
        M->>D: Save new data to database
        M-->>A: Return fresh content
    end

    A-->>U: Display content lists
```

### 2. Movie Content Source Discovery Flow

```mermaid
sequenceDiagram
    participant S as Source Service
    participant Y as YTS
    participant V as VPN Service
    participant T as Tracker Service
    participant M as Magnet Service
    participant D as Database

    S->>V: Verify VPN connection
    V-->>S: Connection confirmed

    loop With 0.1 seconds breaks
        S->>Y: Query YTS / fallback to mirror
        Y-->>S: Return torrent sources

        S->>T: Validate with trackers
        T-->>S: Source verification

        S->>M: Process magnet links
        M-->>S: Parsed torrent data

        S->>D: Store validated sources
    end

    Note over S,D: Continuous source discovery with VPN protection
```

### 3. Content Streaming Initiation Flow

```mermaid
sequenceDiagram
    participant U as User
    participant A as API
    participant S as Source Service
    participant D as Database
    participant W as WebTorrent
    participant V as VPN
    participant P as Peers

    U->>A: Request stream for content
    A->>S: Find best quality source
    S->>D: Query available sources
    D-->>S: Return source list
    S-->>A: Best source selected

    A->>W: Initialize torrent stream
    W->>V: Route through VPN
    V->>P: Connect to peers
    P-->>V: Stream data chunks
    V-->>W: Relay stream data
    W-->>A: Buffered stream ready
    A-->>U: Start playback

    Note over U,P: Secure P2P streaming with VPN protection
```

### 4. Background Synchronization Flow

```mermaid
flowchart TD
    SCHEDULER[Task Scheduler<br/>7 Background Tasks] --> LIST_SYNC[List Refresh<br/>Every 1 hour]
    SCHEDULER --> MOVIE_SYNC[Movie Sync<br/>Every 1.5 hours]
    SCHEDULER --> SEASON_SYNC[Season Completion<br/>Every 1 second]
    SCHEDULER --> SOURCE_SEARCH[Source Search<br/>Every 0.1 seconds]
    SCHEDULER --> FILE_SEARCH[File Processing<br/>Every 0.2 seconds]
    SCHEDULER --> STATS_UPDATE[Stats Update<br/>Every 2 seconds]
    SCHEDULER --> RESYNC[Source Resync<br/>Every 5 seconds]

    LIST_SYNC --> TMDB_LISTS[TMDB List API]
    MOVIE_SYNC --> TMDB_MOVIE[TMDB Movie API]
    SEASON_SYNC --> TMDB_TV[TMDB TV API]

    SOURCE_SEARCH --> YTS_SEARCH[YTS Mirror Search]
    FILE_SEARCH --> TORRENT_FILES[Torrent File Validation]
    STATS_UPDATE --> TRACKER_STATS[Tracker Statistics]
    RESYNC --> SOURCE_VALIDATION[Source Revalidation]

    TMDB_LISTS --> DB_UPDATE[Database Update]
    TMDB_MOVIE --> DB_UPDATE
    TMDB_TV --> DB_UPDATE
    YTS_SEARCH --> DB_UPDATE
    TORRENT_FILES --> DB_UPDATE
    TRACKER_STATS --> DB_UPDATE
    SOURCE_VALIDATION --> DB_UPDATE

    %% Styling
    classDef scheduler fill:#e3f2fd,stroke:#1976d2,stroke-width:2px
    classDef sync fill:#e8f5e8,stroke:#388e3c,stroke-width:2px
    classDef external fill:#ffebee,stroke:#d32f2f,stroke-width:2px
    classDef database fill:#fff3e0,stroke:#f57c00,stroke-width:2px

    class SCHEDULER scheduler
    class LIST_SYNC,MOVIE_SYNC,SEASON_SYNC,SOURCE_SEARCH,FILE_SEARCH,STATS_UPDATE,RESYNC sync
    class TMDB_LISTS,TMDB_MOVIE,TMDB_TV,YTS_SEARCH,TORRENT_FILES,TRACKER_STATS,SOURCE_VALIDATION external
    class DB_UPDATE database
```

### 5. Authentication & Security Flow

```mermaid
sequenceDiagram
    participant U as User
    participant A as API Gateway
    participant AUTH as Auth Service
    participant E as Encryption Service
    participant AUDIT as Audit Service
    participant DB as Database

    U->>A: Login request
    A->>AUTH: Validate credentials
    AUTH->>E: Request stored password hash
    E-->>AUTH: Hashed password
    AUTH->>AUTH: Compare with bcrypt

    alt Valid Credentials
        AUTH->>AUTH: Generate JWT tokens
        AUTH->>AUDIT: Log successful login
        AUTH->>DB: Store refresh token
        AUTH-->>A: Return JWT + refresh token
        A-->>U: Authentication successful
    else Invalid Credentials
        AUTH->>AUDIT: Log failed login attempt
        AUDIT->>DB: Store security event
        AUTH-->>A: Authentication failed
        A-->>U: Login error
    end

    Note over U,DB: Secure authentication with audit logging
```

### 6. Database Entity Relationships Flow

```mermaid
flowchart LR
    subgraph "Media Entities"
        MOVIE[Movie]
        TVSHOW[TVShow]
        SEASON[Season]
        EPISODE[Episode]
        GENRE[Genre]
        GENRE_TRANS[GenreTranslation]
    end

    subgraph "Source Management"
        MOVIE_SOURCE[MovieSource<br/>Torrent Links]
        STORAGE[Storage<br/>Download Progress]
    end

    subgraph "User Management"
        USER[User<br/>Authentication]
        REFRESH_TOKEN[RefreshToken<br/>JWT Management]
        TRAKT_USER[TraktUser<br/>External Integration]
    end

    subgraph "Content Organization"
        MEDIA_LIST[MediaList<br/>Curated Collections]
    end

    subgraph "System Management"
        SYNC_STATE[SyncState<br/>Sync Tracking]
        AUDIT_LOG[AuditLog<br/>Security Events]
    end

    %% Relationships
    MOVIE --> MOVIE_SOURCE
    MOVIE --> GENRE
    MOVIE --> MEDIA_LIST

    TVSHOW --> SEASON
    TVSHOW --> GENRE
    TVSHOW --> MEDIA_LIST

    SEASON --> EPISODE

    USER --> REFRESH_TOKEN
    USER --> TRAKT_USER
    USER --> AUDIT_LOG

    GENRE --> GENRE_TRANS

    MOVIE_SOURCE --> STORAGE

    %% Styling
    classDef media fill:#e8f5e8,stroke:#2e7d32,stroke-width:2px
    classDef source fill:#fff3e0,stroke:#ef6c00,stroke-width:2px
    classDef user fill:#e1f5fe,stroke:#0277bd,stroke-width:2px
    classDef content fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px
    classDef system fill:#ffebee,stroke:#c62828,stroke-width:2px

    class MOVIE,TVSHOW,SEASON,EPISODE media
    class MOVIE_SOURCE,STORAGE source
    class USER,REFRESH_TOKEN,TRAKT_USER user
    class MEDIA_LIST,GENRE,GENRE_TRANS content
    class SYNC_STATE,AUDIT_LOG system
```

### 7. Caching Strategy Flow

```mermaid
flowchart TD
    REQUEST[API Request] --> DB_CHECK{Database Check}

    DB_CHECK -->|Data Exists| RETURN_DB[Return Database Data]
    DB_CHECK -->|Data Missing| CACHE_CHECK{TMDB Cache Check}

    CACHE_CHECK -->|Cache Hit| RETURN_CACHED[Return Cached TMDB Data]
    CACHE_CHECK -->|Cache Miss| EXTERNAL_API[Call TMDB API]

    EXTERNAL_API --> TMDB_RESPONSE[TMDB API Response]
    TMDB_RESPONSE --> STORE_CACHE[Store in Cache]
    TMDB_RESPONSE --> STORE_DB[Store in Database]

    STORE_CACHE --> RETURN_FRESH[Return Fresh Data]
    STORE_DB --> RETURN_FRESH

    RETURN_CACHED --> STORE_DB_DELAYED[Store in Database<br/>for future direct access]

    %% Cache TTL Management
    STORE_CACHE -.->|TTL: 24hrs| EXPIRE_CACHE[Cache Expiration]

    %% Cache serves TMDB API only
    NOTE1[Cache Layer Purpose:<br/>- Avoid TMDB API rate limits<br/>- Reduce external API calls<br/>- Store TMDB responses only]

    %% Styling
    classDef database fill:#fff3e0,stroke:#ef6c00,stroke-width:2px
    classDef cache fill:#e8f5e8,stroke:#2e7d32,stroke-width:2px
    classDef external fill:#ffebee,stroke:#c62828,stroke-width:2px
    classDef process fill:#e1f5fe,stroke:#0277bd,stroke-width:2px
    classDef note fill:#f5f5f5,stroke:#9e9e9e,stroke-width:1px

    class STORE_DB,STORE_DB_DELAYED,RETURN_DB database
    class STORE_CACHE,RETURN_CACHED,CACHE_CHECK cache
    class EXTERNAL_API,TMDB_RESPONSE external
    class DB_CHECK,RETURN_FRESH,REQUEST process
    class NOTE1 note
```

### 8. Media Metadata Processing Flow

```mermaid
sequenceDiagram
    participant S as Scheduler
    participant MS as Media Service
    participant DB as Database
    participant C as TMDB Cache
    participant T as TMDB API

    Note over S,T: Background sync every 1.5 hours

    S->>MS: Trigger movie sync
    MS->>DB: Get movies needing update
    DB-->>MS: Return movie list

    loop For each movie
        MS->>C: Check TMDB cache
        alt Cache Hit
            C-->>MS: Return cached metadata
        else Cache Miss
            MS->>T: Fetch movie details
            T-->>MS: Return fresh metadata
            MS->>C: Store in cache
        end
        MS->>DB: Update movie record
    end

```

## Data Flow Characteristics

### Performance Optimizations

- **Database-First**: Check local data before external calls
- **TMDB API Caching**: Reduce external API rate limit impact
- **Background Processing**: Continuous data synchronization
- **Connection Pooling**: Efficient database connections
- **Lazy Loading**: On-demand content loading

### Security Measures

- **VPN Routing**: All external traffic through VPN
- **Audit Logging**: Complete activity tracking
- **Field Encryption**: Sensitive data encryption
- **JWT Security**: Secure token management

### Reliability Features

- **Multiple Sources**: 5 YTS mirror redundancy
- **Graceful Degradation**: Fallback mechanisms
- **Error Handling**: Comprehensive error recovery
- **Connection Monitoring**: VPN health checks

### Scalability Considerations

- **Async Processing**: Non-blocking operations
- **Rate Limiting**: Controlled API usage
- **Resource Management**: Memory and CPU optimization
- **Database Indexing**: Optimized query performance

## Cache Layer Specifications

### TMDB Cache Purpose

- **Primary Goal**: Avoid TMDB API rate limits
- **Secondary Goal**: Reduce external API latency
- **Cache Scope**: TMDB API responses only
- **TTL**: 24 hours for most metadata

### Data Priority Order

1. **Database**: Always check first for existing data
2. **TMDB Cache**: Only when database lacks data
3. **TMDB API**: Only when cache misses
4. **Database Storage**: Store fresh data for future direct access
