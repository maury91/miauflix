/**
 * Test utilities for backend E2E tests
 */
import { Client, hcWithType } from '@miauflix/backend-schema';

export interface TestResponse<T = any> {
  status: number;
  data: T;
  headers: Record<string, string>;
}

type ExtractResponseType<T> = T extends (
  ...args: any[]
) => Promise<{ json: () => Promise<infer R> }>
  ? R
  : T;

export type AuthTokens = ExtractResponseType<Client['auth']['login']['$post']>;
export type LoginCredentials = Parameters<Client['auth']['login']['$post']>[0]['json'];

/**
 * HTTP client configured for E2E testing
 */
export class TestClient {
  public client: Client;
  private authToken: string | null = null;

  constructor(baseURL: string = global.BACKEND_URL) {
    this.client = hcWithType(baseURL);
  }

  /**
   * Set authorization header for authenticated requests
   */
  setAuthToken(token: string): void {
    this.authToken = `Bearer ${token}`;
  }

  /**
   * Clear authorization header
   */
  clearAuth(): void {
    this.authToken = null;
  }

  /**
   * Login and set auth token
   */
  async login(credentials: LoginCredentials): Promise<TestResponse<AuthTokens>> {
    const response = await this.client.auth.login.$post({
      json: credentials,
    });

    const data = await this.parseResponse(response);

    if (response.status === 200) {
      this.setAuthToken(data.accessToken);
      return this.formatResponse(response.status, data, response.headers);
    }

    // For non-200 responses, still return the response (don't throw)
    // This allows tests to check the error response
    return this.formatResponse(response.status, data, response.headers);
  }

  /**
   * Logout and clear auth token
   */
  async logout(
    refreshToken: string
  ): Promise<TestResponse<ExtractResponseType<Client['auth']['logout']['$post']>>> {
    const response = await this.client.auth.logout.$post({
      json: {
        refreshToken,
      },
    });
    this.clearAuth();
    return this.formatResponse(
      response.status,
      await this.parseResponse(response),
      response.headers
    );
  }

  private formatResponse<T>(status: number, response: T, rawHeaders: Headers): TestResponse<T> {
    // Convert headers to a plain object to avoid circular references
    const headers: Record<string, string> = {};
    rawHeaders.forEach((value, key) => {
      headers[key] = value;
    });

    return {
      status,
      data: response,
      headers,
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

    // Prepare headers for authentication
    const requestOptions = options || {};
    if (this.authToken) {
      if (!requestOptions.headers) requestOptions.headers = {};
      requestOptions.headers['Authorization'] = this.authToken;
    }

    const response = await currentClient.$post(args, requestOptions);

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

    if (!currentClient || typeof currentClient.$get !== 'function') {
      throw new Error(`Endpoint ${endpoint.join('.')} does not have a $get method`);
    }

    // Prepare headers for authentication
    const requestOptions = options || {};
    if (this.authToken) {
      if (!requestOptions.headers) requestOptions.headers = {};
      requestOptions.headers['Authorization'] = this.authToken;
    }

    const response = await currentClient.$get(args, requestOptions);

    return this.formatResponse(
      response.status,
      await this.parseResponse(response),
      response.headers
    );
  }
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
        const response = await client.get(['health']);
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
      return {
        email: credentials.adminEmail,
        password: credentials.adminPassword,
      };
    }

    console.log('⚠️ Invalid credentials format in file:', credentialsPath);
    return null;
  } catch (error) {
    console.log('⚠️ Error reading admin credentials:', error);
    return null;
  }
}
