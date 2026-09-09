import { MockCache } from '@__test-utils__/cache.mock';

import { ConfigurationService } from '@services/configuration/configuration.service';
import { RequestService } from '@services/request/request.service';
import { StatsService } from '@services/stats/stats.service';
import { StorageService } from '@services/storage/storage.service';

jest.mock('@services/download/download.service');
jest.mock('@services/storage/storage.service');
jest.mock('@database/database');
jest.mock('@services/configuration/configuration.service');

import { Database } from '@database/database';
import { ApiError } from '@errors/api.errors';
import { DownloadService } from '@services/download/download.service';

import { ContentDirectoryService } from './content-directory.service';

const imdbId = 'tt29623480'; // Same IMDb ID from the YTSApi tests

describe('ContentDirectoryService', () => {
  const setupTest = () => {
    const mockCache = new MockCache();
    const mockConfigService =
      new ConfigurationService() as unknown as jest.Mocked<ConfigurationService>;
    mockConfigService.get.mockReturnValue(undefined as never);
    mockConfigService.getOrThrow.mockImplementation((key: string) => {
      if (key === 'YTS_API_URL') return 'https://yts.mx' as never;
      if (key === 'THE_RARBG_API_URL') return 'https://therarbg.to' as never;
      throw new Error(`${key} is not set`);
    });

    // Create a mock StorageService
    const mockStorageService = new StorageService(
      new Database({} as never),
      mockConfigService
    ) as jest.Mocked<StorageService>;

    const statsService = new StatsService();
    // Use real RequestService - HTTP-VCR will intercept fetch calls ( already recorded calls will not go out to the real API )
    const requestService = new RequestService(statsService, mockConfigService);

    // Create a mock DownloadService
    const mockDownloadService = new DownloadService(
      mockStorageService,
      requestService,
      mockConfigService
    ) as jest.Mocked<DownloadService>;
    mockDownloadService.generateLink.mockReturnValue('magnet:?xt=urn:btih:test');

    const service = new ContentDirectoryService(
      mockCache,
      mockDownloadService,
      requestService,
      statsService,
      mockConfigService
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

    it('should continue to later providers when one provider is unavailable', async () => {
      const { service } = setupTest();
      const expectedResult = {
        sources: [{ hash: 'fallback-source' }],
        trailerCode: '',
      };
      const unavailableDirectory = {
        name: 'Unavailable',
        getMovie: jest
          .fn()
          .mockRejectedValue(new ApiError('Unavailable', 'service_unavailable', 'test')),
      };
      const fallbackDirectory = {
        name: 'Fallback',
        getMovie: jest.fn().mockResolvedValue(expectedResult),
      };
      (
        service as unknown as {
          movieDirectories: Array<{ name: string; getMovie: jest.Mock }>;
        }
      ).movieDirectories = [unavailableDirectory, fallbackDirectory];

      const result = await service.searchSourcesForMovie(imdbId);

      expect(result).toEqual({ ...expectedResult, source: 'Fallback' });
      expect(fallbackDirectory.getMovie).toHaveBeenCalledTimes(1);
    });
  });
});
