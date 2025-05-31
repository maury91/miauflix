import axios, { AxiosInstance, AxiosResponse } from 'axios';

/**
 * Test utilities for backend E2E tests
 */

export interface TestResponse<T = any> {
  status: number;
  data: T;
  headers: Record<string, string>;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

/**
 * HTTP client configured for E2E testing
 */
export class TestClient {
  private axios: AxiosInstance;

  constructor(baseURL: string = global.BACKEND_URL) {
    this.axios = axios.create({
      baseURL,
      timeout: 10000,
      validateStatus: () => true, // Don't throw on HTTP errors
    });
  }

  /**
   * Set authorization header for authenticated requests
   */
  setAuthToken(token: string): void {
    this.axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }

  /**
   * Clear authorization header
   */
  clearAuth(): void {
    delete this.axios.defaults.headers.common['Authorization'];
  }

  /**
   * Make a GET request
   */
  async get<T = any>(url: string, params?: Record<string, any>): Promise<TestResponse<T>> {
    const response = await this.axios.get(url, { params });
    return this.formatResponse(response);
  }

  /**
   * Make a POST request
   */
  async post<T = any>(url: string, data?: any): Promise<TestResponse<T>> {
    const response = await this.axios.post(url, data);
    return this.formatResponse(response);
  }

  /**
   * Make a PUT request
   */
  async put<T = any>(url: string, data?: any): Promise<TestResponse<T>> {
    const response = await this.axios.put(url, data);
    return this.formatResponse(response);
  }

  /**
   * Make a DELETE request
   */
  async delete<T = any>(url: string): Promise<TestResponse<T>> {
    const response = await this.axios.delete(url);
    return this.formatResponse(response);
  }

  /**
   * Login and set auth token
   */
  async login(credentials: LoginCredentials): Promise<AuthTokens> {
    const response = await this.post<AuthTokens>('/auth/login', credentials);

    if (response.status === 200) {
      this.setAuthToken(response.data.accessToken);
      return response.data;
    }

    throw new Error(
      `Login failed with status ${response.status}: ${JSON.stringify(response.data)}`
    );
  }

  /**
   * Logout and clear auth token
   */
  async logout(refreshToken: string): Promise<void> {
    await this.post('/auth/logout', { refreshToken });
    this.clearAuth();
  }

  private formatResponse<T>(response: AxiosResponse<T>): TestResponse<T> {
    // Convert headers to a plain object to avoid circular references
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(response.headers)) {
      headers[key] = String(value);
    }

    return {
      status: response.status,
      data: response.data,
      headers,
    };
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
export async function waitForService(
  client: TestClient,
  endpoint: string = '/health',
  timeout: number = 30000
): Promise<void> {
  await waitFor(
    async () => {
      try {
        const response = await client.get(endpoint);
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
