import { MockCache } from '@__test-utils__/cache.mock';

import { RequestService } from '@services/request/request.service';
import type { StorageService } from '@services/storage/storage.service';

jest.mock('@services/download/download.service');
jest.mock('@services/storage/storage.service');

import { DownloadService } from '@services/download/download.service';

import { ContentDirectoryService } from './content-directory.service';

const imdbId = 'tt29623480'; // Same IMDb ID from the YTSApi tests

describe('ContentDirectoryService', () => {
  let service: ContentDirectoryService;
  let requestService: RequestService;

  beforeEach(() => {
    // Create a minimal mock cache with just the required methods
    const mockCache = new MockCache();

    // Create a mock StorageService
    const mockStorageService = {
      createStorage: jest.fn(),
      updateDownloadProgress: jest.fn(),
      markAsAccessed: jest.fn(),
      getStorageByMovieSource: jest.fn(),
      removeStorage: jest.fn(),
    } as unknown as jest.Mocked<StorageService>;

    // Use real RequestService - HTTP-VCR will intercept fetch calls
    requestService = new RequestService();

    // Create a mock DownloadService
    const mockDownloadService = new DownloadService(
      mockStorageService,
      requestService
    ) as jest.Mocked<DownloadService>;
    mockDownloadService.generateLink.mockReturnValue('magnet:?xt=urn:btih:test');

    service = new ContentDirectoryService(mockCache, mockDownloadService, requestService);
  });

  describe('searchSourcesForMovie', () => {
    it('should return movie data with sources for valid IMDb ID', async () => {
      const result = await service.searchSourcesForMovie(imdbId);

      expect(result).not.toBeNull();

      if (result) {
        expect(Array.isArray(result.sources)).toBe(true);
        expect(result.sources.length).toBeGreaterThan(0);
        expect(typeof result.trailerCode).toBe('string');

        // Check source structure
        const source = result.sources[0];
        expect(source.quality).toBeDefined();
        expect(source.videoCodec).toBeDefined();
        expect(source.size).toBeDefined();
        expect(source.magnetLink.startsWith('magnet:?xt=urn:btih:')).toBe(true);
        expect(source.hash).toBeDefined();
        expect(source.broadcasters).toBeDefined();
        expect(source.watchers).toBeDefined();
      }
    });

    it('should return null for invalid IMDb ID', async () => {
      const result = await service.searchSourcesForMovie('invalid-id');
      expect(result).toBeNull();
    });
  });
});
