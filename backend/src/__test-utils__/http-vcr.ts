import { beforeEach, mock } from 'bun:test';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { readFile } from 'fs/promises';
import { dirname, join } from 'path';

interface HttpVcrConfig {
  /** Mode can be "replay" (use cached if available), "record" (always record), or "disabled" (don't use caching) */
  mode: 'disabled' | 'record' | 'replay';
  /** Directory to store fixtures */
  fixturesDir: string;
  /** URL patterns to include in recording/replay (if empty, all URLs are included) */
  includePatterns: string[];
  /** URL patterns to exclude from recording/replay */
  excludePatterns: string[];
  /** Map of URL patterns to provider names for organizing fixtures */
  providerMap: Array<{ pattern: string; name: string }>;
  /** Default provider name if no match is found */
  defaultProvider: string;
}

interface StoredResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
}

const HTTP_VCR_CONFIG: HttpVcrConfig = {
  mode: (process.env.HTTP_VCR_MODE as HttpVcrConfig['mode']) || 'replay',
  fixturesDir: process.env.HTTP_VCR_FIXTURES_DIR || join(__dirname, '../..', 'test-fixtures'),
  includePatterns: ['api.themoviedb.org'],
  excludePatterns: [],
  providerMap: [
    { pattern: 'api.themoviedb.org', name: 'tmdb' },
    { pattern: 'api.trakt.tv', name: 'trakt' },
  ],
  defaultProvider: 'other',
};

function getProviderFromUrl(url: string): string {
  const provider = HTTP_VCR_CONFIG.providerMap.find(p => url.includes(p.pattern));
  return provider ? provider.name : HTTP_VCR_CONFIG.defaultProvider;
}

function urlToFilepath(url: string): string {
  const provider = getProviderFromUrl(url);

  const urlObj = new URL(url);
  const path = urlObj.pathname;
  const query = urlObj.search;
  const filename = `${path}${query}.json`;

  return join(HTTP_VCR_CONFIG.fixturesDir, provider, filename);
}

// Store the original fetch
const originalFetch = global.fetch;

// Replace global fetch with our implementation
const fetchMock = mock(async function (
  url: Request | URL | string,
  init?: RequestInit
): Promise<Response> {
  const urlString = url.toString();

  // Skip if VCR is disabled or URL doesn't match any include patterns
  if (
    HTTP_VCR_CONFIG.mode === 'disabled' ||
    (HTTP_VCR_CONFIG.includePatterns.length > 0 &&
      !HTTP_VCR_CONFIG.includePatterns.some(pattern => urlString.includes(pattern)))
  ) {
    return originalFetch(url, init);
  }

  // Skip if URL matches any exclude pattern
  if (HTTP_VCR_CONFIG.excludePatterns.some(pattern => urlString.includes(pattern))) {
    return originalFetch(url, init);
  }

  const filepath = urlToFilepath(urlString);
  const provider = getProviderFromUrl(urlString);

  // Check if we have a cached response and are in replay mode
  if (HTTP_VCR_CONFIG.mode === 'replay' && existsSync(filepath)) {
    try {
      const cachedData = await readFile(filepath, 'utf8');
      const { status, statusText, headers, body } = JSON.parse(cachedData) as StoredResponse;

      // Create a response object from the cached data
      return new Response(body, {
        status,
        statusText,
        headers,
      });
    } catch (error) {
      console.error(`[HTTP VCR] Error reading cached response: ${(error as Error).message}`);
      // Fall back to a real request if the cache is invalid
    }
  }

  // Make a real request if no cache exists or in record mode
  console.log(`[HTTP VCR] Recording response for: ${urlString} [${provider}]`);
  const response = await originalFetch(url, init);

  try {
    // Clone the response so we can read it twice
    const clonedResponse = response.clone();
    const body = await clonedResponse.text();

    // Prepare the data to cache
    const responseData: StoredResponse = {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      body,
    };

    // Write the response to the cache
    const fileDir = dirname(filepath);
    if (!existsSync(fileDir)) {
      mkdirSync(fileDir, { recursive: true });
    }
    writeFileSync(filepath, JSON.stringify(responseData, null, 2));
    console.log(`[HTTP VCR] Cached response to: ${filepath}`);
  } catch (error) {
    console.error(`[HTTP VCR] Error caching response: ${(error as Error).message}`);
  }

  // Return the original response
  return response;
});

global.fetch = fetchMock as unknown as typeof global.fetch;

beforeEach(() => {
  fetchMock.mockClear();
});
