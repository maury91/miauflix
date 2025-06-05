# HTTP VCR Testing Infrastructure

The HTTP VCR (Video Cassette Recorder) testing system provides sophisticated HTTP request recording and replay capabilities for deterministic testing of external API integrations. This infrastructure enables reliable testing by capturing real HTTP responses and replaying them during test execution.

## Overview

The HTTP VCR system consists of several components that work together to intercept, transform, and replay HTTP requests:

- **[`http-vcr.ts`](../backend/src/__test-utils__/http-vcr.ts)**: Core VCR implementation with fetch interception
- **[`http-vcr.config.ts`](../backend/src/__test-utils__/http-vcr.config.ts)**: Configuration and provider mappings
- **[`types.ts`](../backend/src/__test-utils__/http-vcr-utils/types.ts)**: TypeScript interfaces and type definitions
- **Transformer utilities**: Custom data transformation for specific APIs

## Architecture

### Core Components

#### VCR Modes

The system supports four distinct operating modes:

1. **`disabled`**: VCR is completely disabled, all requests go through normally
2. **`record`**: Records all HTTP responses to fixture files
3. **`replay`**: Only uses cached responses, throws errors for missing fixtures
4. **`hybrid`**: Uses cached responses when available, records new ones when missing

#### Fetch Interception

The system replaces the global `fetch` function with a custom implementation:

```typescript
const originalFetch = global.fetch;
global.fetch = fetchMock as unknown as typeof global.fetch;
```

This interceptor:

- Filters requests based on include/exclude patterns
- Routes requests through provider-specific handling
- Manages fixture storage and retrieval
- Applies transformations to response data

### Configuration System

#### Provider Mapping

The system organizes fixtures by API provider for better organization:

```typescript
providerMap: [
  { pattern: 'api.themoviedb.org', name: 'tmdb' },
  { pattern: 'api.trakt.tv', name: 'trakt' },
  { pattern: 'yts.mx', name: 'yts' },
  { pattern: 'yts.rs', name: 'yts' },
  { pattern: 'torrage.info', name: 'torrage' },
  { pattern: 'itorrents.org', name: 'itorrents' },
];
```

#### Headers Blacklisting

Certain headers are automatically filtered out to ensure fixture stability:

```typescript
headersBlacklist: [
  'accept-ranges',
  'age',
  'alt-svc',
  'cf-cache-status',
  'cf-ray',
  'content-encoding',
  'connection',
  'date',
  'etag',
  'expires',
  'server',
  'set-cookie',
  'vary',
];
```

### Fixture Management

#### File Organization

Fixtures are organized in a hierarchical structure:

```
backend/test-fixtures/
├── tmdb/
│   ├── movie/
│   └── search/
├── yts/
│   ├── api/v2/
│   └── list_movies.json
├── torrage/
└── other/
```

#### Fixture Format

Each fixture contains the complete HTTP response data:

```typescript
interface StoredResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: unknown; // String or parsed JSON
  bodyIsJson?: boolean; // Indicates JSON parsing
  isTransformed?: boolean; // Indicates data transformation
}
```

#### Filename Generation

URLs are converted to filesystem-safe paths using [`urlToFilepath`](../backend/src/__test-utils__/http-vcr-utils/url.ts):

```typescript
function urlToFilepath(
  url: string,
  providerMap: Array<{ pattern: string; name: string }>,
  defaultProvider: string,
  fixturesDir: string
): string;
```

## Data Transformation System

### Transformer Configuration

Transformers are configured per URL pattern to modify response data:

```typescript
transformers: [
  {
    urlPattern: 'yts\\..*\\/api\\/v2\\/',
    transform: transformYtsData,
  },
];
```

### YTS Data Transformer

The [`yts.transformer.ts`](../backend/src/__test-utils__/http-vcr-utils/yts.transformer.ts) sanitizes YTS API responses:

- **Peer Information**: Removes or anonymizes peer data
- **Torrent URLs**: Sanitizes download URLs
- **Timing Data**: Normalizes timestamps
- **Personal Data**: Removes potentially sensitive information

### Custom Transformers

Transformers receive the stored response and return modified data:

```typescript
interface Transformer {
  urlPattern: string;
  transform: (data: StoredResponse) => StoredResponse;
}
```

Example transformer implementation:

```typescript
function sanitizeApiResponse(response: StoredResponse): StoredResponse {
  if (response.bodyIsJson && typeof response.body === 'object') {
    const sanitized = {
      ...response.body,
      // Remove sensitive fields
      api_key: '[REDACTED]',
      user_data: undefined,
    };

    return {
      ...response,
      body: sanitized,
      isTransformed: true,
    };
  }
  return response;
}
```

## Operating Modes

### Record Mode

When `mode: 'record'`:

1. All matching requests are sent to real APIs
2. Responses are captured and stored as fixtures
3. Headers are filtered according to blacklist
4. Transformers are applied to sanitize data
5. Fixtures are written with configurable JSON formatting

### Replay Mode

When `mode: 'replay'`:

1. Only cached responses are returned
2. Missing fixtures cause test failures
3. Ensures completely deterministic testing
4. No external network requests are made

### Hybrid Mode

When `mode: 'hybrid'`:

1. Uses cached responses when available
2. Records new responses for missing fixtures
3. Automatically updates fixtures with:
   - Blacklisted header removal
   - Data transformations
   - Format improvements

### Disabled Mode

When `mode: 'disabled'`:

1. VCR system is completely bypassed
2. All requests go through normally
3. Useful for integration testing with live APIs

## Configuration Options

### Environment Variables

The system can be configured via environment variables:

```bash
# Set VCR mode
HTTP_VCR_MODE=hybrid

# Custom fixtures directory
HTTP_VCR_FIXTURES_DIR=/path/to/fixtures
```

### Runtime Configuration

Modify [`http-vcr.config.ts`](../backend/src/__test-utils__/http-vcr.config.ts) for:

```typescript
export const HTTP_VCR_CONFIG: HttpVcrConfig = {
  mode: 'hybrid',
  fixturesDir: './test-fixtures',
  includePatterns: [],          // Empty = include all
  excludePatterns: [],          // URLs to exclude
  providerMap: [...],           // Provider mappings
  defaultProvider: 'other',     // Fallback provider
  headersBlacklist: [...],      // Headers to filter
  prettyPrintJson: true,        // Format JSON fixtures
  transformers: [...],          // Data transformers
  autoTransform: true           // Auto-apply transformations
};
```

### Filtering Requests

#### Include Patterns

Specify which URLs to intercept:

```typescript
includePatterns: ['api.themoviedb.org', 'yts.mx'];
```

#### Exclude Patterns

Specify which URLs to ignore:

```typescript
excludePatterns: ['localhost', '127.0.0.1'];
```

## Testing Workflow

### Setup

Import the VCR system in test files:

```typescript
import '../__test-utils__/http-vcr'; // Enables VCR for all tests
```

### Test Structure

```typescript
describe('API Integration Tests', () => {
  beforeEach(() => {
    // VCR automatically clears mock state
  });

  it('should fetch movie data', async () => {
    // This request will be recorded/replayed based on VCR mode
    const response = await fetch('https://api.themoviedb.org/3/movie/123');
    const data = await response.json();

    expect(data.title).toBeDefined();
    expect(data.id).toBe(123);
  });
});
```

### Fixture Management

#### Recording New Fixtures

1. Set `mode: 'record'` in configuration
2. Run tests to capture real API responses
3. Review fixtures for sensitive data
4. Set `mode: 'replay'` for deterministic testing

#### Updating Existing Fixtures

1. Use `mode: 'hybrid'` for automatic updates
2. Delete specific fixtures to force re-recording
3. Update transformers to modify captured data
4. Enable `autoTransform` for automatic sanitization

## Best Practices

### Fixture Organization

1. **Provider Separation**: Use provider mapping for clear organization
2. **Descriptive Names**: URL-based naming for easy identification
3. **Version Control**: Commit fixtures to ensure consistent test environments
4. **Size Management**: Monitor fixture file sizes and clean up unused files

### Data Sanitization

1. **Remove Secrets**: Use transformers to remove API keys and tokens
2. **Anonymize Data**: Replace personal information with generic data
3. **Normalize Timestamps**: Use fixed dates for deterministic testing
4. **Sanitize URLs**: Remove sensitive parameters from URLs

### Test Reliability

1. **Deterministic Data**: Ensure fixtures contain stable, predictable data
2. **Error Scenarios**: Record error responses for comprehensive testing
3. **Edge Cases**: Capture unusual API responses and empty results
4. **Timeout Handling**: Test with both fast and slow response fixtures

### Security Considerations

1. **Sensitive Data**: Never commit fixtures containing real secrets
2. **Privacy**: Remove personal information from API responses
3. **API Keys**: Use placeholder values in fixtures
4. **Review Process**: Regularly audit fixtures for sensitive content

## Troubleshooting

### Common Issues

#### Missing Fixtures

```
Error: No cached response found for: https://api.example.com/data
```

**Solutions**:

- Switch to `record` or `hybrid` mode
- Check URL patterns in include/exclude filters
- Verify fixture file paths and permissions

#### Transformation Errors

```
Error: Transformer failed for pattern: yts\..*\/api\/v2\/
```

**Solutions**:

- Verify transformer function implementation
- Check URL pattern regex syntax
- Test transformer with sample data

#### Cache Staleness

**Solutions**:

- Delete outdated fixture files
- Use `hybrid` mode to automatically update fixtures
- Implement fixture expiration if needed

### Debugging

#### Enable Detailed Logging

```typescript
// Add to test setup
console.log('[HTTP VCR] Recording response for:', url);
console.log('[HTTP VCR] Using cached response from:', filepath);
```

#### Inspect Fixtures

```bash
# Check fixture content
cat backend/test-fixtures/tmdb/movie/123.json

# Verify file structure
find backend/test-fixtures -name "*.json" | head -10
```

#### Test Transformers

```typescript
// Test transformer in isolation
import { transformYtsData } from './yts.transformer';

const testResponse = {
  body: {
    /* sample API response */
  },
  bodyIsJson: true,
};

const transformed = transformYtsData(testResponse);
console.log('Transformed data:', transformed);
```

## Related Components

- **[API Testing](../backend/src/trackers/yts/yts.api.test.ts)**: Example VCR usage in YTS API tests
- **[Test Data Factory](../backend/src/__test-utils__/test-data.factory.ts)**: Utilities for generating test data
- **[Database Helpers](../backend/src/__test-utils__/database.helpers.ts)**: Database testing utilities

## Extensions and Customization

### Adding New Providers

1. Add provider mapping in configuration:

```typescript
providerMap: [{ pattern: 'api.newprovider.com', name: 'newprovider' }];
```

2. Create transformer if needed:

```typescript
transformers: [
  {
    urlPattern: 'api\\.newprovider\\.com',
    transform: transformNewProviderData,
  },
];
```

### Custom URL Processing

Extend [`url.ts`](../backend/src/__test-utils__/http-vcr-utils/url.ts) utilities:

```typescript
export function customUrlProcessor(url: string): string {
  // Custom URL normalization logic
  return processedUrl;
}
```

### Advanced Filtering

Implement custom request filtering:

```typescript
function shouldRecordRequest(url: string, options?: RequestInit): boolean {
  // Custom logic for determining whether to record request
  return true;
}
```
