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
    // Clear any auth tokens after each test
    client.clearAuth();
  });

  it('should reject login with invalid credentials', async () => {
    const response = await client.login({
      email: 'nonexistent@example.com',
      password: 'wrongpassword',
    });

    expect(response).toBeHttpStatus(401);
    expect(response.data).toHaveProperty('error');
  });

  it('should require authentication for protected endpoints', async () => {
    // Try to access a protected endpoint without authentication
    const response = await client.get(['lists']);

    expect(response).toBeHttpStatus(401);
  });

  it('should login with valid credentials', async () => {
    if (!userCredentials) {
      throw new Error(
        'No user credentials available for testing - ensure backend is running and generating admin user'
      );
    }

    const response = await client.login(userCredentials);

    expect(response).toBeHttpStatus(200);
    expect(response.data).toHaveProperty('accessToken');
    expect(response.data).toHaveProperty('refreshToken');
    if ('accessToken' in response.data) {
      expect(typeof response.data.accessToken).toBe('string');
      expect(typeof response.data.refreshToken).toBe('string');
    }
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
    const response = await client.get(['lists']);

    expect(response).toBeHttpStatus(200);
    expect(response.data).toBeDefined();
  });

  it('should refresh access token', async () => {
    if (!userCredentials) {
      throw new Error(
        'No user credentials available for testing - ensure backend is running and generating admin user'
      );
    }

    // Login first to get tokens
    const loginResponse = await client.login(userCredentials);

    // Clear auth to test refresh without being authenticated
    client.clearAuth();

    if (!('refreshToken' in loginResponse.data)) {
      throw new Error('No refresh token in login response');
    }

    // Use refresh token to get new access token
    const refreshResponse = await client.post(['auth', 'refresh'], {
      json: {
        refreshToken: loginResponse.data.refreshToken,
      },
    });

    expect(refreshResponse).toBeHttpStatus(200);
    expect(refreshResponse.data).toHaveProperty('accessToken');
    expect(refreshResponse.data).toHaveProperty('refreshToken');
  });

  it('should logout successfully', async () => {
    if (!userCredentials) {
      throw new Error(
        'No user credentials available for testing - ensure backend is running and generating admin user'
      );
    }

    // Login first to get tokens
    const loginResponse = await client.login(userCredentials);

    if (!('refreshToken' in loginResponse.data)) {
      throw new Error('No refresh token in login response');
    }

    // Logout using refresh token
    const logoutResponse = await client.logout(loginResponse.data.refreshToken);

    expect(logoutResponse).toBeHttpStatus(200);
    expect(logoutResponse.data).toHaveProperty('message');
  });

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
          ['auth', 'login'],
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
});
