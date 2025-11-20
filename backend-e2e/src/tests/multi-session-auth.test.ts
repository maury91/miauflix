import { extractUserCredentialsFromLogs, TestClient, waitForService } from '../utils/test-utils';

describe('Multi-Session Authentication Support', () => {
  let userCredentials: { email: string; password: string } | null = null;

  beforeAll(async () => {
    try {
      const testClient = new TestClient();
      await waitForService(testClient);

      // Try to extract user credentials from Docker logs
      userCredentials = await extractUserCredentialsFromLogs();
    } catch (error) {
      console.log('❌ Backend service is not available. Ensure the Docker environment is running.');
      throw error;
    }
  }, 60000);

  describe('Concurrent Sessions', () => {
    it('should support multiple concurrent sessions for same user', async () => {
      if (!userCredentials) {
        throw new Error('No user credentials available for testing');
      }

      // Create multiple client instances to simulate different devices/browsers
      const client1 = new TestClient();
      const client2 = new TestClient();
      const client3 = new TestClient();

      // Login with each client (same user, different sessions)
      const [login1, login2, login3] = await Promise.all([
        client1.login(userCredentials),
        client2.login(userCredentials),
        client3.login(userCredentials),
      ]);

      // All logins should succeed
      expect(login1).toBeHttpStatus(200);
      expect(login2).toBeHttpStatus(200);
      expect(login3).toBeHttpStatus(200);

      // Ensure all logins were successful before accessing session
      if ('error' in login1.data || 'error' in login2.data || 'error' in login3.data) {
        throw new Error('Login failed');
      }

      // Each should have different session IDs
      const session1 = login1.data.session;
      const session2 = login2.data.session;
      const session3 = login3.data.session;

      expect(session1).not.toBe(session2);
      expect(session1).not.toBe(session3);
      expect(session2).not.toBe(session3);

      // All sessions should be independently functional
      const [api1, api2, api3] = await Promise.all([
        client1.get(['api', 'lists']),
        client2.get(['api', 'lists']),
        client3.get(['api', 'lists']),
      ]);

      expect(api1).toBeHttpStatus(200);
      expect(api2).toBeHttpStatus(200);
      expect(api3).toBeHttpStatus(200);

      // Cleanup
      await Promise.all([
        client1.logout().catch(() => {}),
        client2.logout().catch(() => {}),
        client3.logout().catch(() => {}),
      ]);
    });

    it('should handle independent session refresh operations', async () => {
      if (!userCredentials) {
        throw new Error('No user credentials available for testing');
      }

      const client1 = new TestClient();
      const client2 = new TestClient();

      // Login with both clients
      await Promise.all([client1.login(userCredentials), client2.login(userCredentials)]);

      const session1 = client1.getCurrentSession()!;
      const session2 = client2.getCurrentSession()!;

      // Refresh tokens independently
      const [refresh1, refresh2] = await Promise.all([
        client1.refreshToken(session1),
        client2.refreshToken(session2),
      ]);

      // Both refreshes should succeed
      expect(refresh1).toBeHttpStatus(200);
      expect(refresh2).toBeHttpStatus(200);

      // Both sessions should still be functional after refresh
      const [api1, api2] = await Promise.all([
        client1.get(['api', 'lists']),
        client2.get(['api', 'lists']),
      ]);

      expect(api1).toBeHttpStatus(200);
      expect(api2).toBeHttpStatus(200);

      // Cleanup
      await Promise.all([client1.logout().catch(() => {}), client2.logout().catch(() => {})]);
    });

    it('should handle independent session logout operations', async () => {
      if (!userCredentials) {
        throw new Error('No user credentials available for testing');
      }

      const client1 = new TestClient();
      const client2 = new TestClient();

      // Login with both clients
      await Promise.all([client1.login(userCredentials), client2.login(userCredentials)]);

      const session1 = client1.getCurrentSession()!;
      const session2 = client2.getCurrentSession()!;

      // Logout from first session only
      const logout1 = await client1.logout(session1);
      expect(logout1).toBeHttpStatus(200);

      // First session should be invalidated
      const api1 = await client1.get(['api', 'lists']);
      expect(api1).toBeHttpStatus(401);

      // Second session should still be functional
      const api2 = await client2.get(['api', 'lists']);
      expect(api2).toBeHttpStatus(200);

      // Cleanup remaining session
      await client2.logout().catch(() => {});
    });
  });

  describe('Session Isolation', () => {
    it('should ensure sessions do not interfere with each other', async () => {
      if (!userCredentials) {
        throw new Error('No user credentials available for testing');
      }

      const client1 = new TestClient();
      const client2 = new TestClient();

      // Login with both clients
      await Promise.all([client1.login(userCredentials), client2.login(userCredentials)]);

      const session1 = client1.getCurrentSession()!;
      const session2 = client2.getCurrentSession()!;

      // Get cookies from each client
      const cookies1 = client1.getCookies();
      const cookies2 = client2.getCookies();

      // Cookies should be different (different refresh tokens)
      expect(cookies1.size).toBeGreaterThan(0);
      expect(cookies2.size).toBeGreaterThan(0);

      // Try to use session1's cookies with session2 endpoint (should fail)
      const crossSessionRefresh = await client1.refreshToken(session2);
      expect(crossSessionRefresh).toBeHttpStatus(401);

      // Proper session refresh should still work
      const properRefresh1 = await client1.refreshToken(session1);
      const properRefresh2 = await client2.refreshToken(session2);

      expect(properRefresh1).toBeHttpStatus(200);
      expect(properRefresh2).toBeHttpStatus(200);

      // Cleanup
      await Promise.all([client1.logout().catch(() => {}), client2.logout().catch(() => {})]);
    });

    it('should handle session collision scenarios gracefully', async () => {
      if (!userCredentials) {
        throw new Error('No user credentials available for testing');
      }

      const client1 = new TestClient();
      const client2 = new TestClient();

      // Login with both clients
      await Promise.all([client1.login(userCredentials), client2.login(userCredentials)]);

      const session1 = client1.getCurrentSession()!;

      // Try to use same session ID with different client (different cookies)
      const invalidRefresh = await client2.refreshToken(session1);
      expect(invalidRefresh).toBeHttpStatus(401);

      // Original session should still work
      const validRefresh = await client1.refreshToken(session1);
      expect(validRefresh).toBeHttpStatus(200);

      // Cleanup
      await Promise.all([client1.logout().catch(() => {}), client2.logout().catch(() => {})]);
    });
  });

  describe('Session Management Under Load', () => {
    it('should handle rapid session creation', async () => {
      if (!userCredentials) {
        throw new Error('No user credentials available for testing');
      }

      // Create multiple clients and login rapidly
      const clients = Array.from({ length: 5 }, () => new TestClient());
      const loginPromises = clients.map(client => client.login(userCredentials!));

      const loginResponses = await Promise.all(loginPromises);

      // All logins should succeed
      loginResponses.forEach(response => {
        expect(response).toBeHttpStatus(200);
        expect(response.data).toHaveProperty('session');
      });

      // Ensure all logins were successful before accessing sessions
      for (const response of loginResponses) {
        if ('error' in response.data) {
          throw new Error('Login failed');
        }
      }

      // All sessions should be unique
      const sessions = loginResponses.map(r => {
        if ('error' in r.data) {
          throw new Error('Login failed for session mapping');
        }
        return r.data.session;
      });
      const uniqueSessions = new Set(sessions);
      expect(uniqueSessions.size).toBe(sessions.length);

      // All sessions should be functional
      const apiPromises = clients.map(client => client.get(['api', 'lists']));
      const apiResponses = await Promise.all(apiPromises);

      apiResponses.forEach(response => {
        expect(response).toBeHttpStatus(200);
      });

      // Cleanup
      await Promise.all(clients.map(client => client.logout().catch(() => {})));
    });

    it('should handle concurrent refresh operations', async () => {
      if (!userCredentials) {
        throw new Error('No user credentials available for testing');
      }

      // Create multiple sessions
      const clients = Array.from({ length: 3 }, () => new TestClient());
      await Promise.all(clients.map(client => client.login(userCredentials!)));

      // Perform concurrent refreshes
      const refreshPromises = clients.map(client =>
        client.refreshToken(client.getCurrentSession()!)
      );

      const refreshResponses = await Promise.all(refreshPromises);

      // All refreshes should succeed
      refreshResponses.forEach(response => {
        expect(response).toBeHttpStatus(200);
        expect(response.data).toHaveProperty('user');
      });

      // All sessions should still be functional
      const apiPromises = clients.map(client => client.get(['api', 'lists']));
      const apiResponses = await Promise.all(apiPromises);

      apiResponses.forEach(response => {
        expect(response).toBeHttpStatus(200);
      });

      // Cleanup
      await Promise.all(clients.map(client => client.logout().catch(() => {})));
    });

    it('should handle mixed operations across multiple sessions', async () => {
      if (!userCredentials) {
        throw new Error('No user credentials available for testing');
      }

      const client1 = new TestClient();
      const client2 = new TestClient();
      const client3 = new TestClient();

      // Login with all clients
      await Promise.all([
        client1.login(userCredentials),
        client2.login(userCredentials),
        client3.login(userCredentials),
      ]);

      // Perform mixed operations concurrently
      const operations = [
        // Client 1: API calls
        client1.get(['api', 'lists']),
        client1.get(['api', 'lists']),

        // Client 2: Token refresh then API call
        client2
          .refreshToken(client2.getCurrentSession()!)
          .then(() => client2.get(['api', 'lists'])),

        // Client 3: API call then logout
        client3.get(['api', 'lists']).then(() => client3.logout()),
      ];

      const results = await Promise.all(operations);

      // First 3 operations should succeed
      expect(results[0]).toBeHttpStatus(200);
      expect(results[1]).toBeHttpStatus(200);
      expect(results[2]).toBeHttpStatus(200);

      // Logout should succeed
      expect(results[3]).toBeHttpStatus(200);

      // Client 3 should no longer be able to access API
      const client3Api = await client3.get(['api', 'lists']);
      expect(client3Api).toBeHttpStatus(401);

      // Clients 1 and 2 should still work
      const [api1, api2] = await Promise.all([
        client1.get(['api', 'lists']),
        client2.get(['api', 'lists']),
      ]);

      expect(api1).toBeHttpStatus(200);
      expect(api2).toBeHttpStatus(200);

      // Cleanup
      await Promise.all([client1.logout().catch(() => {}), client2.logout().catch(() => {})]);
    });
  });
});
