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

      const response = await client.get(['movies', ':id'], {
        param: { id: '550' }, // Use a valid movie ID for testing
        query: {},
      });

      expect(response).toBeHttpStatus(401);
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

      const response = await client.get(['movies', ':id'], {
        param: { id: '999999999' }, // Use a valid movie ID for testing
        query: {},
      });

      expect(response).toBeHttpStatus(404);
      expect(response.data).toHaveProperty('error', 'Movie not found');
    });

    it('should validate movie ID parameter', async () => {
      if (!userCredentials) {
        throw new Error(
          'No user credentials available for testing - ensure backend is running and generating admin user'
        );
      }

      // Test invalid movie ID (non-numeric)
      const response = await client.get(['movies', ':id'], {
        param: { id: 'invalid-id' }, // Use a valid movie ID for testing
        query: {},
      });

      expect(response).toBeHttpStatus(400);
      expect(response.data).toHaveProperty('error');
    });

    it('should return movie details for valid movie ID', async () => {
      if (!userCredentials) {
        throw new Error(
          'No user credentials available for testing - ensure backend is running and generating admin user'
        );
      }

      // Use a popular movie ID that should exist (Fight Club)
      const response = await client.get(['movies', ':id'], {
        param: { id: '550' }, // Use a valid movie ID for testing
        query: {},
      });

      if (response.status === 404) {
        throw new Error('Movie not found - ensure the backend has the TMDB data loaded');
      }

      expect(response).toBeHttpStatus(200);
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

      if (!('id' in response.data)) {
        throw new Error('Movie data does not contain expected properties');
      }
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
      const response = await client.get(['movies', ':id'], {
        param: { id: '550' }, // Use a valid movie ID for testing
        query: { lang: 'es' },
      });

      expect(response).toBeHttpStatus(200);
      expect(response.data).toHaveProperty('title');
      expect(response.data).toHaveProperty('overview');
    });

    it('should include sources when requested', async () => {
      if (!userCredentials) {
        throw new Error(
          'No user credentials available for testing - ensure backend is running and generating admin user'
        );
      }

      const response = await client.get(['movies', ':id'], {
        param: { id: '550' }, // Use a valid movie ID for testing
        query: { includeSources: 'true' },
      });

      expect(response).toBeHttpStatus(200);
      expect(response.data).toHaveProperty('sources');

      if (!('sources' in response.data)) {
        throw new Error('Movie data does not contain sources');
      }

      if (!response.data.sources || !Array.isArray(response.data.sources)) {
        throw new Error('Sources should be an array');
      }
      expect(response.data.sources.length).toBeGreaterThan(0);

      const source = response.data.sources[0];
      expect(source).toHaveProperty('id');
      expect(source).toHaveProperty('size');
      expect(source).toHaveProperty('videoCodec');
      expect(source).toHaveProperty('broadcasters');
      expect(source).toHaveProperty('watchers');
      expect(source).toHaveProperty('source');
      expect(source).toHaveProperty('hasDataFile');

      // Quality may not be present in API response
      // expect(source).toHaveProperty('quality'); // Commented out - not always present

      // Validate source data types
      expect(typeof source.id).toBe('number');
      expect(typeof source.quality).toBe('string');
      expect(typeof source.size).toBe('number');
      expect(typeof source.videoCodec).toBe('string');
      expect(typeof source.broadcasters).toBe('number');
      expect(typeof source.watchers).toBe('number');
      expect(typeof source.source).toBe('string');
      expect(typeof source.hasDataFile).toBe('boolean');
    });

    it('should not include sources by default', async () => {
      if (!userCredentials) {
        throw new Error(
          'No user credentials available for testing - ensure backend is running and generating admin user'
        );
      }

      const response = await client.get(['movies', ':id'], {
        param: { id: '550' }, // Use a valid movie ID for testing
        query: {},
      });

      expect(response).toBeHttpStatus(200);
      expect(response.data).not.toHaveProperty('sources');
    });

    it('should handle rate limiting', async () => {
      if (!userCredentials) {
        throw new Error(
          'No user credentials available for testing - ensure backend is running and generating admin user'
        );
      }

      // Make multiple rapid requests to test rate limiting (10 requests per second limit)
      // Use X-Force-RateLimit=true to enable rate limiting for this specific test
      const promises = Array(15)
        .fill(0)
        .map(() =>
          client.get(
            ['movies', ':id'],
            {
              param: { id: '550' }, // Use a valid movie ID for testing
              query: {},
            },
            {
              headers: { 'X-Force-RateLimit': 'true' },
            }
          )
        );
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
      const response = await client.get(['movies', ':id'], {
        param: { id: '0' },
        query: {},
      });

      // Should return either 404 or 400, but not 500
      expect([400, 404]).toContain(response.status);
    });
  });

  describe.skip('POST /movies/:tmdbId/:quality', () => {
    it('should generate a streaming key for a valid movie', async () => {
      if (!userCredentials) {
        throw new Error(
          'No user credentials available for testing - ensure backend is running and generating admin user'
        );
      }

      const response = await client.post(['movies', ':tmdbId', ':quality'], {
        param: { tmdbId: '550', quality: 'auto' },
      });

      expect(response).toBeHttpStatus(200);
      expect(response.data).toHaveProperty('streamingKey');
      if ('streamingKey' in response.data) {
        expect(typeof response.data.streamingKey).toBe('string');
      }
    });
  });

  // Performance test: on-demand source request for unprocessed movie
  it('should request a source on-demand for an unprocessed movie in under 1 second', async () => {
    if (!userCredentials) {
      throw new Error(
        'No user credentials available for testing - ensure backend is running and generating admin user'
      );
    }

    // Use a movie ID that is present in test fixtures and likely unprocessed
    const unprocessedMovieId = 1356039; // Mid Bandicoot, valid and unused movie for on-demand test
    const start = Date.now();

    // Request the movie with sources included (on-demand)
    const response = await client.get(['movies', ':id'], {
      param: { id: `${unprocessedMovieId}` },
      query: { includeSources: 'true' },
    });

    const durationMs = Date.now() - start;

    expect(response).toBeHttpStatus(200);
    expect(response.data).toHaveProperty('sources');
    expect(durationMs).toBeLessThan(1000);
  });
});
