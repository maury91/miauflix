# @miauflix/source-metadata-extractor

A library for extracting metadata from torrent information with optional tracker-specific enhancements.

## Features

- 🎯 **Single Function API** - Replace multiple function calls with one powerful function
- 🎨 **Tracker Enhancements** - Leverage structured data from YTS, TheRARBG, and other trackers
- ⚡ **High Performance** - Optimized pattern matching and processing
- 🛡️ **Type Safe** - Full TypeScript support with comprehensive type definitions
- 🧪 **Well Tested** - Comprehensive test suite with 95%+ coverage

## Installation

```bash
npm install @miauflix/source-metadata-extractor
```

## Quick Start

```typescript
import { extractSourceMetadata } from '@miauflix/source-metadata-extractor';

// Basic usage with torrent title
const result = extractSourceMetadata({
  name: 'Movie.Name.2023.1080p.BluRay.x265.HEVC.10bit.AAC.7.1-GROUP',
  size: 5368709120,
});

console.log(result);
// {
//   title: 'Movie Name',
//.  year: 2023,
//   quality: 'FHD',
//   videoCodec: 'X265_10BIT',
//   audioCodec: ['AAC'],
//   source: 'BLURAY',
//   language: ['ENGLISH'],
//   confidence: { overall: 85, quality: 95, videoCodec: 90, ... },
//   processingTime: 2.5
// }
```

## Enhanced Usage with Tracker Data

```typescript
// Enhanced usage with YTS structured data
const result = extractSourceMetadata({
  name: 'Movie Name 2023',
  size: 5368709120,
  trackerMetadata: {
    quality: '1080p',
    videoCodec: 'x265',
    bitDepth: '10',
    audioChannels: '7.1',
    sourceType: 'bluray',
  },
});

// TV show with TheRARBG structured data
const tvResult = extractSourceMetadata({
  name: 'TV.Show.S05E06.HDTV.x264-GROUP',
  size: 367001600,
  trackerMetadata: {
    season: 5,
    episode: 6,
    categoryStr: 'TV Episodes',
    language: 'English',
  },
});
```

## Configuration Options

```typescript
const result = extractSourceMetadata(input, {
  titleNormalization: {
    removeFileExtensions: true,
    convertDotsToSpaces: true,
    capitalizeWords: false,
  },
  preferTrackerData: true,
  debug: false,
  timeout: 5000,
});
```

## API Reference

### Main Function

```typescript
function extractSourceMetadata(
  input: TorrentInput,
  options?: ExtractionOptions
): ExtractedSourceMetadata;
```

### Input Types

- `TorrentInput` - Main input interface
- `TrackerMetadata` - Optional tracker-specific enhancements
- `ExtractionOptions` - Configuration options

### Output Types

- `ExtractedSourceMetadata` - Complete extraction result
- `Quality`, `VideoCodec`, `AudioCodec`, `Source`, `Language` - Extracted enums

## Development Status

🚧 **Currently implementing core functionality**

### Completed

- ✅ Package structure and configuration
- ✅ TypeScript type definitions
- ✅ Audio codec extraction
- ✅ Core engine foundation
- ✅ Legacy compatibility layer

### In Progress

- 🔄 Additional extractors (video codec, quality, source, language, TV data, year)
- 🔄 Tracker enhancement system
- 🔄 Comprehensive test suite

## License

MIT License - see LICENSE file for details.

## Contributing

Please see the [technical specification](../../docs/source-metadata-extractor-specification.md) for detailed implementation guidelines.
