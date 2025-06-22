import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { readFile } from 'fs/promises';
import { dirname } from 'path';

import type { StoredResponse } from './http-vcr-utils/types';
import { getProviderFromUrl, urlToFilepath } from './http-vcr-utils/url';
import { HTTP_VCR_CONFIG } from './http-vcr.config';

// Store the original fetch
const originalFetch = global.fetch;

// Replace global fetch with our implementation
const fetchMock = jest.fn(async function (
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

  const filepath = urlToFilepath(
    urlString,
    HTTP_VCR_CONFIG.providerMap,
    HTTP_VCR_CONFIG.defaultProvider,
    HTTP_VCR_CONFIG.fixturesDir
  );
  const provider = getProviderFromUrl(
    urlString,
    HTTP_VCR_CONFIG.providerMap,
    HTTP_VCR_CONFIG.defaultProvider
  );
  const canLoadFromCache = ['replay', 'hybrid', 'migrate'].includes(HTTP_VCR_CONFIG.mode);
  const canLoadFromNetwork = ['record', 'hybrid', 'migrate'].includes(HTTP_VCR_CONFIG.mode);

  // Find matching transformer based on URL
  const transformer = HTTP_VCR_CONFIG.transformers.find(t =>
    new RegExp(t.urlPattern).test(urlString)
  );

  // Check if we have a cached response and are in replay mode
  if (canLoadFromCache && existsSync(filepath)) {
    try {
      const cachedData = await readFile(filepath, 'utf8');
      const responseData = JSON.parse(cachedData) as StoredResponse;
      let { status, statusText, headers, body, bodyIsJson, isTransformed } = responseData;
      let needsUpdate = false;

      // Check if this fixture contains any blacklisted headers that should be removed
      const blacklistedHeadersFound = Object.keys(headers).some(key =>
        HTTP_VCR_CONFIG.headersBlacklist.includes(key.toLowerCase())
      );

      if (blacklistedHeadersFound) {
        console.log(`[HTTP VCR] Removing blacklisted headers from fixture: ${filepath}`);
        // Filter out blacklisted headers
        headers = Object.fromEntries(
          Object.entries(headers).filter(
            ([key]) => !HTTP_VCR_CONFIG.headersBlacklist.includes(key.toLowerCase())
          )
        );
        needsUpdate = true;
      }

      // Check if we need to apply transformations to this fixture
      if (HTTP_VCR_CONFIG.autoTransform && !isTransformed && transformer) {
        console.log(`[HTTP VCR] Transforming data in fixture: ${filepath}`);
        const transformedData = transformer.transform({
          status,
          statusText,
          headers,
          body,
          bodyIsJson,
        }) as StoredResponse;

        // Update with transformed data
        body = transformedData.body;
        isTransformed = true;
        needsUpdate = true;
      }

      // Update the fixture file if needed
      if (needsUpdate) {
        const updatedResponseData: StoredResponse = {
          status,
          statusText,
          headers,
          body,
          bodyIsJson,
          isTransformed,
        };

        // Use pretty print spacing if configured
        const indent = HTTP_VCR_CONFIG.prettyPrintJson ? 2 : 0;
        writeFileSync(filepath, JSON.stringify(updatedResponseData, null, indent));
        console.log(`[HTTP VCR] Updated fixture: ${filepath}`);
      }

      // Convert body back to string if it was stored as a parsed JSON object
      let responseBody: string;
      if (bodyIsJson) {
        responseBody = JSON.stringify(body);
      } else {
        responseBody = body as string;
      }

      // Create a response object from the cached data
      return new Response(responseBody, {
        status,
        statusText,
        headers,
      });
    } catch (error) {
      console.error(`[HTTP VCR] Error reading cached response: ${(error as Error).message}`);
      // Fall back to a real request if the cache is invalid
    }
  }

  if (!canLoadFromNetwork) {
    console.warn(`[HTTP VCR] No cached response found for: ${urlString} [${provider}]`);
    throw new Error(`No cached response found for: ${urlString}`);
  }

  // Make a real request if no cache exists or in record mode
  console.log(`[HTTP VCR] Recording response for: ${urlString} [${provider}]`);
  const response = await originalFetch(url, init);

  try {
    // Clone the response so we can read it twice
    const clonedResponse = response.clone();
    const bodyText = await clonedResponse.text();

    // Check if the response is JSON
    const contentType = response.headers.get('content-type') || '';
    const isJsonResponse = contentType.includes('application/json');

    // Try to parse as JSON if it's a JSON response
    let body: unknown = bodyText;
    let bodyIsJson = false;

    if (isJsonResponse && bodyText) {
      try {
        body = JSON.parse(bodyText);
        bodyIsJson = true;
      } catch (e) {
        // If parsing fails, fall back to using the raw text
        console.warn(`[HTTP VCR] Failed to parse JSON response: ${(e as Error).message}`);
      }
    }

    // Get all headers and filter out blacklisted ones
    const allHeaders = Object.fromEntries(response.headers.entries());
    const filteredHeaders = Object.fromEntries(
      Object.entries(allHeaders).filter(
        ([key]) => !HTTP_VCR_CONFIG.headersBlacklist.includes(key.toLowerCase())
      )
    );

    // Create response data object
    let responseData: StoredResponse = {
      status: response.status,
      statusText: response.statusText,
      headers: filteredHeaders,
      body,
      bodyIsJson,
    };

    // Apply transformation if needed
    if (transformer) {
      console.log(`[HTTP VCR] Transforming new response data for: ${urlString}`);
      responseData = transformer.transform(responseData) as StoredResponse;
      responseData.isTransformed = true;
    }

    // Write the response to the cache
    const fileDir = dirname(filepath);
    if (!existsSync(fileDir)) {
      mkdirSync(fileDir, { recursive: true });
    }

    // Use pretty print spacing if configured
    const indent = HTTP_VCR_CONFIG.prettyPrintJson ? 2 : 0;
    writeFileSync(filepath, JSON.stringify(responseData, null, indent));
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
