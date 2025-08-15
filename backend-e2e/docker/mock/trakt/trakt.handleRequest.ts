/**
 * Trakt-specific request handler for OAuth POST endpoints
 * This file gets injected via Dockerfile to handle non-GET requests
 */

import type { HandleRequestParams, HandleRequestResponse } from '../types';

// Mock OAuth responses for Trakt API
function generateMockOAuthResponses(path: string, method: string, body?: any): any {
  console.log(`🎭 Generating mock response for ${method} ${path}`);

  switch (path) {
    case '/oauth/device/code':
      if (method === 'POST') {
        return {
          device_code: 'mock_device_code_' + Date.now(),
          user_code: 'MOCK1234',
          verification_url: 'https://trakt.tv/activate',
          expires_in: 600,
          interval: 5,
        };
      }
      break;

    case '/oauth/device/token':
      if (method === 'POST') {
        // Simulate different states based on request timing
        const mockStates = ['authorization_pending', 'slow_down', 'access_denied'];
        const randomState = mockStates[Math.floor(Math.random() * mockStates.length)];

        if (Math.random() > 0.7) {
          // 30% chance of success
          return {
            access_token: 'mock_access_token_' + Date.now(),
            token_type: 'bearer',
            expires_in: 7200,
            refresh_token: 'mock_refresh_token_' + Date.now(),
            scope: 'public',
            created_at: Math.floor(Date.now() / 1000),
          };
        } else {
          throw new Error(randomState);
        }
      }
      break;

    case '/oauth/token':
      if (method === 'POST') {
        return {
          access_token: 'mock_refreshed_access_token_' + Date.now(),
          token_type: 'bearer',
          expires_in: 7200,
          refresh_token: 'mock_new_refresh_token_' + Date.now(),
          scope: 'public',
          created_at: Math.floor(Date.now() / 1000),
        };
      }
      break;
  }

  return null;
}

/**
 * Trakt-specific request handler for OAuth POST endpoints
 * Returns null if the request should be handled by the default logic
 * Returns HandleRequestResponse if the request was handled
 */
export const handleRequest = async ({
  req,
  path,
  method,
  API_KEY,
  API_SECRET,
  API_BASE_URL = 'https://api.trakt.tv',
  API_HEADERS,
}: HandleRequestParams): Promise<HandleRequestResponse | null> => {
  // Only handle POST requests for OAuth endpoints
  if (method !== 'POST' || !path.startsWith('/oauth/')) {
    return null; // Let default handler process it
  }

  console.log(`🎭 Trakt handler processing ${method} ${path}`);

  try {
    // Try to fetch from real API if credentials are available
    if (API_KEY && API_SECRET) {
      console.log(`🌐 Calling real Trakt API for POST ${path}`);

      const requestBody = await req.json();
      const apiUrl = new URL(path, API_BASE_URL);

      const apiResponse = await fetch(apiUrl.toString(), {
        method: 'POST',
        headers: {
          'trakt-api-version': '2',
          'trakt-api-key': API_KEY,
          'Content-Type': 'application/json',
          ...API_HEADERS,
        },
        body: JSON.stringify(requestBody),
      });

      if (!apiResponse.ok) {
        const errorText = await apiResponse.text();
        console.log(`API error for ${path}: ${apiResponse.status} ${errorText}`);

        // For OAuth endpoints, return appropriate error response
        return {
          data: { error: errorText },
          store: false, // Don't store error responses
          response: new Response(JSON.stringify({ error: errorText }), {
            status: apiResponse.status,
            headers: { 'Content-Type': 'application/json' },
          }),
        };
      }

      const data = await apiResponse.json();

      // Note: We don't sanitize OAuth responses as they contain sensitive tokens
      return {
        data: data,
        store: true, // Store successful OAuth responses
        response: new Response(JSON.stringify(data), {
          headers: { 'Content-Type': 'application/json' },
          status: apiResponse.status,
        }),
      };
    } else {
      // Generate mock response if no API credentials
      console.log(`🎭 No API credentials, generating mock response for POST ${path}`);
      const mockResponse = generateMockOAuthResponses(path, method);

      if (mockResponse) {
        return {
          data: mockResponse,
          store: true, // Store mock responses for consistency
          response: new Response(JSON.stringify(mockResponse), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
          }),
        };
      }
    }

    // If we get here, we couldn't handle the request
    return {
      data: { error: 'OAuth endpoint not implemented', path: path, method: method },
      store: false,
      response: new Response(
        JSON.stringify({
          error: 'OAuth endpoint not implemented',
          path: path,
          method: method,
        }),
        {
          status: 501,
          headers: { 'Content-Type': 'application/json' },
        }
      ),
    };
  } catch (error) {
    console.error('Error handling Trakt OAuth request:', error);
    return {
      data: {
        error: 'Failed to process OAuth request',
        details: error instanceof Error ? error.message : String(error),
      },
      store: false,
      response: new Response(
        JSON.stringify({
          error: 'Failed to process OAuth request',
          details: error instanceof Error ? error.message : String(error),
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      ),
    };
  }
};

// Default export for backward compatibility
export default handleRequest;
