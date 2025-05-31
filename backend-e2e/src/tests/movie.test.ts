import { TestClient, waitForService, extractUserCredentialsFromLogs } from '../utils/test-utils';

describe('Movie Endpoints', () => {
  let client: TestClient;
  let userCredentials: { email: string; password: string } | null = null;

  beforeAll(async () => {
    client = new TestClient();

    try {
      await waitForService(client);

      // Try to extract user credentials from Docker logs
      userCredentials = await extractUserCredentialsFromLogs();

      if (userCredentials) {
        // Login to get authentication
        await client.login(userCredentials);
      }
    } catch (error) {
      console.log('❌ Backend service is not available. Ensure the Docker environment is running.');
      throw error;
    }
  }, 60000);

  describe('GET /movies/:id', () => {
    it('should require authentication', async () => {
      // Clear auth to test unauthorized access
      client.clearAuth();

      const response = await client.get('/movies/550'); // Fight Club movie ID

      expect(response.status).toBe(401);
      expect(response.data).toHaveProperty('message');

      // Restore auth for other tests
      if (userCredentials) {
        await client.login(userCredentials);
      }
    });

    it('should return 404 for non-existent movie', async () => {
      if (!userCredentials) {
        throw new Error(
          'No user credentials available for testing - ensure backend is running and generating admin user'
        );
      }

      const response = await client.get('/movies/999999999');

      expect(response.status).toBe(404);
      expect(response.data).toHaveProperty('error', 'Movie not found');
    });

    it('should validate movie ID parameter', async () => {
      if (!userCredentials) {
        throw new Error(
          'No user credentials available for testing - ensure backend is running and generating admin user'
        );
      }

      // Test invalid movie ID (non-numeric)
      const response = await client.get('/movies/invalid-id');

      expect(response.status).toBe(400);
      expect(response.data).toHaveProperty('error');
    });

    it('should return movie details for valid movie ID', async () => {
      if (!userCredentials) {
        throw new Error(
          'No user credentials available for testing - ensure backend is running and generating admin user'
        );
      }

      // Use a popular movie ID that should exist (Fight Club)
      const response = await client.get('/movies/550');

      if (response.status === 404) {
        throw new Error('Movie not found - ensure the backend has the TMDB data loaded');
      }

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('id');
      expect(response.data).toHaveProperty('tmdbId');
      expect(response.data).toHaveProperty('title');
      expect(response.data).toHaveProperty('overview');
      expect(response.data).toHaveProperty('releaseDate');
      expect(response.data).toHaveProperty('runtime');
      expect(response.data).toHaveProperty('poster');
      expect(response.data).toHaveProperty('backdrop');
      expect(response.data).toHaveProperty('genres');
      expect(response.data).toHaveProperty('popularity');
      expect(response.data).toHaveProperty('rating');

      // Validate data types
      expect(typeof response.data.id).toBe('number');
      expect(typeof response.data.tmdbId).toBe('number');
      expect(typeof response.data.title).toBe('string');
      expect(typeof response.data.overview).toBe('string');
      expect(typeof response.data.runtime).toBe('number');
      expect(Array.isArray(response.data.genres)).toBe(true);
      expect(typeof response.data.popularity).toBe('number');
      expect(typeof response.data.rating).toBe('number');
    });

    it('should support language parameter', async () => {
      if (!userCredentials) {
        throw new Error(
          'No user credentials available for testing - ensure backend is running and generating admin user'
        );
      }

      // Test with Spanish language
      const response = await client.get('/movies/550', { lang: 'es' });

      if (response.status === 404) {
        throw new Error('Movie not found for Spanish language');
      }

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('title');
      expect(response.data).toHaveProperty('overview');
    });

    it('should include sources when requested', async () => {
      if (!userCredentials) {
        throw new Error(
          'No user credentials available for testing - ensure backend is running and generating admin user'
        );
      }

      const response = await client.get('/movies/550', { includeSources: 'true' });

      if (response.status === 404) {
        throw new Error('Movie not found for Spanish language');
      }

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('sources');

      if (response.data.sources && response.data.sources.length > 0) {
        const source = response.data.sources[0];
        expect(source).toHaveProperty('id');
        expect(source).toHaveProperty('hash');
        expect(source).toHaveProperty('magnetLink');
        expect(source).toHaveProperty('quality');
        expect(source).toHaveProperty('resolution');
        expect(source).toHaveProperty('size');
        expect(source).toHaveProperty('videoCodec');
        expect(source).toHaveProperty('source');
        expect(source).toHaveProperty('hasTorrentFile');

        // Validate source data types
        expect(typeof source.id).toBe('number');
        expect(typeof source.hash).toBe('string');
        expect(typeof source.magnetLink).toBe('string');
        expect(typeof source.quality).toBe('string');
        expect(typeof source.resolution).toBe('number');
        expect(typeof source.size).toBe('number');
        expect(typeof source.videoCodec).toBe('string');
        expect(typeof source.source).toBe('string');
        expect(typeof source.hasTorrentFile).toBe('boolean');
      }
    });

    it('should not include sources by default', async () => {
      if (!userCredentials) {
        throw new Error(
          'No user credentials available for testing - ensure backend is running and generating admin user'
        );
      }

      const response = await client.get('/movies/550');

      if (response.status === 404) {
        throw new Error('Movie not found for Spanish language');
      }

      expect(response.status).toBe(200);
      expect(response.data).not.toHaveProperty('sources');
    });

    it('should handle rate limiting', async () => {
      if (!userCredentials) {
        throw new Error(
          'No user credentials available for testing - ensure backend is running and generating admin user'
        );
      }

      // Make multiple rapid requests to test rate limiting (10 requests per second limit)
      // Use _forceRateLimit=true to enable rate limiting for this specific test
      const promises = Array(15)
        .fill(0)
        .map(() => client.get('/movies/550?_forceRateLimit=true'));
      const responses = await Promise.all(promises);

      // At least some requests should be rate limited
      const rateLimitedResponses = responses.filter(r => r.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    }, 10000);

    it('should handle server errors gracefully', async () => {
      if (!userCredentials) {
        throw new Error(
          'No user credentials available for testing - ensure backend is running and generating admin user'
        );
      }

      // Test with edge case movie ID that might cause issues
      const response = await client.get('/movies/0');

      // Should return either 404 or 400, but not 500
      expect([400, 404]).toContain(response.status);
    });
  });
});
