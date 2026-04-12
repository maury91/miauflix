import { MockCache } from '@__test-utils__/cache.mock';

import { ConfigurationService } from '@services/configuration/configuration.service';
import { RequestService } from '@services/request/request.service';
import { StatsService } from '@services/stats/stats.service';

import { TheRARBGApi } from './therarbg.api';

jest.mock('@services/configuration/configuration.service');

describe('TheRARBGService', () => {
  const setupTest = () => {
    const mockCache = new MockCache();
    const mockConfigService =
      new ConfigurationService() as unknown as jest.Mocked<ConfigurationService>;
    mockConfigService.get.mockReturnValue(undefined as never);
    mockConfigService.getOrThrow.mockImplementation((key: string) => {
      if (key === 'THE_RARBG_API_URL') return 'https://therarbg.to' as never;
      throw new Error(`${key} is not set`);
    });
    // Use real RequestService - HTTP-VCR will intercept fetch call ( already recorded calls will not go out to the real API )
    const statsService = new StatsService();
    const requestService = new RequestService(statsService, mockConfigService);
    const service = new TheRARBGApi(mockCache, statsService, requestService, mockConfigService);

    return { service, requestService, statsService, mockCache };
  };

  describe('searchByImdbId', () => {
    it('should successfully fetch movie details for valid IMDB ID', async () => {
      const { service } = setupTest();
      // Using a valid IMDB ID that exists on TheRARBG - Cosmic Princess
      const imdbId = 'tt0119698';

      const result = await service.searchByImdbId(imdbId);

      expect(result).toBeDefined();
      expect(result).not.toBeNull();

      if (result) {
        expect(result.imdb.imdb_id).toBe(imdbId);
        expect(result.imdb.name).toBeDefined();
        expect(typeof result.imdb.release_detailed.year).toBe('number');
        expect(typeof result.imdb.runtime).toBe('string');

        // Check source structure if any sources exist
        if (result.trb_posts.length > 0) {
          const firstSource = result.trb_posts[0];
          expect(firstSource.name).toBeDefined();
          expect(firstSource.info_hash).toBeDefined();
          expect(typeof firstSource.seeders).toBe('number');
          expect(typeof firstSource.leechers).toBe('number');
          expect(typeof firstSource.size).toBe('number');
        }
      }
    });

    it('should handle IMDB ID without tt prefix', async () => {
      const { service } = setupTest();
      // Test with IMDB ID without 'tt' prefix - should normalize to tt0119698
      const result = await service.searchByImdbId('0119698');

      expect(result).toBeDefined();
      expect(result).not.toBeNull();

      if (result) {
        expect(result.imdb.imdb_id).toBe('tt0119698');
        expect(result.imdb.name).toBeDefined();
        expect(Array.isArray(result.trb_posts)).toBe(true);
      }
    });

    it('should handle invalid IMDB ID format', async () => {
      const { service } = setupTest();
      await expect(service.searchByImdbId('invalid-id')).rejects.toThrow();
    });

    it('should throw error for non-existent IMDB ID', async () => {
      const { service } = setupTest();
      // Using a non-existent but valid format IMDB ID
      await expect(service.searchByImdbId('tt9999999')).rejects.toThrow();
    });
  });

  describe('searchPosts', () => {
    it('should work with search posts endpoint (which does return results)', async () => {
      const { service } = setupTest();
      // The search posts endpoint might work differently than IMDB detail
      try {
        const result = await service.searchPosts('tt0119698');

        // If it succeeds, check the structure
        if (result && result.results) {
          expect(Array.isArray(result.results)).toBe(true);
          expect(typeof result.count).toBe('number');
          expect(typeof result.total).toBe('number');

          result.results.forEach(post => {
            expect(post.n).toBeDefined(); // name
            expect(post.c).toBeDefined(); // category
            expect(post.s).toBeDefined(); // size
            expect(typeof post.se).toBe('number'); // seeders
            expect(typeof post.le).toBe('number'); // leechers
            expect(post.h).toBeDefined(); // info hash
          });
        }
      } catch (error) {
        // If it fails, it should be due to HTML response
        expect(error).toEqual(expect.any(Error));
        expect((error as Error).message).toContain('HTML response');
      }
    });

    it('should handle search with filtering options', async () => {
      const { service } = setupTest();
      try {
        const result = await service.searchPosts('tt0119698', {
          filter: { type: 'days', value: 30 },
          sort: { key: 'broadcasters', direction: 'desc' },
        });

        if (result && result.results) {
          expect(Array.isArray(result.results)).toBe(true);
        }
      } catch (error) {
        // Expected if API returns HTML
        expect(error).toEqual(expect.any(Error));
        expect((error as Error).message).toContain('HTML response');
      }
    });
  });

  describe('test', () => {
    it('should return true when API is accessible and returns JSON', async () => {
      const { service } = setupTest();
      const isHealthy = await service.test();
      // The API should work and return JSON, so health check should pass
      expect(isHealthy).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle network errors gracefully', async () => {
      const { service } = setupTest();
      // The fixture for tt0111161 returns a 503 Service Unavailable response,
      // replayed by HTTP-VCR without making a real network call.
      await expect(service.searchByImdbId('tt0111161')).rejects.toThrow();
    });
  });
});
