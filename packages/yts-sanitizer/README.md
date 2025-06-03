# @miauflix/yts-sanitizer

A shared library for sanitizing YTS API data across Miauflix projects. Provides consistent fake data generation for testing and development environments.

## Features

- **Consistent Data Generation**: Uses seeded random generation to ensure deterministic fake data
- **Comprehensive Sanitization**: Handles movies, torrents, cast members, titles, descriptions, URLs, and more
- **TypeScript Support**: Full type definitions included
- **Configurable**: Customizable sanitization options
- **Yarn Workspace**: Designed for use in Yarn monorepos

## Installation

This package is part of the Miauflix Yarn workspace. Install dependencies from the workspace root:

```bash
yarn install
```

## Usage

### Basic Sanitization

```typescript
import { sanitize } from '@miauflix/yts-sanitizer';

// Sanitize YTS API response data
const sanitizedData = sanitize(ytsApiResponse);
```

### Advanced Usage with Options

```typescript
import { sanitize, type SanitizationOptions } from '@miauflix/yts-sanitizer';

const options: SanitizationOptions = {
  maxMovies: 25, // Limit number of movies in responses
  useLegalHashes: true, // Use known public domain hashes
  legalHashProbability: 0.7, // 70% chance of using legal hashes
};

const sanitizedData = sanitize(ytsApiResponse, undefined, options);
```

### Individual Component Sanitization

```typescript
import { sanitizeMovie, sanitizeTorrent, sanitizeCastMember } from '@miauflix/yts-sanitizer';

// Sanitize individual components
const sanitizedMovie = sanitizeMovie(movieData);
const sanitizedTorrent = sanitizeTorrent(torrentData);
const sanitizedCast = sanitizeCastMember(castData);
```

### Utility Functions

```typescript
import {
  generateTitle,
  generatePersonName,
  generateDescription,
  clearCache,
} from '@miauflix/yts-sanitizer';

// Generate specific fake data
const fakeTitle = generateTitle('movie_123');
const fakeName = generatePersonName(456);
const fakeDesc = generateDescription('desc_789', 'Original description');

// Clear internal cache (useful for testing)
clearCache();
```

## API Reference

### Main Functions

- `sanitize(data, url?, options?)` - Main sanitization function for YTS API responses
- `sanitizeMovie(movie, options?)` - Sanitize a single movie object
- `sanitizeTorrent(torrent, options?)` - Sanitize torrent data
- `sanitizeCastMember(castMember)` - Sanitize cast member data

### Utility Functions

- `generateTitle(id)` - Generate fake movie title
- `generatePersonName(id)` - Generate fake person name
- `generateDescription(id, original)` - Generate fake description
- `generateUrl(id, original)` - Generate fake URL
- `generateTrailerCode(id, original)` - Generate fake YouTube trailer code
- `generateImdbCode(id, original)` - Generate fake IMDB code
- `clearCache()` - Clear internal data cache

### Types

- `YTSMovie` - Movie data structure
- `YTSTorrent` - Torrent data structure
- `YTSCastMember` - Cast member data structure
- `YTSApiResponse` - YTS API response types
- `SanitizationOptions` - Configuration options

## Configuration Options

```typescript
interface SanitizationOptions {
  maxMovies?: number; // Maximum movies in responses (default: 50)
  useLegalHashes?: boolean; // Use known public domain hashes (default: true)
  legalHashProbability?: number; // Probability of using legal hashes (default: 0.6)
}
```

## Development

### Building

```bash
yarn workspace @miauflix/yts-sanitizer build
```

### Testing

```bash
yarn workspace @miauflix/yts-sanitizer test
```

### Watch Mode

```bash
yarn workspace @miauflix/yts-sanitizer build:watch
```

## License

Part of the Miauflix project.
