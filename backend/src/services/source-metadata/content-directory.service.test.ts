import { MockCache } from '@__test-utils__/cache.mock';

jest.mock('@services/download/download.service');

import { DownloadService } from '@services/download/download.service';

import { ContentDirectoryService } from './content-directory.service';

const imdbId = 'tt29623480'; // Same IMDb ID from the YTSApi tests

describe('ContentDirectoryService', () => {
  let service: ContentDirectoryService;

  beforeEach(() => {
    // Create a minimal mock cache with just the required methods
    const mockCache = new MockCache();

    // Create a mock DownloadService
    const mockDownloadService = new DownloadService() as jest.Mocked<DownloadService>;
    mockDownloadService.generateLink.mockReturnValue('magnet:?xt=urn:btih:test');

    service = new ContentDirectoryService(mockCache, mockDownloadService);
  });

  describe('searchTorrentsForMovie', () => {
    it('should return movie data with sources for valid IMDb ID', async () => {
      const result = await service.searchTorrentsForMovie(imdbId);

      expect(result).not.toBeNull();

      if (result) {
        expect(Array.isArray(result.sources)).toBe(true);
        expect(result.sources.length).toBeGreaterThan(0);
        expect(typeof result.trailerCode).toBe('string');

        // Check source structure
        const source = result.sources[0];
        expect(source.quality).toBeDefined();
        expect(source.resolution).toBeDefined();
        expect(source.videoCodec).toBeDefined();
        expect(source.size).toBeDefined();
        expect(source.magnetLink.startsWith('magnet:?xt=urn:btih:')).toBe(true);
        expect(source.hash).toBeDefined();
        expect(source.broadcasters).toBeDefined();
        expect(source.watchers).toBeDefined();
      }
    });

    it('should return null for invalid IMDb ID', async () => {
      const result = await service.searchTorrentsForMovie('invalid-id');
      expect(result).toBeNull();
    });
  });
});
