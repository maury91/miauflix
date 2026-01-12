import { MockCache } from '@__test-utils__/cache.mock';

import { RequestService } from '@services/request/request.service';
import { StatsService } from '@services/stats/stats.service';
import { StorageService } from '@services/storage/storage.service';

jest.mock('@services/download/download.service');
jest.mock('@services/storage/storage.service');

import type { Database } from '@database/database';
import { DownloadService } from '@services/download/download.service';

import { ContentDirectoryService } from './content-directory.service';

const imdbId = 'tt29623480'; // Same IMDb ID from the YTSApi tests

describe('ContentDirectoryService', () => {
  const setupTest = () => {
    const mockCache = new MockCache();

    // Create a mock StorageService
    const mockStorageService = new StorageService({} as Database) as jest.Mocked<StorageService>;

    const statsService = new StatsService();
    // Use real RequestService - HTTP-VCR will intercept fetch calls ( already recorded calls will not go out to the real API )
    const requestService = new RequestService(statsService);

    // Create a mock DownloadService
    const mockDownloadService = new DownloadService(
      mockStorageService,
      requestService
    ) as jest.Mocked<DownloadService>;
    mockDownloadService.generateLink.mockReturnValue('magnet:?xt=urn:btih:test');

    const service = new ContentDirectoryService(
      mockCache,
      mockDownloadService,
      requestService,
      statsService
    );

    return {
      service,
      requestService,
      statsService,
      mockCache,
      mockStorageService,
      mockDownloadService,
    };
  };

  describe('searchSourcesForMovie', () => {
    it('should return movie data with sources for valid IMDb ID', async () => {
      const { service } = setupTest();
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
      const { service } = setupTest();
      const result = await service.searchSourcesForMovie('invalid-id');
      expect(result).toBeNull();
    });
  });
});
