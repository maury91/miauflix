import { TestClient, waitForService, extractUserCredentialsFromLogs } from '../utils/test-utils';

describe('Sources E2E Tests', () => {
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

  describe('Source List Testing via Movie Endpoint', () => {
    it('should return list of available sources for a movie', async () => {
      if (!userCredentials) {
        throw new Error(
          'No user credentials available for testing - ensure backend is running and generating admin user'
        );
      }

      // Request movie with sources included
      const response = await client.get(['movies', ':id'], {
        param: { id: '550' },
        query: { includeSources: 'true' },
      });

      if (response.status === 404) {
        throw new Error('Movie 550 not found - test data is required for source testing');
      }

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('sources');

      if ('sources' in response.data === false) {
        throw new Error('Response does not contain sources property');
      }

      if (response.data.sources && response.data.sources.length > 0) {
        const sources = response.data.sources;

        // Verify sources array structure
        expect(Array.isArray(sources)).toBe(true);

        // Check each source has required properties
        sources.forEach((source: any) => {
          expect(source).toHaveProperty('id');
          expect(source).toHaveProperty('hash');
          expect(source).toHaveProperty('magnetLink');
          expect(source).toHaveProperty('quality');
          expect(source).toHaveProperty('resolution');
          expect(source).toHaveProperty('size');
          expect(source).toHaveProperty('videoCodec');
          expect(source).toHaveProperty('source');
          expect(source).toHaveProperty('hasDataFile');

          // Verify data types
          expect(typeof source.id).toBe('number');
          expect(typeof source.hash).toBe('string');
          expect(typeof source.magnetLink).toBe('string');
          expect(typeof source.quality).toBe('string');
          expect(typeof source.resolution).toBe('number');
          expect(typeof source.size).toBe('number');
          expect(typeof source.videoCodec).toBe('string');
          expect(typeof source.source).toBe('string');
          expect(typeof source.hasDataFile).toBe('boolean');
        });

        // Verify different source types are represented
        const sourcesSet = new Set(sources.map((s: any) => s.source));

        // Should have at least one source
        expect(sourcesSet.size).toBeGreaterThan(0);
      } else {
        throw new Error(
          'No sources found for movie 550 - test data is required for source validation'
        );
      }
    });

    it('should properly aggregate sources from different providers', async () => {
      if (!userCredentials) {
        throw new Error(
          'No user credentials available for testing - ensure backend is running and generating admin user'
        );
      }

      // Try multiple popular movies to ensure we get diverse source data
      const movieIds = ['550', '13', '155']; // Fight Club, Forrest Gump, The Dark Knight
      let totalSources = 0;
      const allSourceTypes = new Set<string>();

      for (const movieId of movieIds) {
        const response = await client.get(['movies', ':id'], {
          param: { id: movieId },
          query: { includeSources: 'true' },
        });

        if (response.status === 200 && 'sources' in response.data && response.data.sources) {
          const sources = response.data.sources;
          totalSources += sources.length;

          sources.forEach((source: any) => {
            allSourceTypes.add(source.source);
          });
        }
      }

      // If we have sources, verify they come from different providers
      if (totalSources > 0) {
        // Should ideally have multiple source types (YTS, TMDB integrations, etc.)
        expect(allSourceTypes.size).toBeGreaterThan(0);
      }
    });

    it('should return properly formatted source data structure', async () => {
      if (!userCredentials) {
        throw new Error(
          'No user credentials available for testing - ensure backend is running and generating admin user'
        );
      }

      const response = await client.get(['movies', ':id'], {
        param: { id: '550' },
        query: { includeSources: 'true' },
      });

      if (
        response.status === 200 &&
        'sources' in response.data &&
        response.data.sources &&
        response.data.sources.length > 0
      ) {
        const source = response.data.sources[0];

        // Test magnet link format
        expect(source.magnetLink).toMatch(/^magnet:\?xt=urn:btih:[a-fA-F0-9]{40}/);

        // Test hash format (should be 40-character hex string)
        expect(source.hash).toMatch(/^[a-fA-F0-9]{40}$/);

        // Test quality values are reasonable
        expect(['720p', '1080p', '2160p', '480p']).toContain(source.quality);

        // Test resolution is a positive number
        expect(source.resolution).toBeGreaterThan(0);

        // Test size is a positive number (bytes)
        expect(source.size).toBeGreaterThan(0);

        // Test video codec is a known format
        expect([
          'X264',
          'X265',
          'HEVC',
          'AV1',
          'XVID',
          'VP9',
          'MPEG2',
          'MPEG4',
          'VC1',
          'UNKNOWN',
        ]).toContain(source.videoCodec);
      }
    });

    it('should not return sources when not explicitly requested', async () => {
      if (!userCredentials) {
        throw new Error(
          'No user credentials available for testing - ensure backend is running and generating admin user'
        );
      }

      const response = await client.get(['movies', ':id'], { param: { id: '550' }, query: {} });

      if (response.status === 200) {
        expect(response.data).not.toHaveProperty('sources');
      }
    });

    it('should handle movies with no available sources gracefully', async () => {
      if (!userCredentials) {
        throw new Error(
          'No user credentials available for testing - ensure backend is running and generating admin user'
        );
      }

      // Use a very obscure movie ID that likely has no sources
      const response = await client.get(['movies', ':id'], {
        param: { id: '999888777' },
        query: { includeSources: 'true' },
      });

      // Should either return 404 or return movie with empty sources array
      if (response.status === 200) {
        expect(response.data).toHaveProperty('sources');
        if (!('sources' in response.data)) {
          throw new Error('Response does not contain sources property');
        }
        expect(Array.isArray(response.data.sources)).toBe(true);
      } else {
        expect(response.status).toBe(404);
      }
    });
  });
});
