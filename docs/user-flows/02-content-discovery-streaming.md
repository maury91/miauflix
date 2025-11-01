# Content Discovery & Streaming User Flows

## Overview

Miauflix provides a comprehensive content discovery and streaming experience with category-based browsing, advanced search capabilities, and full-featured video playback. The system integrates with TMDB for metadata and uses WebTorrent for peer-to-peer streaming.

## 1. Home Screen & Content Discovery Flow

The main content discovery interface organized by categories with horizontal scrolling.

```mermaid
graph TD
    A[User Authenticated] --> B[Load Home Categories]
    B --> C[Fetch Category Data]
    C --> D{Data Available?}
    D -->|Yes| E[Render Category Sliders]
    D -->|No| F[Show Loading State]
    F --> C
    E --> G[Display Content Grid]
    G --> H[User Browses Categories]
    H --> I[Select Media Item]
    I --> J[Navigate to Media Details]
    
    H --> K[Scroll Horizontal Sliders]
    K --> L{More Content Available?}
    L -->|Yes| M[Load Next Page]
    L -->|No| N[End of Category]
    M --> G
```

**Key Components:**
- **Home Controller**: `frontend/src/app/pages/home/`
- **Category Sliders**: `frontend/src/app/pages/home/components/categorySlider.tsx`
- **Media Boxes**: `frontend/src/app/pages/home/components/mediaBox.tsx`
- **API Integration**: `frontend/src/store/api/lists.ts`

## 2. Content Categories & Organization

Multiple content categories provide organized browsing experience.

```mermaid
graph LR
    A[Home Categories] --> B[Popular Movies]
    A --> C[Trending Shows]
    A --> D[New Releases]
    A --> E[Top Rated]
    A --> F[Genre-based]
    A --> G[User Watchlists]
    
    B --> H[Horizontal Slider]
    C --> H
    D --> H
    E --> H
    F --> H
    G --> H
    
    H --> I[Media Box Grid]
    I --> J[Poster + Title + Rating]
```

## 3. Media Detail View Flow

Comprehensive media information display with streaming preparation.

```mermaid
sequenceDiagram
    participant U as User
    participant F as Frontend
    participant API as Backend API
    participant TMDB as TMDB Service

    U->>F: Click on media item
    F->>F: Navigate to details view
    F->>API: GET /api/movies/{id} or /api/shows/{id}
    API->>TMDB: Fetch detailed metadata
    TMDB-->>API: Media details + cast + ratings
    API-->>F: Complete media information
    F->>F: Render detailed view
    
    U->>F: Select quality/episode
    F->>API: Generate streaming key
    API-->>F: Streaming token
    F->>F: Prepare player launch
```

**Implementation Details:**
- **Movie Details**: `frontend/src/app/pages/home/components/moviePage.tsx`
- **TV Show Details**: `frontend/src/app/pages/home/components/tvShowPage.tsx`
- **Media Details**: `frontend/src/app/pages/home/components/mediaDetails.tsx`
- **Season Selection**: `frontend/src/app/pages/home/components/seasonSelector.tsx`

## 4. Search & Discovery Flow

Advanced search capabilities with real-time results.

```mermaid
graph TD
    A[User Opens Search] --> B[Show Search Interface]
    B --> C[User Types Query]
    C --> D[Debounced Search API Call]
    D --> E[Backend Searches Multiple Sources]
    E --> F[TMDB + Local Database]
    F --> G[Return Merged Results]
    G --> H[Display Search Results]
    H --> I[User Selects Result]
    I --> J[Navigate to Media Details]
    
    C --> K{Query Too Short?}
    K -->|Yes| L[Show Search Suggestions]
    K -->|No| D
```

**Search Features:**
- **Real-time Search**: Debounced input with instant results
- **Multi-source**: TMDB integration + local database
- **Search Interface**: `frontend/src/app/pages/home/components/sidebar.tsx`
- **Spatial Navigation**: TV remote control support

## 5. TV Shows & Episode Selection Flow

Specialized flow for TV show content with season and episode management.

```mermaid
graph TD
    A[Select TV Show] --> B[Load Show Details]
    B --> C[Display Seasons List]
    C --> D[User Selects Season]
    D --> E[Load Episodes for Season]
    E --> F[Display Episode Grid]
    F --> G[User Selects Episode]
    G --> H[Load Episode Details]
    H --> I[Show Streaming Options]
    I --> J[Generate Episode Streaming Key]
    J --> K[Launch Video Player]
    
    F --> L[Continue Watching]
    L --> M[Auto-select Next Episode]
    M --> J
```

**TV Show Specific Components:**
- **Season Selector**: Episode navigation interface
- **Episode Streaming**: `frontend/src/app/pages/home/hooks/useEpisodeStreaming.tsx`
- **Progress Tracking**: Resume watching from last position
- **Auto-play**: Next episode functionality

## 6. Quality Selection & Streaming Preparation

Advanced quality selection with codec preferences.

```mermaid
sequenceDiagram
    participant U as User
    participant F as Frontend
    participant Stream as Stream Service
    participant Sources as Source Providers

    U->>F: Select "Watch Now"
    F->>F: Show quality selection
    U->>F: Choose quality preference
    F->>Stream: Request streaming key with preferences
    Stream->>Sources: Search available sources
    Sources-->>Stream: Available torrents by quality
    Stream->>Stream: Select best match (quality + seeders)
    Stream-->>F: Streaming token + selected quality
    F->>F: Launch video player with token
    
    Note over Stream,Sources: Real-time source discovery with 3s timeout
```

**Quality Options:**
- **Resolutions**: 720p, 1080p, 4K support
- **Codecs**: H.264, HEVC (x265) with preferences
- **Source Selection**: Automatic best source based on seeders/quality
- **Fallback Logic**: Quality degradation if preferred not available

## 7. Video Streaming Flow

Full-featured video player with progress tracking and controls.

```mermaid
graph TD
    A[Launch Player with Token] --> B[Initialize Video Player]
    B --> C[Request Stream from Backend]
    C --> D[Backend Validates Token]
    D --> E{Token Valid?}
    E -->|No| F[Return to Details]
    E -->|Yes| G[Start WebTorrent Stream]
    G --> H[Begin Video Playback]
    H --> I[Track Progress]
    I --> J[Save Progress to Database]
    
    H --> K[User Controls]
    K --> L[Play/Pause/Seek]
    K --> M[Volume Control]
    K --> N[Fullscreen Toggle]
    K --> O[Subtitle Selection]
    
    L --> I
    M --> I
    N --> I
    O --> P[Load Subtitle Track]
    P --> I
    
    I --> Q{Video Ended?}
    Q -->|Yes| R[Mark as Watched]
    Q -->|No| S[Continue Tracking]
    R --> T[Show Next Episode/Movie]
    S --> I
```

**Player Features:**
- **Multi-Platform**: Web and Tizen TV support
- **Progress Tracking**: `frontend/src/app/pages/player/hooks/useTrackProgress.tsx`
- **Subtitle Support**: `frontend/src/app/pages/player/components/playerSubtitles.tsx`
- **Controls**: `frontend/src/app/pages/player/components/playerInterface.tsx`

## 8. Streaming Architecture & Backend Integration

Technical flow showing streaming infrastructure.

```mermaid
sequenceDiagram
    participant P as Player
    participant API as Backend API
    participant WT as WebTorrent Client
    participant Sources as Torrent Sources
    participant CDN as Peer Network

    P->>API: GET /api/stream/{token}
    API->>API: Validate streaming token
    API->>WT: Request torrent stream
    WT->>Sources: Search for content hash
    Sources-->>WT: Torrent metadata
    WT->>CDN: Connect to peer network
    CDN-->>WT: Begin downloading chunks
    WT->>API: Stream video chunks
    API->>P: HTTP Range response
    
    Note over P,CDN: Peer-to-peer streaming with HTTP interface
```

**Backend Streaming Service:**
- **Stream Endpoint**: `/api/stream/:token` with range request support
- **WebTorrent Integration**: Real-time peer-to-peer streaming
- **Quality Selection**: Automatic source optimization
- **Security**: Time-limited streaming tokens with validation

## 9. Progress Tracking & Resume Watching

Sophisticated watch progress management across devices.

```mermaid
graph TD
    A[Video Playback Starts] --> B[Initialize Progress Tracking]
    B --> C[Track Current Time]
    C --> D[Update Progress Every 10s]
    D --> E[Save to Backend Database]
    E --> F{Video Ended?}
    F -->|No| C
    F -->|Yes| G[Mark as Completed]
    G --> H[Update Watch Status]
    
    I[User Returns to Content] --> J[Check Existing Progress]
    J --> K{Progress Found?}
    K -->|Yes| L[Show Resume Option]
    K -->|No| M[Start from Beginning]
    L --> N[Resume from Saved Position]
    N --> C
    M --> C
```

**Progress Features:**
- **Auto-Save**: Progress saved every 10 seconds during playback
- **Resume Watching**: Automatic resume from last position
- **Cross-Device**: Progress synced across all user devices
- **Watch Status**: Completed/In Progress/Not Started tracking

## 10. Content Preloading & Performance

Optimized content loading for smooth user experience.

```mermaid
graph TD
    A[Home Page Load] --> B[Priority Content Loading]
    B --> C[Load Above-fold Categories]
    C --> D[Preload Popular Content Images]
    D --> E[Background Load Remaining Categories]
    
    F[User Scrolls] --> G[Lazy Load Images]
    G --> H[Prefetch Next Page Content]
    
    I[User Hovers Media] --> J[Preload Basic Metadata]
    J --> K[Cache for Quick Details Load]
    
    L[User Selects Media] --> M[Load Full Metadata]
    M --> N[Preload Streaming Sources]
```

**Performance Features:**
- **Image Preloading**: `frontend/src/app/pages/home/hooks/usePreloadHomeImages.ts`
- **Lazy Loading**: Content loaded as user scrolls
- **Caching Strategy**: RTK Query automatic caching
- **Prefetching**: Next page content loaded in background

## 11. Spatial Navigation (TV/Remote Control)

Specialized navigation system for TV interfaces.

```mermaid
graph TD
    A[Remote Key Press] --> B[Spatial Navigation Handler]
    B --> C{Direction Key?}
    C -->|Up/Down| D[Navigate Between Rows]
    C -->|Left/Right| E[Navigate Within Slider]
    C -->|Enter/Select| F[Select Current Item]
    
    D --> G[Update Focus State]
    E --> G
    F --> H[Execute Selection Action]
    
    G --> I[Update Visual Focus]
    I --> J[Scroll to Keep in View]
    H --> K[Navigate to Details/Player]
```

**TV Navigation Features:**
- **Focus Management**: Visual focus indicators
- **Smooth Scrolling**: Automatic scrolling to keep focused items visible
- **Remote Control**: Full support for TV remote controls
- **Platform Support**: Tizen TV optimized interface

## Technical Implementation

### State Management
- **Home State**: `frontend/src/store/slices/home.ts`
- **Stream State**: `frontend/src/store/slices/stream.ts`
- **UI State**: Loading, error, and navigation states

### API Integration
- **Content APIs**: Movies, shows, lists, and media APIs
- **Streaming API**: Token generation and validation
- **Progress API**: Watch progress tracking

### Real-time Features
- **Live Source Discovery**: Real-time torrent source searching
- **Dynamic Quality Selection**: Automatic best source selection
- **Progress Synchronization**: Real-time progress updates

## User Experience Considerations

### Performance
- **Fast Category Loading**: Optimized API calls and caching
- **Smooth Scrolling**: Hardware-accelerated animations
- **Instant Search**: Debounced search with real-time results

### Accessibility
- **Keyboard Navigation**: Full keyboard support
- **Screen Reader**: ARIA labels and semantic markup
- **High Contrast**: Support for accessibility themes

### Mobile/TV Optimization
- **Responsive Design**: Adaptive UI for all screen sizes
- **Touch Gestures**: Swipe navigation on mobile
- **Remote Control**: Complete TV remote support