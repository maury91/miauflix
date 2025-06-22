# @miauflix/therarbg-sanitizer

A shared library for sanitizing TheRarBG API data across Miauflix projects. Provides consistent fake data generation for testing and development with intelligent torrent name parsing to preserve technical metadata.

## Features

- **Intelligent Torrent Name Sanitization**: Advanced parsing that identifies and preserves technical metadata (resolution, codecs, release groups) while only modifying the movie title portion
- **Comprehensive API Coverage**: Supports both GetPosts and IMDB Detail endpoints
- **Deterministic Output**: Same input always produces the same sanitized output
- **Legal Hash Integration**: 60% probability of using known legal torrent hashes
- **IMDB-Aware**: Uses IMDB movie titles as hints for better title generation
- **Technical Metadata Preservation**: Maintains all quality indicators, codecs, and release information

## Installation

```bash
npm install @miauflix/therarbg-sanitizer
```

## Usage

### Basic Sanitization

```typescript
import { sanitize } from '@miauflix/therarbg-sanitizer';

// Sanitize any TheRarBG API response
const sanitizedData = sanitize(originalApiResponse);
```

### Torrent Name Parsing

The library includes sophisticated torrent name parsing that preserves technical metadata:

```typescript
import { parseTorrentName, sanitizeTorrentName } from '@miauflix/therarbg-sanitizer';

// Parse a torrent name into components
const parsed = parseTorrentName('The.Matrix.1999.1080p.BluRay.x264-GROUP');
console.log(parsed);
// {
//   original: 'The.Matrix.1999.1080p.BluRay.x264-GROUP',
//   title: 'The Matrix',
//   year: '1999',
//   resolution: '1080p',
//   source: 'BluRay',
//   videoCodec: 'x264',
//   releaseGroup: '-GROUP',
//   technicalParts: [],
//   parsed: true
// }

// Sanitize while preserving technical metadata and original structure
const sanitized = sanitizeTorrentName(
  'The.Matrix.1999.1080p.BluRay.x264-GROUP',
  'Fake Movie Title'
);
console.log(sanitized);
// 'Fake.Movie.Title.1999.1080p.BluRay.x264-GROUP'
// Note: The separator style (dots) and exact structure are preserved
```

### Supported Torrent Name Patterns

The parser handles various torrent naming formats:

- `Movie.Title.2023.1080p.BluRay.x264-GROUP`
- `Movie Title (2023) [1080p] [YTS.MX]`
- `Movie.Title.2023.2160p.4K.UHD.HDR.x265-GROUP`
- `Le.Film.2023.FRENCH.1080p.BluRay.x265-GROUP`
- `Movie.Title.2023.1080p.WEB-DL.DDP5.1.H.264-GROUP`

### Specific Endpoint Sanitization

```typescript
import { sanitizeGetPostsResponse, sanitizeImdbDetailResponse } from '@miauflix/therarbg-sanitizer';

// Sanitize GetPosts response (paginated torrent listings)
const sanitizedPosts = sanitizeGetPostsResponse(getPostsResponse, {
  maxTorrents: 25,
  legalHashProbability: 0.8,
});

// Sanitize IMDB detail response (movie metadata + torrents)
const sanitizedDetail = sanitizeImdbDetailResponse(imdbDetailResponse, {
  maxTorrents: 50,
});
```

### Options

```typescript
interface SanitizationOptions {
  /** Maximum number of torrents to include in responses (default: 50) */
  maxTorrents?: number;
  /** Whether to use legal hashes for torrents (default: true) */
  useLegalHashes?: boolean;
  /** Probability of using a legal hash vs random hash (default: 0.6) */
  legalHashProbability?: number;
}
```

## API Reference

### Main Functions

- `sanitize(data, url?, options?)` - Main sanitization function for any TheRarBG API response
- `sanitizeGetPostsResponse(response, options?)` - Sanitize paginated torrent listings
- `sanitizeImdbDetailResponse(response, options?)` - Sanitize movie detail responses

### Torrent Sanitization

- `sanitizeTorrent(torrent, options?, seen?, imdbTitle?)` - Sanitize individual GetPosts torrents
- `sanitizeImdbDetailPost(post, options?, seen?, imdbTitle?)` - Sanitize IMDB detail torrents
- `sanitizeMovieMetadata(metadata)` - Sanitize IMDB movie metadata

### Torrent Name Parsing

- `parseTorrentName(name)` - Parse torrent name into components
- `reconstructTorrentName(parsed, newTitle)` - Rebuild name with new title
- `sanitizeTorrentName(originalName, newTitle)` - One-step sanitization

### Utility Functions

- `generateTitle(id, imdbTitle?)` - Generate fake movie titles
- `generatePersonName(id)` - Generate fake person names
- `generateUsername(id)` - Generate fake usernames
- `generateUrl(id, original)` - Generate fake URLs while preserving structure
- `generateImdbCode(id, original?)` - Generate fake IMDB codes
- `replacementHash(original, probability?)` - Generate replacement torrent hashes

## Data Sanitized

### GetPosts Torrents

- Torrent names (`n` field) with intelligent parsing
- Uploader usernames (`u` field)
- IMDB IDs (`i` field)
- Info hashes (`h` field)

### IMDB Detail Posts

- All GetPosts fields plus:
- Descriptions (`descr` field)
- File names and paths
- Tracker URLs
- Image URLs
- Thumbnail URLs

### Movie Metadata

- Movie names and titles
- Actor and director names
- Plot descriptions
- Image and thumbnail URLs
- Critics consensus

## Technical Metadata Preservation

The intelligent torrent name parser preserves:

- **Resolution**: 720p, 1080p, 2160p, 4K, 8K, etc.
- **Video Codecs**: x264, x265, H.264, H.265, HEVC, AVC, VP9, AV1, etc.
- **Audio Codecs**: DTS, DTS-HD.MA, AAC, AC3, TrueHD, FLAC, etc.
- **Sources**: BluRay, WEB-DL, WEBRip, DVDRip, HDTV, etc.
- **HDR**: HDR10, Dolby Vision (DV), etc.
- **Release Groups**: [YIFY], [RARBG], -GROUP, etc.
- **Years**: 1900-2099
- **Other Technical Terms**: REMASTERED, EXTENDED, UNCUT, etc.

## Error Handling

The library includes comprehensive error handling:

```typescript
try {
  const sanitized = sanitize(malformedData);
} catch (error) {
  if (error.name === 'TorrentNameParsingError') {
    console.log('Failed to parse:', error.originalName);
    console.log('Reason:', error.reason);
  }
}
```

## Deterministic Behavior

All functions use seed-based randomization to ensure:

- Same input always produces same output
- Reproducible test results
- Consistent data across multiple runs

## Legal Compliance

The library includes a curated list of legal torrent hashes from public domain and Creative Commons content, ensuring test data uses only legitimate torrents.

## License

Part of the Miauflix project.
