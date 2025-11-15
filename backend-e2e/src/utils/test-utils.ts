/**
 * Test utilities for backend E2E tests
 */
import { Client, hcWithType } from '@miauflix/backend';

export interface TestResponse<T = any> {
  status: number;
  data: T;
  headers: Record<string, string>;
  requestId?: string; // Add request ID for tracing
}

type ExtractResponseType<T> = T extends (
  ...args: any[]
) => Promise<{ json: () => Promise<infer R> }>
  ? R
  : T;

export type AuthTokens = ExtractResponseType<Client['api']['auth']['login']['$post']>;
export type LoginCredentials = Parameters<Client['api']['auth']['login']['$post']>[0]['json'];

const removeTrailingSlash = (url: string) => {
  return url.endsWith('/') ? url.slice(0, -1) : url;
};

/**
 * HTTP client configured for E2E testing with session-based authentication support
 */
export class TestClient {
  public client: Client;
  private currentSession: string | null = null;
  private cookieJar: Map<string, string> = new Map();

  constructor(baseURL: string = global.BACKEND_URL) {
    // Remove trailing slash from baseURL for Origin header
    const cleanURL = removeTrailingSlash(baseURL);

    this.client = hcWithType(baseURL, {
      init: {
        credentials: 'include', // Enable cookie handling
        headers: {
          Origin: cleanURL,
          Referer: cleanURL,
        },
      },
    });
  }

  /**
   * Set current session ID (used for X-Session-Id header)
   */
  setSession(sessionId: string): void {
    this.currentSession = sessionId;
  }

  /**
   * Clear session data and cookies
   */
  clearAuth(): void {
    this.cookieJar.clear();
    this.currentSession = null;
  }

  /**
   * Get current session ID
   */
  getCurrentSession(): string | null {
    return this.currentSession;
  }

  /**
   * Set current session ID
   */
  setCurrentSession(sessionId: string): void {
    this.currentSession = sessionId;
  }

  /**
   * Get stored cookies for debugging
   */
  getCookies(): Map<string, string> {
    return new Map(this.cookieJar);
  }

  /**
   * Clear all stored cookies
   */
  clearCookies(): void {
    this.cookieJar.clear();
  }

  /**
   * Set a cookie value
   */
  setCookie(name: string, value: string): void {
    this.cookieJar.set(name, value);
  }

  /**
   * Parse and store cookies from response headers
   */
  private storeCookies(headers: Headers): void {
    const cookieStrings = this.extractSetCookieHeaders(headers);
    for (const cookie of cookieStrings) {
      const [nameValue] = cookie.split(';');
      const equalsIndex = nameValue.indexOf('=');
      if (equalsIndex === -1) {
        continue;
      }
      const name = nameValue.substring(0, equalsIndex).trim();
      const value = nameValue.substring(equalsIndex + 1).trim();
      if (name && value) {
        this.cookieJar.set(name, value);
      }
    }
  }

  /**
   * Extract raw Set-Cookie header values, handling multi-header behavior in undici/Node
   */
  private extractSetCookieHeaders(headers: Headers & { getSetCookie?: () => string[] }): string[] {
    if (typeof headers.getSetCookie === 'function') {
      return headers.getSetCookie.call(headers);
    }

    const combinedHeader = headers.get('set-cookie');
    if (!combinedHeader) {
      return [];
    }

    return splitCombinedSetCookieHeader(combinedHeader);
  }

  /**
   * Get cookie header string for requests
   */
  private getCookieHeader(): string {
    const cookies: string[] = [];
    this.cookieJar.forEach((value, name) => {
      cookies.push(`${name}=${value}`);
    });
    return cookies.join('; ');
  }

  /**
   * Login with session-based authentication
   */
  async login(
    credentials: LoginCredentials,
    throwOnError: boolean = true
  ): Promise<TestResponse<AuthTokens>> {
    // Use native fetch instead of Hono client due to JSON payload issue
    const baseURL = removeTrailingSlash(global.BACKEND_URL);
    const response = await fetch(`${baseURL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: baseURL,
        Referer: baseURL,
      },
      credentials: 'include',
      body: JSON.stringify(credentials),
    });

    const data = await this.parseResponse(response);

    if (response.status >= 200 && response.status < 300) {
      // Store session ID (access token is in HttpOnly cookie)
      if (data.session) {
        this.setCurrentSession(data.session);
      }

      // Parse and store cookies (access and refresh tokens are in HttpOnly cookies)
      this.storeCookies(response.headers);

      return this.formatResponse(response.status, data, response.headers);
    }

    // For non-2xx responses, throw by default or return based on flag
    const errorResponse = this.formatResponse(response.status, data, response.headers);
    if (throwOnError) {
      throw new Error(`Login failed with status ${response.status}: ${JSON.stringify(data)}`);
    }

    return errorResponse;
  }

  /**
   * Logout using session-based authentication
   */
  async logout(
    sessionId?: string
  ): Promise<
    TestResponse<ExtractResponseType<Client['api']['auth']['logout'][':session']['$post']>>
  > {
    const session = sessionId ?? this.currentSession;
    if (!session && sessionId === undefined) {
      throw new Error('No session ID available for logout. Login first or provide session ID.');
    }

    // Use session or empty string for testing malformed session IDs
    const sessionParam = session || '';

    // Create a client with cookies in init headers (Hono client header merging issue workaround)
    const cookieHeader = this.getCookieHeader();
    const clientWithCookies = hcWithType(global.BACKEND_URL, {
      init: {
        credentials: 'include',
        headers: {
          Origin: removeTrailingSlash(global.BACKEND_URL),
          Referer: removeTrailingSlash(global.BACKEND_URL),
          Cookie: cookieHeader,
        },
      },
    });

    const response = await clientWithCookies.api.auth.logout[':session'].$post({
      param: { session: sessionParam },
    });

    // Only clear auth if we're logging out the current session
    if (sessionParam === this.currentSession) {
      this.clearAuth();
    }
    return this.formatResponse(
      response.status,
      await this.parseResponse(response),
      response.headers
    );
  }

  /**
   * Refresh tokens using session-based authentication
   */
  async refreshToken(
    sessionId?: string
  ): Promise<
    TestResponse<ExtractResponseType<Client['api']['auth']['refresh'][':session']['$post']>>
  > {
    const session = sessionId ?? this.currentSession;
    if (!session && sessionId === undefined) {
      throw new Error('No session ID available for refresh. Login first or provide session ID.');
    }

    // Use session or empty string for testing malformed session IDs
    const sessionParam = session || '';

    // Prepare headers with cookies
    const headers: Record<string, string> = {};
    const cookieHeader = this.getCookieHeader();
    if (cookieHeader) {
      headers['Cookie'] = cookieHeader;
    }

    // Create a client with cookies in init headers (Hono client header merging issue workaround)
    const clientWithCookies = hcWithType(global.BACKEND_URL, {
      init: {
        credentials: 'include',
        headers: {
          Origin: removeTrailingSlash(global.BACKEND_URL),
          Referer: removeTrailingSlash(global.BACKEND_URL),
          Cookie: cookieHeader,
        },
      },
    });

    const response = await clientWithCookies.api.auth.refresh[':session'].$post({
      param: { session: sessionParam },
    });

    const data = await this.parseResponse(response);

    if (response.status === 200) {
      // Parse and store any new cookies (new access and refresh tokens)
      this.storeCookies(response.headers);
    }

    return this.formatResponse(response.status, data, response.headers);
  }

  private formatResponse<T>(status: number, response: T, rawHeaders: Headers): TestResponse<T> {
    // Convert headers to a plain object to avoid circular references
    const headers: Record<string, string> = {};
    rawHeaders.forEach((value, key) => {
      headers[key] = value;
    });

    // Extract request ID from headers for tracing
    const requestId = headers['x-trace-id'] || headers['x-request-id'] || undefined;

    return {
      status,
      data: response,
      headers,
      requestId,
    };
  }

  /**
   * Parse response handling both JSON and non-JSON responses
   */
  private async parseResponse(response: Response): Promise<any> {
    const contentType = response.headers.get('content-type');

    try {
      // Check if response is JSON
      if (contentType && contentType.includes('application/json')) {
        return await response.json();
      }

      // For non-JSON responses, try to parse as JSON first
      // If that fails, return as text
      const text = await response.text();
      try {
        return JSON.parse(text);
      } catch {
        // If JSON parsing fails, return the text as-is
        return { message: text };
      }
    } catch (error) {
      // If all parsing fails, return error info
      return { error: 'Failed to parse response', details: error };
    }
  }
  /**
   * Type-safe generic POST method with method overloads for different endpoint depths
   */

  // 1-level endpoint
  public async post<K1 extends keyof Client>(
    endpoint: [K1],
    args: Client[K1] extends { $post: (args: infer P) => any } ? NoInfer<P> : never,
    options?: Client[K1] extends { $post: (args: any, options: infer P) => any }
      ? NoInfer<P>
      : never
  ): Promise<
    TestResponse<
      Client[K1] extends { $post: (args: any) => Promise<{ json(): Promise<infer R> }> } ? R : never
    >
  >;

  // 2-level endpoint
  public async post<K1 extends keyof Client, K2 extends keyof Client[K1]>(
    endpoint: [K1, K2],
    args: Client[K1][K2] extends { $post: (args: infer P) => any } ? NoInfer<P> : never,
    options?: Client[K1][K2] extends { $post: (args: any, options: infer P) => any }
      ? NoInfer<P>
      : never
  ): Promise<
    TestResponse<
      Client[K1][K2] extends { $post: (args: any) => Promise<{ json(): Promise<infer R> }> }
        ? R
        : never
    >
  >;

  // 3-level endpoint
  public async post<
    K1 extends keyof Client,
    K2 extends keyof Client[K1],
    K3 extends keyof Client[K1][K2],
  >(
    endpoint: [K1, K2, K3],
    args: Client[K1][K2][K3] extends { $post: (args: infer P) => any } ? NoInfer<P> : never,
    options?: Client[K1][K2][K3] extends { $post: (args: any, options: infer P) => any }
      ? NoInfer<P>
      : never
  ): Promise<
    TestResponse<
      Client[K1][K2][K3] extends { $post: (args: any) => Promise<{ json(): Promise<infer R> }> }
        ? R
        : never
    >
  >;

  // 4-level endpoint
  public async post<
    K1 extends keyof Client,
    K2 extends keyof Client[K1],
    K3 extends keyof Client[K1][K2],
    K4 extends keyof Client[K1][K2][K3],
  >(
    endpoint: [K1, K2, K3, K4],
    args: Client[K1][K2][K3][K4] extends { $post: (args: infer P) => any } ? NoInfer<P> : never,
    options?: Client[K1][K2][K3][K4] extends { $post: (args: any, options: infer P) => any }
      ? NoInfer<P>
      : never
  ): Promise<
    TestResponse<
      Client[K1][K2][K3][K4] extends { $post: (args: any) => Promise<{ json(): Promise<infer R> }> }
        ? R
        : never
    >
  >;

  // Implementation for POST
  public async post(endpoint: string[], args?: any, options?: any): Promise<TestResponse<any>> {
    let currentClient: any = this.client;

    for (const segment of endpoint) {
      if (currentClient && typeof currentClient[segment] !== 'undefined') {
        currentClient = currentClient[segment];
      } else {
        throw new Error(
          `Invalid endpoint path: ${endpoint.join('.')} - segment '${segment}' not found`
        );
      }
    }

    if (!currentClient || typeof currentClient.$post !== 'function') {
      throw new Error(`Endpoint ${endpoint.join('.')} does not have a $post method`);
    }

    // Create a client with headers in init (Hono client header merging issue workaround)
    const headers: Record<string, string> = {
      Origin: removeTrailingSlash(global.BACKEND_URL),
      Referer: removeTrailingSlash(global.BACKEND_URL),
    };

    // Add Content-Type header if JSON body is present
    if (args?.json) {
      headers['Content-Type'] = 'application/json';
    }

    // Add X-Session-Id header if available
    if (this.currentSession) {
      headers['X-Session-Id'] = this.currentSession;
    }

    // Add cookie header if available
    const cookieHeader = this.getCookieHeader();
    if (cookieHeader) {
      headers['Cookie'] = cookieHeader;
    }

    // Merge with any headers passed in options
    if (options?.headers) {
      Object.assign(headers, options.headers);
    }

    const clientWithHeaders = hcWithType(global.BACKEND_URL, {
      init: {
        credentials: 'include',
        headers,
      },
    });

    // Navigate to the correct endpoint on the new client
    let targetClient: any = clientWithHeaders;
    for (const segment of endpoint) {
      if (targetClient && typeof targetClient[segment] !== 'undefined') {
        targetClient = targetClient[segment];
      } else {
        throw new Error(
          `Invalid endpoint path: ${endpoint.join('.')} - segment '${segment}' not found`
        );
      }
    }

    // console.log('targetClient', targetClient.$post.toString());
    // console.log('args', args);
    // console.log('options', options);
    const response = await targetClient.$post(args);

    // Store any cookies from the response
    this.storeCookies(response.headers);

    return this.formatResponse(
      response.status,
      await this.parseResponse(response),
      response.headers
    );
  }

  /**
   * Type-safe generic GET method with method overloads for different endpoint depths
   */

  // 1-level endpoint
  public async get<K1 extends keyof Client>(
    endpoint: [K1],
    args?: Client[K1] extends { $get: (args: infer P) => any } ? NoInfer<P> : never,
    options?: Client[K1] extends { $get: (args: any, options: infer P) => any } ? NoInfer<P> : never
  ): Promise<
    TestResponse<
      Client[K1] extends { $get: (args: any) => Promise<{ json(): Promise<infer R> }> } ? R : never
    >
  >;

  // 2-level endpoint
  public async get<K1 extends keyof Client, K2 extends keyof Client[K1]>(
    endpoint: [K1, K2],
    args?: Client[K1][K2] extends { $get: (args: infer P) => any } ? NoInfer<P> : never,
    options?: Client[K1][K2] extends { $get: (args: any, options: infer P) => any }
      ? NoInfer<P>
      : never
  ): Promise<
    TestResponse<
      Client[K1][K2] extends { $get: (args: any) => Promise<{ json(): Promise<infer R> }> }
        ? R
        : never
    >
  >;

  // 3-level endpoint
  public async get<
    K1 extends keyof Client,
    K2 extends keyof Client[K1],
    K3 extends keyof Client[K1][K2],
  >(
    endpoint: [K1, K2, K3],
    args?: Client[K1][K2][K3] extends { $get: (args: infer P) => any } ? NoInfer<P> : never,
    options?: Client[K1][K2][K3] extends { $get: (args: any, options: infer P) => any }
      ? NoInfer<P>
      : never
  ): Promise<
    TestResponse<
      Client[K1][K2][K3] extends { $get: (args: any) => Promise<{ json(): Promise<infer R> }> }
        ? R
        : never
    >
  >;

  // Implementation for GET
  public async get(endpoint: string[], args?: any, options?: any): Promise<TestResponse<any>> {
    // Use native fetch instead of Hono client for consistency
    const baseURL = removeTrailingSlash(global.BACKEND_URL);

    // Build URL from endpoint array
    let url = `${baseURL}/${endpoint.join('/')}`;

    // Handle path parameters (like :id)
    if (args?.param) {
      for (const [key, value] of Object.entries(args.param)) {
        url = url.replace(`:${key}`, String(value));
      }
    }

    // Add query parameters
    if (args?.query) {
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(args.query)) {
        if (value !== undefined && value !== null) {
          searchParams.append(key, String(value));
        }
      }
      if (searchParams.toString()) {
        url += `?${searchParams.toString()}`;
      }
    }

    // Prepare headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Origin: baseURL,
      Referer: baseURL,
      ...(options?.headers || {}),
    };

    // Add X-Session-Id header if available
    if (this.currentSession) {
      headers['X-Session-Id'] = this.currentSession;
    }

    // Add cookie header if available
    const cookieHeader = this.getCookieHeader();
    if (cookieHeader) {
      headers['Cookie'] = cookieHeader;
    }

    const response = await fetch(url, {
      method: 'GET',
      headers,
      credentials: 'include',
    });

    // Store any cookies from the response
    this.storeCookies(response.headers);

    return this.formatResponse(
      response.status,
      await this.parseResponse(response),
      response.headers
    );
  }
}

/**
 * Splits a combined Set-Cookie header string into individual cookie strings.
 * Adapted to handle commas inside Expires attributes without adding extra dependencies.
 */
function splitCombinedSetCookieHeader(header: string): string[] {
  const cookies: string[] = [];
  let current = '';
  let i = 0;

  while (i < header.length) {
    const char = header[i];
    current += char;

    if (char === ',') {
      // Look ahead to decide if this comma separates cookies or is part of Expires, e.g. "Wed, 15..."
      const remaining = header.slice(i + 1);
      const nextEquals = remaining.indexOf('=');
      const nextSemicolon = remaining.indexOf(';');

      if (nextEquals !== -1 && (nextSemicolon === -1 || nextEquals < nextSemicolon)) {
        // Likely start of a new cookie (" name=value"), so finalize the current chunk
        cookies.push(current.slice(0, -1).trim());
        current = '';
      }
    }

    i += 1;
  }

  if (current.trim()) {
    cookies.push(current.trim());
  }

  return cookies.filter(Boolean);
}

/**
 * Wait for a condition to be true with timeout
 */
export async function waitFor(
  condition: () => Promise<boolean> | boolean,
  timeout: number = 10000,
  interval: number = 100
): Promise<void> {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }

  throw new Error(`Condition not met within ${timeout}ms`);
}

/**
 * Wait for service to be healthy
 */
export async function waitForService(client: TestClient, timeout: number = 30000): Promise<void> {
  await waitFor(
    async () => {
      try {
        const response = await client.get(['api', 'health']);
        return response.status === 200;
      } catch {
        return false;
      }
    },
    timeout,
    1000
  );
}

/**
 * Generate random test data
 */
export const testUtils = {
  randomEmail: () => `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}@example.com`,
  randomString: (length: number = 10) => Math.random().toString(36).substr(2, length),
  randomPassword: () => testUtils.randomString(12) + 'A1!',
};

/**
 * Common test data
 */
export const testData = {
  validUser: {
    email: 'test@example.com',
    password: 'TestPassword123!',
  },
  adminUser: {
    email: 'admin@example.com',
    password: 'AdminPassword123!',
  },
};

/**
 * Extract user credentials from credentials file created by env.sh script
 */
export async function extractUserCredentialsFromLogs(): Promise<{
  email: string;
  password: string;
} | null> {
  try {
    const fs = require('fs');
    const path = require('path');

    const credentialsPath = path.join(__dirname, '../..', 'admin-credentials.json');

    // Check if credentials file exists
    if (!fs.existsSync(credentialsPath)) {
      console.log('⚠️ Admin credentials file not found at:', credentialsPath);
      console.log('   Make sure the env.sh script has been run and credentials were extracted');
      return null;
    }

    // Read and parse credentials file
    const credentialsContent = fs.readFileSync(credentialsPath, 'utf8');
    const credentials = JSON.parse(credentialsContent);

    if (credentials.adminEmail && credentials.adminPassword) {
      const result = {
        email: credentials.adminEmail,
        password: credentials.adminPassword,
      };
      return result;
    }

    console.log('⚠️ Invalid credentials format in file:', credentialsPath);
    return null;
  } catch (error) {
    console.log('⚠️ Error reading admin credentials:', error);
    return null;
  }
}
