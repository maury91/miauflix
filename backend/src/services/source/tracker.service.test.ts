import { beforeEach, describe, expect, it } from 'bun:test';

import { TrackerService } from './tracker.service';

const imdbId = 'tt29623480'; // Same IMDb ID from the YTSApi tests

describe('TrackerService', () => {
  let service: TrackerService;

  beforeEach(() => {
    service = new TrackerService();
  });

  describe('searchTorrentsForMovie', () => {
    it('should return movie data with torrents for valid IMDb ID', async () => {
      const result = await service.searchTorrentsForMovie(imdbId);

      expect(result).not.toBeNull();

      if (result) {
        expect(result.imdbCode).toBe(imdbId);
        expect(result.title).toBeString();
        expect(result.torrents).toBeArray();
        expect(result.torrents.length).toBeGreaterThan(0);

        // Check torrent structure
        const torrent = result.torrents[0];
        expect(torrent.quality).toBeDefined();
        expect(torrent.resolution).toBeDefined();
        expect(torrent.videoCodec).toBeDefined();
        expect(torrent.size).toBeDefined();
        expect(torrent.magnetLink).toStartWith('magnet:?xt=urn:btih:');
      }
    });

    it('should return null for invalid IMDb ID', async () => {
      const result = await service.searchTorrentsForMovie('invalid-id');
      expect(result).toBeNull();
    });
  });
});
