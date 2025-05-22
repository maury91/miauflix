import { MockCache } from '@__test-utils__/cache.mock';

import { TrackerService } from './tracker.service';

const imdbId = 'tt29623480'; // Same IMDb ID from the YTSApi tests

describe('TrackerService', () => {
  let service: TrackerService;

  beforeEach(() => {
    // Create a minimal mock cache with just the required methods
    const mockCache = new MockCache();

    service = new TrackerService(mockCache);
  });

  describe('searchTorrentsForMovie', () => {
    it('should return movie data with torrents for valid IMDb ID', async () => {
      const result = await service.searchTorrentsForMovie(imdbId);

      expect(result).not.toBeNull();

      if (result) {
        expect(result.imdbCode).toBe(imdbId);
        expect(typeof result.title).toBe('string');
        expect(Array.isArray(result.torrents)).toBe(true);
        expect(result.torrents.length).toBeGreaterThan(0);

        // Check torrent structure
        const torrent = result.torrents[0];
        expect(torrent.quality).toBeDefined();
        expect(torrent.resolution).toBeDefined();
        expect(torrent.videoCodec).toBeDefined();
        expect(torrent.size).toBeDefined();
        expect(torrent.magnetLink.startsWith('magnet:?xt=urn:btih:')).toBe(true);
      }
    });

    it('should return null for invalid IMDb ID', async () => {
      const result = await service.searchTorrentsForMovie('invalid-id');
      expect(result).toBeNull();
    });
  });
});
