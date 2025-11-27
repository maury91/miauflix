import { UserRole } from '@miauflix/backend';

import { TestClient, testUtils } from './test-utils';

export type UserCredentials = { email: string; password: string };

/**
 * User pool manager for test isolation
 * Provides a pool of test users that can be acquired and released to ensure
 * each test runs with its own isolated user account.
 */
export class UserPool {
  private pool: UserCredentials[] = [];
  private inUse = new Set<number>();
  private adminCredentials: UserCredentials | null = null;

  async initialize(adminCredentials: UserCredentials, poolSize: number = 10): Promise<void> {
    this.adminCredentials = adminCredentials;
    const adminClient = new TestClient();
    await adminClient.login(adminCredentials);

    // Create pool of test users
    for (let i = 0; i < poolSize; i++) {
      const email = `test-user-${i}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}@example.com`;
      const password = testUtils.randomPassword();

      const createResponse = await adminClient.post(['api', 'auth', 'users'], {
        json: {
          email,
          password,
          // Note: UserRole is undefined at runtime, we need to use a string
          role: 'user' as UserRole.USER,
        },
      });

      if (createResponse.status !== 201) {
        const errorData = createResponse.data;
        const errorMsg =
          typeof errorData === 'object' &&
          errorData !== null &&
          'error' in errorData &&
          typeof (errorData as { error?: string }).error === 'string'
            ? (errorData as { error: string }).error
            : typeof errorData === 'object' && errorData !== null
              ? JSON.stringify(errorData)
              : `HTTP ${createResponse.status}`;
        throw new Error(`Failed to create test user ${i + 1}: ${errorMsg}`);
      }

      this.pool.push({ email, password });
    }

    adminClient.clearAuth();
  }

  /**
   * Acquire an unused user from the pool
   * @returns UserCredentials
   * @throws Error if pool is exhausted
   */
  acquire(): UserCredentials {
    // Find first unused user
    for (let i = 0; i < this.pool.length; i++) {
      if (!this.inUse.has(i)) {
        this.inUse.add(i);
        return this.pool[i];
      }
    }
    throw new Error(
      'User pool exhausted - no available test users. Consider increasing pool size.'
    );
  }

  /**
   * Release a user back to the pool
   * @param credentials The user credentials to release
   */
  release(credentials: UserCredentials): void {
    const index = this.pool.findIndex(u => u.email === credentials.email);
    if (index !== -1) {
      this.inUse.delete(index);
    } else {
      console.warn(`Attempted to release unknown user: ${credentials.email}`);
    }
  }

  /**
   * Cleanup all test users created by the pool
   * Should be called in afterAll to clean up test data
   */
  async cleanup(): Promise<void> {
    if (!this.adminCredentials) {
      return;
    }
    const adminClient = new TestClient();
    await adminClient.login(this.adminCredentials);

    for (const user of this.pool) {
      console.warn(`Skipping user deletion: ${user.email}`);
      // TODO: Uncomment this once we have an endpoint to delete users
      //   try {
      //     // Delete user via admin API (adjust endpoint as needed)
      //     await adminClient.delete(['api', 'auth', 'users', user.email]);
      //   } catch {
      //     // Ignore cleanup errors
      //   }
    }

    this.pool = [];
    this.inUse.clear();
    adminClient.clearAuth();
  }

  /**
   * Get admin credentials used to initialize the pool
   * @returns Admin credentials
   * @throws Error if pool not initialized
   */
  getAdminCredentials(): UserCredentials {
    if (!this.adminCredentials) {
      throw new Error('Admin credentials not initialized');
    }
    return this.adminCredentials;
  }
}
