import { extractUserCredentialsFromLogs, TestClient, waitForService } from '../utils/test-utils';

describe('Cookie Security Validation', () => {
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

  describe('HttpOnly Cookie Attributes', () => {
    it('should set refresh tokens as HttpOnly cookies', async () => {
      if (!userCredentials) {
        throw new Error('No user credentials available for testing');
      }

      const response = await client.login(userCredentials);
      expect(response).toBeHttpStatus(200);

      // Check Set-Cookie headers for HttpOnly attribute
      const setCookieHeader = response.headers['set-cookie'];
      expect(setCookieHeader).toBeDefined();

      if (setCookieHeader) {
        // Should contain HttpOnly directive
        expect(setCookieHeader).toMatch(/HttpOnly/i);

        // Should not contain the actual refresh token in response body
        expect(response.data).not.toHaveProperty('refreshToken');
      }
    });

    it('should use session-scoped cookie naming', async () => {
      if (!userCredentials) {
        throw new Error('No user credentials available for testing');
      }

      const response = await client.login(userCredentials);
      expect(response).toBeHttpStatus(200);

      if ('error' in response.data) {
        throw new Error(response.data.error);
      }

      const sessionId = response.data.session;
      const setCookieHeader = response.headers['set-cookie'];

      if (setCookieHeader) {
        // Cookie name should include session information
        expect(setCookieHeader).toMatch(new RegExp(`__miauflix_rt_${sessionId}`, 'i'));
      }
    });

    it('should set appropriate cookie security attributes', async () => {
      if (!userCredentials) {
        throw new Error('No user credentials available for testing');
      }

      const response = await client.login(userCredentials);
      expect(response).toBeHttpStatus(200);

      const setCookieHeader = response.headers['set-cookie'];
      expect(setCookieHeader).toBeDefined();

      if (setCookieHeader) {
        // Should have HttpOnly for XSS protection
        expect(setCookieHeader).toMatch(/HttpOnly/i);

        // Should have SameSite for CSRF protection
        expect(setCookieHeader).toMatch(/SameSite/i);

        // Should have appropriate Path
        expect(setCookieHeader).toMatch(/Path=/i);
      }
    });
  });

  describe('Session Cookie Isolation', () => {
    it('should create different cookies for different sessions', async () => {
      if (!userCredentials) {
        throw new Error('No user credentials available for testing');
      }

      const client1 = new TestClient();
      const client2 = new TestClient();

      // Login with both clients
      const [response1, response2] = await Promise.all([
        client1.login(userCredentials),
        client2.login(userCredentials),
      ]);

      expect(response1).toBeHttpStatus(200);
      expect(response2).toBeHttpStatus(200);

      if ('error' in response1.data || 'error' in response2.data) {
        throw new Error('Login failed');
      }

      const session1 = response1.data.session;
      const session2 = response2.data.session;

      // Sessions should be different
      expect(session1).not.toBe(session2);

      // Cookies should be different
      const cookies1 = client1.getCookies();
      const cookies2 = client2.getCookies();

      expect(cookies1.size).toBeGreaterThan(0);
      expect(cookies2.size).toBeGreaterThan(0);

      // Cookie names should include different session IDs
      const cookieNames1 = Array.from(cookies1.keys());
      const cookieNames2 = Array.from(cookies2.keys());

      expect(cookieNames1).not.toEqual(cookieNames2);

      // Cleanup
      await Promise.all([client1.logout().catch(() => {}), client2.logout().catch(() => {})]);
    });

    it('should not allow cookie reuse across sessions', async () => {
      if (!userCredentials) {
        throw new Error('No user credentials available for testing');
      }

      const client1 = new TestClient();
      const client2 = new TestClient();

      // Login with client1
      const loginResponse = await client1.login(userCredentials);
      expect(loginResponse).toBeHttpStatus(200);

      if ('error' in loginResponse.data) {
        throw new Error(loginResponse.data.error);
      }

      const session1 = loginResponse.data.session;
      const cookies1 = client1.getCookies();

      // Login with client2 to get a different session
      await client2.login(userCredentials);
      const session2 = client2.getCurrentSession()!;
      const cookies2 = client2.getCookies();

      // Now set client2's cookies to client1's cookies (wrong session)
      client2.clearCookies();
      cookies1.forEach((value, name) => {
        client2.setCookie(name, value);
      });

      // Try to use session1 cookies with session2 ID (should fail)
      const invalidRefresh = await client2.refreshToken(session2);
      expect(invalidRefresh).toBeHttpStatus(401);

      // Restore proper cookies for validation
      client2.clearCookies();
      cookies2.forEach((value, name) => {
        client2.setCookie(name, value);
      });

      // Proper refresh should work
      const validRefresh = await client2.refreshToken(session2);
      expect(validRefresh).toBeHttpStatus(200);

      // Cleanup
      await Promise.all([client1.logout().catch(() => {}), client2.logout().catch(() => {})]);
    });
  });

  describe('Cookie Expiration and Cleanup', () => {
    it('should update cookies on token refresh', async () => {
      if (!userCredentials) {
        throw new Error('No user credentials available for testing');
      }

      // Login first
      const loginResponse = await client.login(userCredentials);
      expect(loginResponse).toBeHttpStatus(200);

      if ('error' in loginResponse.data) {
        throw new Error(loginResponse.data.error);
      }

      const sessionId = loginResponse.data.session;
      const initialCookies = new Map(client.getCookies());

      // Perform token refresh
      const refreshResponse = await client.refreshToken(sessionId);
      expect(refreshResponse).toBeHttpStatus(200);

      // Check if Set-Cookie header is present (new refresh token)
      const setCookieHeader = refreshResponse.headers['set-cookie'];
      if (setCookieHeader) {
        expect(setCookieHeader).toMatch(/HttpOnly/i);
      }

      // Cookies should be updated (new refresh token stored)
      const updatedCookies = client.getCookies();
      expect(updatedCookies.size).toBeGreaterThan(0);
    });

    it('should clear cookies on logout', async () => {
      if (!userCredentials) {
        throw new Error('No user credentials available for testing');
      }

      // Login first
      await client.login(userCredentials);
      expect(client.getCookies().size).toBeGreaterThan(0);

      // Logout
      const logoutResponse = await client.logout();
      expect(logoutResponse).toBeHttpStatus(200);

      // Cookies should be cleared locally
      expect(client.getCookies().size).toBe(0);

      // Check if logout response includes cookie deletion instructions
      const setCookieHeader = logoutResponse.headers['set-cookie'];
      if (setCookieHeader) {
        // Should contain directives to delete the cookie
        expect(setCookieHeader).toMatch(/Max-Age=0|Expires=.*1970/i);
      }
    });
  });

  describe('Cookie Security Headers', () => {
    it('should include security headers in cookie responses', async () => {
      if (!userCredentials) {
        throw new Error('No user credentials available for testing');
      }

      const response = await client.login(userCredentials);
      expect(response).toBeHttpStatus(200);

      const setCookieHeader = response.headers['set-cookie'];
      if (setCookieHeader) {
        // Parse cookie attributes
        const cookieParts = setCookieHeader
          .toLowerCase()
          .split(';')
          .map(part => part.trim());

        // Should have HttpOnly
        expect(cookieParts).toContainEqual(expect.stringMatching(/httponly/));

        // Should have SameSite
        expect(cookieParts.some(part => part.startsWith('samesite='))).toBe(true);

        // Should have Path
        expect(cookieParts.some(part => part.startsWith('path='))).toBe(true);

        // Should have appropriate expiration
        const hasMaxAge = cookieParts.some(part => part.startsWith('max-age='));
        const hasExpires = cookieParts.some(part => part.startsWith('expires='));
        expect(hasMaxAge || hasExpires).toBe(true);
      }
    });

    it('should not expose sensitive information in cookie values', async () => {
      if (!userCredentials) {
        throw new Error('No user credentials available for testing');
      }

      const response = await client.login(userCredentials);
      expect(response).toBeHttpStatus(200);

      const cookies = client.getCookies();

      // Cookie values should be opaque (not contain readable user information)
      cookies.forEach((value, name) => {
        // Should not contain email or obvious user data
        expect(value.toLowerCase()).not.toContain(userCredentials!.email.toLowerCase());
        expect(value.toLowerCase()).not.toContain('password');
        expect(value.toLowerCase()).not.toContain('admin');

        // Should be reasonably long (secure token)
        expect(value.length).toBeGreaterThan(20);
      });
    });
  });

  describe('Cross-Origin Cookie Handling', () => {
    it('should handle cookies with credentials properly', async () => {
      if (!userCredentials) {
        throw new Error('No user credentials available for testing');
      }

      // Login and verify cookies are handled with credentials: 'include'
      const response = await client.login(userCredentials);
      expect(response).toBeHttpStatus(200);

      // Make API call that should include cookies
      const apiResponse = await client.get(['api', 'lists']);
      expect(apiResponse).toBeHttpStatus(200);

      // Verify the request included proper cookie handling
      // (This is implicit since the API call succeeded with session cookies)
      expect(client.getCookies().size).toBeGreaterThan(0);
    });

    it('should maintain cookie consistency across requests', async () => {
      if (!userCredentials) {
        throw new Error('No user credentials available for testing');
      }

      // Login
      await client.login(userCredentials);
      const initialCookies = new Map(client.getCookies());

      // Make several API calls
      await Promise.all([
        client.get(['api', 'lists']),
        client.get(['api', 'lists']),
        client.get(['api', 'lists']),
      ]);

      // Cookies should remain consistent
      const finalCookies = client.getCookies();
      expect(finalCookies.size).toBe(initialCookies.size);

      // Cookie values should be the same (no unexpected changes)
      initialCookies.forEach((value, name) => {
        expect(finalCookies.get(name)).toBe(value);
      });
    });
  });

  describe('Security Edge Cases', () => {
    it('should reject requests with malformed session cookies', async () => {
      if (!userCredentials) {
        throw new Error('No user credentials available for testing');
      }

      // Login normally first
      const loginResponse = await client.login(userCredentials);
      expect(loginResponse).toBeHttpStatus(200);

      if ('error' in loginResponse.data) {
        throw new Error(loginResponse.data.error);
      }

      const sessionId = loginResponse.data.session;

      // Tamper with cookies by setting invalid values
      client.clearCookies();
      client.setCookie(`__miauflix_rt_${sessionId}`, 'invalid-token-value');

      // Try to refresh with tampered cookie
      const refreshResponse = await client.refreshToken(sessionId);
      expect(refreshResponse).toBeHttpStatus(401);
    });

    it('should handle missing cookies gracefully', async () => {
      if (!userCredentials) {
        throw new Error('No user credentials available for testing');
      }

      // Login first
      const loginResponse = await client.login(userCredentials);
      expect(loginResponse).toBeHttpStatus(200);

      if ('error' in loginResponse.data) {
        throw new Error(loginResponse.data.error);
      }

      const sessionId = loginResponse.data.session;

      // Clear cookies manually
      client.clearCookies();

      // Try to refresh without cookies
      const refreshResponse = await client.refreshToken(sessionId);
      expect(refreshResponse).toBeHttpStatus(401);
    });

    it('should validate cookie-session consistency', async () => {
      if (!userCredentials) {
        throw new Error('No user credentials available for testing');
      }

      const client1 = new TestClient();
      const client2 = new TestClient();

      // Create two separate sessions
      await client1.login(userCredentials);
      await client2.login(userCredentials);

      const session1 = client1.getCurrentSession()!;
      const session2 = client2.getCurrentSession()!;

      // Try to use session1 ID with session2 cookies (should fail)
      const cookies2 = client2.getCookies();
      client1.clearCookies();
      cookies2.forEach((value, name) => {
        client1.setCookie(name, value);
      });

      const invalidRefresh = await client1.refreshToken(session1);
      expect(invalidRefresh).toBeHttpStatus(401);

      // Cleanup
      await Promise.all([client1.logout().catch(() => {}), client2.logout().catch(() => {})]);
    });
  });
});
