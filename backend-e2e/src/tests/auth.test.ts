import {
  TestClient,
  waitForService,
  testData,
  extractUserCredentialsFromLogs,
} from '../utils/test-utils';

describe('Authentication Endpoints', () => {
  let client: TestClient;
  let userCredentials: { email: string; password: string } | null = null;

  beforeAll(async () => {
    client = new TestClient();

    try {
      await waitForService(client);

      // Try to extract user credentials from Docker logs
      console.log('🔍 Extracting user credentials from backend logs...');
      userCredentials = await extractUserCredentialsFromLogs();

      if (userCredentials) {
        console.log(`✅ Found admin user: ${userCredentials.email}`);
      } else {
        console.log('⚠️ No user credentials found in logs - some tests will be skipped');
      }
    } catch (error) {
      console.log('❌ Backend service is not available. Ensure the Docker environment is running.');
      throw error;
    }
  }, 60000);

  afterEach(async () => {
    // Clear any auth tokens after each test
    client.clearAuth();

    // Add delay to prevent rate limiting between auth tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  it('should reject login with invalid credentials', async () => {
    const response = await client.post('/auth/login', {
      email: 'nonexistent@example.com',
      password: 'wrongpassword',
    });

    expect(response.status).toBe(401);
    expect(response.data).toHaveProperty('message');
  });

  it('should require authentication for protected endpoints', async () => {
    // Try to access a protected endpoint without authentication
    const response = await client.get('/lists');

    expect(response.status).toBe(401);
  });

  it('should login with valid credentials', async () => {
    if (!userCredentials) {
      console.log('⚠️ Skipping login test - no user credentials available');
      return;
    }

    const response = await client.login(userCredentials);

    expect(response).toHaveProperty('accessToken');
    expect(response).toHaveProperty('refreshToken');
    expect(typeof response.accessToken).toBe('string');
    expect(typeof response.refreshToken).toBe('string');
  });

  it('should access protected endpoints when authenticated', async () => {
    if (!userCredentials) {
      console.log('⚠️ Skipping protected endpoint test - no user credentials available');
      return;
    }

    // Login first
    await client.login(userCredentials);

    // Now try to access a protected endpoint
    const response = await client.get('/lists');

    expect(response.status).toBe(200);
    expect(response.data).toBeDefined();
  });

  it('should refresh access token', async () => {
    if (!userCredentials) {
      console.log('⚠️ Skipping token refresh test - no user credentials available');
      return;
    }

    // Login first to get tokens
    const loginResponse = await client.login(userCredentials);

    // Clear auth to test refresh without being authenticated
    client.clearAuth();

    // Use refresh token to get new access token
    const refreshResponse = await client.post('/auth/refresh', {
      refreshToken: loginResponse.refreshToken,
    });

    expect(refreshResponse.status).toBe(200);
    expect(refreshResponse.data).toHaveProperty('accessToken');
    expect(refreshResponse.data).toHaveProperty('refreshToken');
  });

  it('should logout successfully', async () => {
    if (!userCredentials) {
      console.log('⚠️ Skipping logout test - no user credentials available');
      return;
    }

    // Login first to get tokens
    const loginResponse = await client.login(userCredentials);

    // Logout using refresh token
    const logoutResponse = await client.post('/auth/logout', {
      refreshToken: loginResponse.refreshToken,
    });

    expect(logoutResponse.status).toBe(200);
    expect(logoutResponse.data).toHaveProperty('message');
  });

  it('should enforce rate limiting on login attempts', async () => {
    // Test rate limiting by making multiple rapid login attempts
    const invalidCredentials = {
      email: 'test@example.com',
      password: 'wrongpassword',
    };

    // Make multiple rapid login attempts to trigger rate limiting
    const promises = [];
    for (let i = 0; i < 6; i++) {
      promises.push(
        client.post('/auth/login', invalidCredentials).catch(err => ({
          status: err.response?.status || 500,
          data: err.response?.data || {},
        }))
      );
    }

    const responses = await Promise.all(promises);

    // At least one response should be rate limited (429)
    const rateLimitedResponses = responses.filter(r => r.status === 429);
    expect(rateLimitedResponses.length).toBeGreaterThan(0);

    console.log(
      `✅ Rate limiting working: ${rateLimitedResponses.length} out of ${responses.length} requests were rate limited`
    );
  });
});
