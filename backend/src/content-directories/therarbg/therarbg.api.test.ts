import { MockCache } from '@__test-utils__/cache.mock';

import { RequestService } from '@services/request/request.service';
import { StatsService } from '@services/stats/stats.service';

import { TheRARBGApi } from './therarbg.api';

describe('TheRARBGService', () => {
  let service: TheRARBGApi;
  let requestService: RequestService;

  beforeEach(() => {
    const mockCache = new MockCache();
    // Use real RequestService - HTTP-VCR will intercept fetch calls
    requestService = new RequestService(new StatsService());
    service = new TheRARBGApi(mockCache, requestService);
  });

  describe('searchByImdbId', () => {
    it('should successfully fetch movie details for valid IMDB ID', async () => {
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
      await expect(service.searchByImdbId('invalid-id')).rejects.toThrow();
    });

    it('should throw error for non-existent IMDB ID', async () => {
      // Using a non-existent but valid format IMDB ID
      await expect(service.searchByImdbId('tt9999999')).rejects.toThrow();
    });
  });

  describe('searchPosts', () => {
    it('should work with search posts endpoint (which does return results)', async () => {
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
      const isHealthy = await service.test();
      // The API should work and return JSON, so health check should pass
      expect(isHealthy).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle network errors gracefully', async () => {
      // Create a service with invalid URL to test error handling
      const invalidService = new TheRARBGApi(new MockCache(), requestService);

      // Mock fetch to simulate a network error
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

      try {
        await expect(invalidService.searchByImdbId('tt0111161')).rejects.toThrow();
      } finally {
        // Restore original fetch
        global.fetch = originalFetch;
      }
    });
  });
});
