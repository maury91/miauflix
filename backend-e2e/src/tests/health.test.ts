import { TestClient, waitForService } from '../utils/test-utils';

describe('Health Endpoint', () => {
  let client: TestClient;

  beforeAll(async () => {
    client = new TestClient();

    // Wait for the backend to be ready before running tests
    try {
      await waitForService(client);
    } catch (error) {
      console.log('❌ Backend service is not available. Ensure the Docker environment is running.');
      console.log('Run: ./scripts/env.sh test to start the full test environment');
      throw error;
    }
  }, 60000); // 60 second timeout for service startup

  it('should return 200 OK for health check', async () => {
    const response = await client.get('/health');

    expect(response.status).toBeHttpStatus(200);
    expect(response.data).toEqual({
      status: 'ok',
    });
  });

  it('should respond quickly to health checks', async () => {
    const startTime = Date.now();
    const response = await client.get('/health');
    const endTime = Date.now();

    const responseTime = endTime - startTime;

    expect(response.status).toBe(200);
    expect(responseTime).toBeLessThan(1000); // Should respond within 1 second
  });

  it('should have correct content type for health response', async () => {
    const response = await client.get('/health');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/application\/json/);
  });

  it('should be accessible without authentication', async () => {
    // Ensure we're not authenticated
    client.clearAuth();

    const response = await client.get('/health');

    expect(response.status).toBe(200);
    expect(response.data.status).toBe('ok');
  });
});
