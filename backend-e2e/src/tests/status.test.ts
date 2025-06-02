import { TestClient, waitForService } from '../utils/test-utils';

describe('Status Endpoint', () => {
  let client: TestClient;

  beforeAll(async () => {
    client = new TestClient();

    try {
      await waitForService(client);
    } catch (error) {
      console.log('❌ Backend service is not available. Ensure the Docker environment is running.');
      throw error;
    }
  }, 60000); // 60 second timeout for service startup

  it('should return 200 OK for status check', async () => {
    const response = await client.get('/status');

    expect(response.status).toBeHttpStatus(200);
    expect(response.data).toHaveProperty('tmdb');
    expect(response.data).toHaveProperty('vpn');
    expect(response.data).toHaveProperty('trackers');
    expect(response.data).toHaveProperty('magnetResolvers');
  });

  it('should return service status information', async () => {
    const response = await client.get('/status');

    expect(response.status).toBe(200);

    // Verify the structure of status data
    const { tmdb, vpn, trackers, magnetResolvers } = response.data;

    // TMDB status should have basic info
    expect(tmdb).toBeDefined();

    // VPN status should have basic info
    expect(vpn).toBeDefined();

    // Trackers status should have basic info
    expect(trackers).toBeDefined();

    // Magnet resolvers status should have basic info
    expect(magnetResolvers).toBeDefined();
  });

  it('should be accessible without authentication', async () => {
    // Ensure we're not authenticated
    client.clearAuth();

    const response = await client.get('/status');

    expect(response.status).toBe(200);
  });
});
