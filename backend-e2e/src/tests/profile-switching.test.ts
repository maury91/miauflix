import { UserRole } from '@miauflix/backend-client';
import {
  TestClient,
  waitForService,
  extractUserCredentialsFromLogs,
  testUtils,
} from '../utils/test-utils';

describe('Profile Switching with Multiple Users', () => {
  let adminCredentials: { email: string; password: string } | null = null;
  let testUsers: Array<{ email: string; password: string; id?: string }> = [];

  beforeAll(async () => {
    try {
      const testClient = new TestClient();
      await waitForService(testClient);

      // Extract admin credentials from Docker logs
      adminCredentials = await extractUserCredentialsFromLogs();

      if (!adminCredentials) {
        throw new Error('No admin credentials available for testing');
      }

      // Login as admin to create test users
      await testClient.login(adminCredentials);

      // Create 3 test users
      testUsers = [];
      for (let i = 0; i < 3; i++) {
        const email = `profile-user-${i + 1}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}@example.com`;
        const password = testUtils.randomPassword();

        const createResponse = await testClient.post(['api', 'auth', 'users'], {
          json: {
            email,
            password,
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
          console.error(`Failed to create test user ${i + 1}:`, errorMsg, 'Response:', errorData);
          throw new Error(`Failed to create test user ${i + 1}: ${errorMsg}`);
        }

        testUsers.push({ email, password });
      }

      // Cleanup - logout admin
      testClient.clearAuth();
    } catch (error) {
      console.log('❌ Backend service is not available. Ensure the Docker environment is running.');
      throw error;
    }
  }, 60000);

  describe('Login as Multiple Users', () => {
    it('should login as multiple users and accumulate cookies', async () => {
      if (!testUsers.length) {
        throw new Error('No test users available');
      }

      const client = new TestClient();
      const sessions: string[] = [];

      // Login as each user (same client, different sessions)
      for (const user of testUsers) {
        const loginResponse = await client.login(user);
        expect(loginResponse).toBeHttpStatus(200);

        if ('error' in loginResponse.data) {
          throw new Error(loginResponse.data.error);
        }

        sessions.push(loginResponse.data.session);
      }

      // Verify we have multiple cookies (access tokens + refresh tokens for each session)
      const cookies = client.getCookies();
      // Should have at least: 3 access token cookies + 3 refresh token cookies = 6 cookies
      expect(cookies.size).toBeGreaterThanOrEqual(6);

      // Verify all sessions are different
      const uniqueSessions = new Set(sessions);
      expect(uniqueSessions.size).toBe(sessions.length);

      // Cleanup
      await client.logout().catch(() => {});
    });
  });

  describe('Query Session Info', () => {
    it('should return correct session info for each session', async () => {
      if (!testUsers.length) {
        throw new Error('No test users available');
      }

      const client = new TestClient();
      const sessions: string[] = [];

      // Login as each user
      for (const user of testUsers) {
        const loginResponse = await client.login(user);
        expect(loginResponse).toBeHttpStatus(200);

        if ('error' in loginResponse.data) {
          throw new Error(loginResponse.data.error);
        }

        sessions.push(loginResponse.data.session);
      }

      // Query session info for each session
      for (let i = 0; i < sessions.length; i++) {
        const sessionId = sessions[i];
        const user = testUsers[i];

        // Set the session ID for this request
        client.setSession(sessionId);

        // Query session info
        const sessionInfoResponse = await client.get(['api', 'auth', 'session']);

        expect(sessionInfoResponse).toBeHttpStatus(200);
        expect(sessionInfoResponse.data).toHaveProperty('session', sessionId);
        expect(sessionInfoResponse.data).toHaveProperty('user');
        expect(sessionInfoResponse.data.user).toHaveProperty('email', user.email);
        expect(sessionInfoResponse.data.user).toHaveProperty('id');
        expect(sessionInfoResponse.data.user).toHaveProperty('displayName');
        expect(sessionInfoResponse.data.user).toHaveProperty('role');
      }

      // Test with invalid session ID
      client.setSession('invalid-session-id');
      const invalidResponse = await client.get(['api', 'auth', 'session']);
      expect(invalidResponse).toBeHttpStatus(401);

      // Cleanup
      await client.logout().catch(() => {});
    });
  });

  describe('Profile Switching', () => {
    it('should switch between profiles and authenticate correctly', async () => {
      if (!testUsers.length) {
        throw new Error('No test users available');
      }

      const client = new TestClient();
      const sessions: string[] = [];
      const userEmails: string[] = [];

      // Login as each user
      for (const user of testUsers) {
        const loginResponse = await client.login(user);
        expect(loginResponse).toBeHttpStatus(200);

        if ('error' in loginResponse.data) {
          throw new Error(loginResponse.data.error);
        }

        sessions.push(loginResponse.data.session);
        userEmails.push(user.email);
      }

      // Switch to session1 (user1)
      client.setSession(sessions[0]);
      const api1 = await client.get(['api', 'lists']);
      expect(api1).toBeHttpStatus(200);

      // Verify we're authenticated as user1 by checking session info
      const sessionInfo1 = await client.get(['api', 'auth', 'session']);
      expect(sessionInfo1).toBeHttpStatus(200);
      expect(sessionInfo1.data.user.email).toBe(userEmails[0]);

      // Switch to session2 (user2)
      client.setSession(sessions[1]);
      const api2 = await client.get(['api', 'lists']);
      expect(api2).toBeHttpStatus(200);

      // Verify we're authenticated as user2
      const sessionInfo2 = await client.get(['api', 'auth', 'session']);
      expect(sessionInfo2).toBeHttpStatus(200);
      expect(sessionInfo2.data.user.email).toBe(userEmails[1]);

      // Switch to session3 (user3)
      client.setSession(sessions[2]);
      const api3 = await client.get(['api', 'lists']);
      expect(api3).toBeHttpStatus(200);

      // Verify we're authenticated as user3
      const sessionInfo3 = await client.get(['api', 'auth', 'session']);
      expect(sessionInfo3).toBeHttpStatus(200);
      expect(sessionInfo3.data.user.email).toBe(userEmails[2]);

      // Switch back to session1
      client.setSession(sessions[0]);
      const api4 = await client.get(['api', 'lists']);
      expect(api4).toBeHttpStatus(200);

      // Verify we're back to user1
      const sessionInfo4 = await client.get(['api', 'auth', 'session']);
      expect(sessionInfo4).toBeHttpStatus(200);
      expect(sessionInfo4.data.user.email).toBe(userEmails[0]);

      // Cleanup
      await client.logout().catch(() => {});
    });

    it('should handle switching to invalid session', async () => {
      if (!testUsers.length) {
        throw new Error('No test users available');
      }

      const client = new TestClient();

      // Login as first user
      const loginResponse = await client.login(testUsers[0]);
      expect(loginResponse).toBeHttpStatus(200);

      if ('error' in loginResponse.data) {
        throw new Error(loginResponse.data.error);
      }

      // Try to switch to invalid session
      client.setSession('invalid-session-id');
      const invalidApi = await client.get(['api', 'lists']);
      expect(invalidApi).toBeHttpStatus(401);

      // Query invalid session info
      const invalidSessionInfo = await client.get(['api', 'auth', 'session']);
      expect(invalidSessionInfo).toBeHttpStatus(401);

      // Cleanup
      await client.logout().catch(() => {});
    });
  });
});
