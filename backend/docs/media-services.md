# Media Services

The backend provides comprehensive media information and content discovery services through multiple providers and trackers.

## TMDB Integration

### Movies

- **Complete synchronization**: Full movie metadata including cast, crew, ratings, and images
- **Periodic updates**: Automated synchronization to keep content fresh
- **Multi-language support**: Content available in multiple languages with fallback mechanisms
- **Genre categorization**: Automatic genre assignment and management
- **List metadata**: Catalog metadata only; provider-backed lists are owned by the standalone list service

### TV Shows

- **Show-level synchronization**: Complete TV show metadata and information
- **Season and episode data**: Detailed season and episode information
- **Cast and crew information**: Full cast and crew details for shows
- **Episode tracking**: Individual episode metadata and air dates
- **Series status tracking**: Ongoing, ended, and cancelled show status

### Features

- **Caching system**: Intelligent caching to reduce API calls and improve performance
- **Rate limiting**: Respectful API usage with built-in rate limiting
- **Error handling**: Robust error handling with retry mechanisms
- **Data validation**: Comprehensive validation of incoming TMDB data

## List Service and Trakt association

Trakt is owned by the standalone List Service. It provides public Trakt lists and
authenticated personal lists, and stores encrypted Trakt credentials there. A user
can associate a Trakt account from an authenticated Miauflix session through
`/api/integrations/trakt/*`; Trakt credentials never create or authenticate a
Miauflix session.

## Content Discovery

### YTS Tracker Integration

- **Movie Search**: Comprehensive movie search with quality filtering
- **Magnet Links**: Extraction and validation of magnet links
- **Metadata Parsing**: Torrent metadata extraction using WebTorrent
- **Quality Filtering**: Support for different video qualities (720p, 1080p, 4K)
- **Content Categorization**: Automatic categorization by genre and release year
- **Availability Tracking**: Monitor content availability and seed counts

### WebTorrent Integration

- **Magnet Conversion**: Convert magnet links to torrent objects
- **Metadata Extraction**: Parse torrent files for detailed information
- **File Analysis**: Analyze torrent contents for media files
- **Streaming Preparation**: Prepare torrents for streaming capabilities

## Media Management

### Lists

- **Public lists**: Trakt-backed popular and trending lists
- **Personal lists**: Trakt watchlists, favorites, and history after account association
- **Local projection**: Backend stores only resolved membership needed for playback

### Search

- **Multi-source Search**: Search across TMDB and tracker sources
- **Advanced Filtering**: Filter by genre, year, rating, quality
- **Result Ranking**: Intelligent ranking of search results
- **Cache Optimization**: Cached search results for improved performance

### Synchronization

- **Automated Sync**: Scheduled synchronization with external sources
- **Incremental Updates**: Only sync changed content to reduce load
- **Conflict Resolution**: Handle conflicts between different data sources
- **Data Integrity**: Ensure data consistency across all sources

## API Endpoints

### Movies

- `GET /api/movies` - List movies with pagination and filtering
- `GET /api/movies/:id` - Get detailed movie information
- `POST /api/movies/sync` - Trigger movie synchronization
- `GET /api/movies/search` - Search movies across sources

### TV Shows

- `GET /api/tvshows` - List TV shows with pagination and filtering
- `GET /api/tvshows/:id` - Get detailed TV show information
- `GET /api/tvshows/:id/seasons` - Get seasons for a TV show
- `GET /api/tvshows/:id/seasons/:season/episodes` - Get episodes for a season

### Lists

- `GET /api/lists` - Get user lists
- `GET /api/list/:slug` - Read a projected list page
- `POST /api/integrations/trakt/authorization` - Start authenticated Trakt association
- `POST /api/integrations/trakt/authorization/:authorizationId/check` - Poll association
- `GET /api/integrations/trakt/association` - Inspect association
- `DELETE /api/integrations/trakt/association` - Disconnect Trakt

### Search

- `GET /api/search` - Universal search across all sources
- `GET /api/search/movies` - Movie-specific search
- `GET /api/search/tvshows` - TV show-specific search

## Configuration

### Environment Variables

```env
# TMDB Configuration
TMDB_API_KEY=your-tmdb-api-key
TMDB_BASE_URL=https://api.themoviedb.org/3
TMDB_LANGUAGE=en-US

# Trakt.tv configuration is owned by the standalone list service.
# Configure it through the list-service container/environment, not the backend.

# YTS Configuration
YTS_BASE_URL=https://yts.mx/api/v2
YTS_CACHE_TTL=3600

# Cache Configuration
CACHE_TTL_MOVIES=86400
CACHE_TTL_TVSHOWS=86400
CACHE_TTL_SEARCH=3600
```

## Performance Considerations

### Caching Strategy

- **Multi-level caching**: Database and in-memory caching
- **TTL-based expiration**: Configurable cache expiration times
- **Cache invalidation**: Smart cache invalidation on updates
- **Preemptive caching**: Cache popular content in advance

### Rate Limiting

- **API Rate Limits**: Respect external API rate limits
- **User Rate Limits**: Limit user requests to prevent abuse
- **Burst Handling**: Handle traffic spikes gracefully
- **Queue Management**: Queue requests during high load periods

### Database Optimization

- **Indexing**: Proper database indexing for search performance
- **Query Optimization**: Optimized database queries
- **Connection Pooling**: Efficient database connection management
- **Batch Operations**: Batch database operations where possible
