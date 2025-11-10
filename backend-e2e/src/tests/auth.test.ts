import { TestClient, waitForService, extractUserCredentialsFromLogs } from '../utils/test-utils';

describe('Authentication Endpoints', () => {
  let client: TestClient;
  let userCredentials: { email: string; password: string } | null = null;

  beforeAll(async () => {
    client = new TestClient();

    try {
      await waitForService(client);

      // Try to extract user credentials from Docker logs
      userCredentials = await extractUserCredentialsFromLogs();
    } catch (error) {
      console.log('❌ Backend service is not available. Ensure the Docker environment is running.');
      throw error;
    }
  }, 60000);

  afterEach(async () => {
    // Clear any auth tokens and sessions after each test
    client.clearAuth();
  });

  describe('Basic Authentication Flow', () => {
    it('should reject login with invalid credentials', async () => {
      const response = await client.login(
        {
          email: 'nonexistent@example.com',
          password: 'wrongpassword',
        },
        false
      ); // Don't throw on error

      expect(response).toBeHttpStatus(401);
      expect(response.data).toHaveProperty('error');
    });

    it('should require authentication for protected endpoints', async () => {
      // Try to access a protected endpoint without authentication
      const response = await client.get(['api', 'lists']);

      expect(response).toBeHttpStatus(401);
    });

    it('should login with valid credentials and return session', async () => {
      if (!userCredentials) {
        throw new Error(
          'No user credentials available for testing - ensure backend is running and generating admin user'
        );
      }

      const response = await client.login(userCredentials);

      expect(response).toBeHttpStatus(200);
      expect(response.data).toHaveProperty('session');
      expect(response.data).toHaveProperty('user');

      if ('error' in response.data) {
        throw new Error(response.data.error);
      }

      // Verify session ID is stored in client
      expect(client.getCurrentSession()).toBe(response.data.session);

      // Verify cookies are set (access and refresh tokens are in HttpOnly cookies)
      const cookies = client.getCookies();
      expect(cookies.size).toBeGreaterThan(0);

      // Should NOT have accessToken or refreshToken in response body (they're in HttpOnly cookies)
      expect(response.data).not.toHaveProperty('accessToken');
      expect(response.data).not.toHaveProperty('refreshToken');
    });

    it('should access protected endpoints when authenticated', async () => {
      if (!userCredentials) {
        throw new Error(
          'No user credentials available for testing - ensure backend is running and generating admin user'
        );
      }

      // Login first
      await client.login(userCredentials);

      // Now try to access a protected endpoint
      const response = await client.get(['api', 'lists']);

      expect(response).toBeHttpStatus(200);
      expect(response.data).toBeDefined();
    });
  });

  describe('Session-Based Refresh Token Flow', () => {
    it('should refresh access token using session and cookies', async () => {
      if (!userCredentials) {
        throw new Error(
          'No user credentials available for testing - ensure backend is running and generating admin user'
        );
      }

      // Login first to get session and cookies
      const loginResponse = await client.login(userCredentials);

      if ('error' in loginResponse.data) {
        throw new Error(loginResponse.data.error);
      }

      const sessionId = loginResponse.data.session;

      // Use session-based refresh (should use cookies for refresh token)
      const refreshResponse = await client.refreshToken(sessionId);

      expect(refreshResponse).toBeHttpStatus(200);
      expect(refreshResponse.data).toHaveProperty('user');

      // Should NOT have accessToken or refreshToken in response body (they're in HttpOnly cookies)
      expect(refreshResponse.data).not.toHaveProperty('accessToken');
      expect(refreshResponse.data).not.toHaveProperty('refreshToken');
    });

    it('should fail refresh with invalid session', async () => {
      const invalidSessionId = 'invalid-session-id';

      // Try to refresh with invalid session
      const refreshResponse = await client.refreshToken(invalidSessionId);

      expect(refreshResponse).toBeHttpStatus(401);
    });

    it('should fail refresh without session ID', async () => {
      // Try to refresh without session ID and without being logged in
      await expect(client.refreshToken()).rejects.toThrow('No session ID available for refresh');
    });
  });

  describe('Session-Based Logout Flow', () => {
    it('should logout successfully using session', async () => {
      if (!userCredentials) {
        throw new Error(
          'No user credentials available for testing - ensure backend is running and generating admin user'
        );
      }

      // Login first
      const loginResponse = await client.login(userCredentials);

      if ('error' in loginResponse.data) {
        throw new Error(loginResponse.data.error);
      }

      const sessionId = loginResponse.data.session;

      // Logout using session
      const logoutResponse = await client.logout(sessionId);

      expect(logoutResponse).toBeHttpStatus(200);
      expect(logoutResponse.data).toHaveProperty('message');

      // Verify client state is cleared
      expect(client.getCurrentSession()).toBeNull();
      expect(client.getCookies().size).toBe(0);
    });

    it('should logout using current session automatically', async () => {
      if (!userCredentials) {
        throw new Error(
          'No user credentials available for testing - ensure backend is running and generating admin user'
        );
      }

      // Login first
      await client.login(userCredentials);

      // Logout without specifying session (should use current session)
      const logoutResponse = await client.logout();

      expect(logoutResponse).toBeHttpStatus(200);
      expect(logoutResponse.data).toHaveProperty('message');
    });

    it('should fail logout without session ID', async () => {
      // Try to logout without session ID and without being logged in
      await expect(client.logout()).rejects.toThrow('No session ID available for logout');
    });

    it('should handle logout with invalid session gracefully', async () => {
      const invalidSessionId = 'invalid-session-id';

      // Try to logout with invalid session (should still clear local state)
      const logoutResponse = await client.logout(invalidSessionId);

      // Backend should handle gracefully, local state should be cleared
      expect(client.getCurrentSession()).toBeNull();
      expect(client.getCookies().size).toBe(0);
    });
  });

  describe('Session Integration Tests', () => {
    it('should maintain session through full workflow', async () => {
      if (!userCredentials) {
        throw new Error(
          'No user credentials available for testing - ensure backend is running and generating admin user'
        );
      }

      // 1. Login
      const loginResponse = await client.login(userCredentials);

      if ('error' in loginResponse.data) {
        throw new Error(loginResponse.data.error);
      }

      const sessionId = loginResponse.data.session;

      // 2. Access protected endpoint
      const listsResponse = await client.get(['api', 'lists']);
      expect(listsResponse).toBeHttpStatus(200);

      // 3. Refresh token
      const refreshResponse = await client.refreshToken(sessionId);
      expect(refreshResponse).toBeHttpStatus(200);

      // 4. Access protected endpoint with new token
      const listsResponse2 = await client.get(['api', 'lists']);
      expect(listsResponse2).toBeHttpStatus(200);

      // 5. Logout
      const logoutResponse = await client.logout(sessionId);
      expect(logoutResponse).toBeHttpStatus(200);

      // 6. Verify cannot access protected endpoint after logout
      const listsResponse3 = await client.get(['api', 'lists']);
      expect(listsResponse3).toBeHttpStatus(401);
    });

    it('should handle concurrent API calls with session cookies', async () => {
      if (!userCredentials) {
        throw new Error(
          'No user credentials available for testing - ensure backend is running and generating admin user'
        );
      }

      // Login first
      await client.login(userCredentials);

      // Make multiple concurrent API calls (should all use same session cookies)
      const promises = [
        client.get(['api', 'lists']),
        client.get(['api', 'lists']),
        client.get(['api', 'lists']),
      ];

      const responses = await Promise.all(promises);

      // All requests should succeed
      responses.forEach(response => {
        expect(response).toBeHttpStatus(200);
      });
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limiting on login attempts', async () => {
      // Test rate limiting by making multiple rapid login attempts
      const invalidCredentials = {
        email: 'test@example.com',
        password: 'wrongpassword',
      };

      // Make multiple rapid login attempts to trigger rate limiting
      // Use X-Force-RateLimit=true to enable rate limiting for this specific test
      const promises = [];
      for (let i = 0; i < 6; i++) {
        promises.push(
          client.post(
            ['api', 'auth', 'login'],
            {
              json: invalidCredentials,
            },
            {
              headers: { 'X-Force-RateLimit': 'true' },
            }
          )
        );
      }

      const responses = await Promise.all(promises);

      // At least one response should be rate limited (429)
      const rateLimitedResponses = responses.filter(r => r.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });

    it('should enforce rate limiting on refresh attempts', async () => {
      if (!userCredentials) {
        throw new Error(
          'No user credentials available for testing - ensure backend is running and generating admin user'
        );
      }

      // Login first
      const loginResponse = await client.login(userCredentials);

      if ('error' in loginResponse.data) {
        throw new Error(loginResponse.data.error);
      }

      const sessionId = loginResponse.data.session;

      // Make multiple rapid refresh attempts to trigger rate limiting
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(
          client.post(
            ['api', 'auth', 'refresh', ':session'],
            {
              param: { session: sessionId },
            },
            {
              headers: {
                'X-Force-RateLimit': 'true',
              },
            }
          )
        );
      }

      const responses = await Promise.all(promises);

      // At least one response should be rate limited (429)
      const rateLimitedResponses = responses.filter(r => r.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });
  });
});
