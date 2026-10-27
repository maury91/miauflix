// Mock the dependencies
jest.mock('@database/database');
jest.mock('@repositories/movie.repository');
jest.mock('@repositories/content-source.repository');
jest.mock('@services/source/source-metadata-file.service');
jest.mock('@services/security/vpn.service');
jest.mock('@services/download/download.service');
jest.mock('@services/source-metadata/content-directory.service');
jest.mock('@services/storage/storage.service');
jest.mock('@services/configuration/configuration.service');
jest.mock('@logger');

import {
  createMockContentSource,
  createMockMovie,
  createMockSourceMetadata,
} from '@__test-utils__/mocks/movie.mock';
import { configureFakerSeed, delayedResult } from '@__test-utils__/utils';
import { logger as mockLogger } from '@logger';
import { Quality, Source } from '@miauflix/source-metadata-extractor';
import type { UpdateResult } from 'typeorm';

import { Database } from '@database/database';
import type { ContentSource } from '@entities/content-source.entity';
import { ContentSourceRepository } from '@repositories/content-source.repository';
import { MovieRepository } from '@repositories/movie.repository';
import { ConfigurationService } from '@services/configuration/configuration.service';
import { DownloadService } from '@services/download/download.service';
import type { RequestService } from '@services/request/request.service';
import { VpnDetectionService } from '@services/security/vpn.service';
import { ErrorWithStatus } from '@services/source/services/error-with-status.util';
import { SourceService } from '@services/source/source.service';
import { SourceMetadataFileService } from '@services/source/source-metadata-file.service';
import { ContentDirectoryService } from '@services/source-metadata/content-directory.service';
import { StatsService } from '@services/stats/stats.service';
import { StorageService } from '@services/storage/storage.service';

describe('SourceService', () => {
  // Helper functions to reduce duplication
  const createServiceWithDisconnectedVpn = () => {
    const {
      mockVpnService,
      mockDatabase,
      mockContentDirectoryService,
      mockSourceMetadataFileService,
      mockRequestService,
      mockConfigService,
      ...rest
    } = setupTest();
    jest.clearAllMocks();
    mockVpnService.isVpnActive.mockResolvedValueOnce(false);
    return {
      ...rest,
      mockVpnService,
      mockDatabase,
      mockContentDirectoryService,
      mockSourceMetadataFileService,
      mockRequestService,
      mockConfigService,
      service: new SourceService(
        mockDatabase,
        mockVpnService,
        mockContentDirectoryService,
        mockSourceMetadataFileService,
        mockRequestService,
        mockConfigService
      ),
    };
  };

  const createMockSourceForStats = (overrides: Partial<ContentSource> = {}): ContentSource => {
    return createMockContentSource({
      file: Buffer.from('mock file'),
      lastStatsCheck: new Date(Date.now() - 7 * 60 * 60 * 1000),
      nextStatsCheckAt: new Date(Date.now() - 1000),
      ...overrides,
    });
  };

  const setupTest = () => {
    const mockMovie = createMockMovie();

    // Generate movie sources that reference the first movie
    const mockContentSource1 = createMockContentSource({
      quality: Quality.FHD,
    });

    const mockContentSource2 = createMockContentSource({
      quality: Quality.HD,
    });

    // Generate source metadata that matches the movie sources
    const mockSource1 = createMockSourceMetadata({
      hash: mockContentSource1.hash,
    });

    const mockSource2 = createMockSourceMetadata({
      hash: mockContentSource2.hash,
      quality: Quality.HD,
      source: Source.BLURAY,
    });

    // Mock repositories
    const mockMovieRepository = new MovieRepository({} as never) as jest.Mocked<MovieRepository>;
    const mockContentSourceRepository = new ContentSourceRepository(
      {} as never
    ) as jest.Mocked<ContentSourceRepository>;
    const mockDatabase = new Database({} as never) as jest.Mocked<Database>;
    const mockConfigService =
      new ConfigurationService() as unknown as jest.Mocked<ConfigurationService>;
    mockConfigService.get.mockReturnValue(undefined as never);
    mockConfigService.getOrThrow.mockImplementation((key: string) => {
      if (key === 'DISABLE_VPN_CHECK') return false as never;
      throw new Error(`${key} is not set`);
    });

    // Mock services
    const mockStorageService = new StorageService(
      {} as Database,
      mockConfigService
    ) as jest.Mocked<StorageService>;

    const mockRequestService = {
      request: jest.fn(),
    } as unknown as jest.Mocked<RequestService>;

    const mockDownloadService = new DownloadService(
      mockStorageService,
      mockRequestService,
      mockConfigService
    ) as jest.Mocked<DownloadService>;
    const statsService = new StatsService();
    const mockContentDirectoryService = new ContentDirectoryService(
      {} as never,
      mockDownloadService,
      mockRequestService,
      statsService,
      mockConfigService
    ) as jest.Mocked<ContentDirectoryService>;
    const mockSourceMetadataFileService = new SourceMetadataFileService(
      mockDownloadService,
      mockRequestService,
      statsService,
      mockConfigService
    ) as jest.Mocked<SourceMetadataFileService>;
    const mockVpnService = new VpnDetectionService(
      mockConfigService
    ) as jest.Mocked<VpnDetectionService>;

    // Setup repository mocks
    mockMovieRepository.findMoviesPendingSourceSearch.mockResolvedValue([mockMovie]);
    mockMovieRepository.markSourceSearched.mockResolvedValue(undefined);
    mockMovieRepository.updateMovieTrailerIfDoesntExists.mockResolvedValue(undefined);
    mockMovieRepository.findMoviesByIdsWithImdb.mockResolvedValue([]);

    mockContentSourceRepository.upsertForMovie.mockResolvedValue([
      mockContentSource1,
      mockContentSource2,
    ]);
    mockContentSourceRepository.findByMovieId.mockResolvedValue([
      mockContentSource1,
      mockContentSource2,
    ]);
    mockContentSourceRepository.findSourceThatNeedsStatsUpdate.mockResolvedValue([]);
    mockContentSourceRepository.updateStats.mockResolvedValue(undefined);
    mockContentSourceRepository.getNextSourcesToProcess.mockResolvedValue([]);
    mockContentSourceRepository.updateSourceFile.mockResolvedValue({} as UpdateResult);
    mockContentSourceRepository.updateSourceMetadata.mockResolvedValue({} as UpdateResult);

    // Setup service mocks
    mockDownloadService.generateLink.mockReturnValue(`magnet:?xt=urn:btih:${mockSource1.hash}`);

    mockContentDirectoryService.searchSourcesForMovie.mockResolvedValue({
      sources: [mockSource1, mockSource2],
      source: 'YTS',
      trailerCode: 'abcd1234',
    });

    mockVpnService.isVpnActive.mockResolvedValue(true);
    mockVpnService.on.mockReturnValue(jest.fn());
    mockVpnService.status.mockReturnValue({ isVpnActive: true, disabled: false });

    mockSourceMetadataFileService.getSourceMetadataFile.mockResolvedValue(
      Buffer.from('mock source metadata file')
    );
    mockSourceMetadataFileService.getServiceStatistics.mockReturnValue({});
    mockSourceMetadataFileService.getStats.mockResolvedValue({ broadcasters: 100, watchers: 10 });
    mockSourceMetadataFileService.getAvailableConcurrency.mockReturnValue(2);
    mockSourceMetadataFileService.isIdle.mockReturnValue(true);

    mockDatabase.getMovieRepository.mockReturnValue(mockMovieRepository);
    mockDatabase.getContentSourceRepository.mockReturnValue(mockContentSourceRepository);
    Object.assign(mockDatabase, {
      getEpisodeSourceRepository: jest.fn().mockReturnValue({
        findByEpisodeId: jest.fn().mockResolvedValue([]),
      }),
    });

    // Create service instance
    const service = new SourceService(
      mockDatabase,
      mockVpnService,
      mockContentDirectoryService,
      mockSourceMetadataFileService,
      mockRequestService,
      mockConfigService
    );

    return {
      service,
      mockContentSource1,
      mockContentSource2,
      mockSource1,
      mockSource2,
      mockMovie,
      mockVpnService,
      mockRequestService,
      mockDatabase,
      mockMovieRepository,
      mockContentSourceRepository,
      mockDownloadService,
      mockContentDirectoryService,
      mockSourceMetadataFileService,
      mockConfigService,
    };
  };

  beforeAll(() => {
    // Set seed for reproducible tests
    configureFakerSeed();
  });

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('episode availability', () => {
    const now = Date.parse('2026-10-19T12:00:00Z');

    it.each([undefined, null, '', 'unknown', '2026-10-18', '2026-10-19T12:00:00Z'])(
      'allows available or unknown air dates: %s',
      airDate => {
        const { service } = setupTest();
        expect(service.isEpisodeWithinLeakTolerance(airDate, now)).toBe(true);
      }
    );

    it('allows the configured boundary but rejects dates beyond it', () => {
      const { service, mockConfigService } = setupTest();
      mockConfigService.get.mockReturnValue((2 * 24 * 60 * 60 * 1000) as never);
      expect(service.isEpisodeWithinLeakTolerance('2026-10-21T12:00:00Z', now)).toBe(true);
      expect(service.isEpisodeWithinLeakTolerance('2026-10-21T12:00:00.001Z', now)).toBe(false);
    });

    it('skips episode source lookup before the availability window', async () => {
      const { service, mockDatabase } = setupTest();
      const findByEpisodeId = mockDatabase.getEpisodeSourceRepository().findByEpisodeId;
      expect(
        await service.getSourcesForEpisodeWithOnDemandSearch({
          episodeId: 1,
          showImdbId: 'tt1234567',
          seasonNumber: 1,
          episodeNumber: 1,
          airDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        })
      ).toEqual([]);
      expect(findByEpisodeId).not.toHaveBeenCalled();
    });
  });

  describe('new episode notifications', () => {
    const setupEpisodeTest = (hasVideo: boolean | null) => {
      const mocks = setupTest();
      const association = {
        episodeId: 5,
        sourceId: 11,
        matchKind: 'single',
        source: { id: 11, hasVideo },
      };
      const episodeSources = {
        findByEpisodeId: jest.fn().mockResolvedValueOnce([]).mockResolvedValue([association]),
        associate: jest.fn(),
      };
      Object.assign(mocks.mockDatabase, {
        getEpisodeSourceRepository: jest.fn().mockReturnValue(episodeSources),
      });
      const notifications = { episodeAvailable: jest.fn() };
      const backgroundJobs = { bulkBestEffort: jest.fn(), enqueueBestEffort: jest.fn() };
      const service = new SourceService(
        mocks.mockDatabase,
        mocks.mockVpnService,
        mocks.mockContentDirectoryService,
        mocks.mockSourceMetadataFileService,
        mocks.mockRequestService,
        mocks.mockConfigService,
        backgroundJobs as never,
        notifications as never
      );
      jest.spyOn(service as never, 'checkForVpnConnection').mockResolvedValue(true as never);
      jest.spyOn(service as never, 'getTVReleases').mockResolvedValue([
        {
          metadata: { season: 1, episode: 8, files: ['Show.S01E08.mkv'] },
          source: { id: 11, hasVideo },
        },
      ] as never);
      const search = () =>
        service.getSourcesForEpisodeWithOnDemandSearch({
          episodeId: 5,
          showMediaId: 9001,
          showTitle: 'Example Show',
          showImdbId: 'tt1234567',
          seasonNumber: 1,
          episodeNumber: 8,
          airDate: '2020-01-01',
        });
      return { search, notifications, backgroundJobs };
    };

    it('announces an episode once a source matched to it is verified', async () => {
      const { search, notifications, backgroundJobs } = setupEpisodeTest(true);

      await search();

      expect(notifications.episodeAvailable).toHaveBeenCalledWith(
        expect.objectContaining({ showMediaId: 9001, seasonNumber: 1, episodeNumber: 8 })
      );
      expect(backgroundJobs.bulkBestEffort).not.toHaveBeenCalled();
    });

    it('waits for verification instead of announcing an unverified match', async () => {
      const { search, notifications, backgroundJobs } = setupEpisodeTest(null);

      await search();

      expect(notifications.episodeAvailable).not.toHaveBeenCalled();
      expect(backgroundJobs.bulkBestEffort).toHaveBeenCalledWith([
        expect.objectContaining({ type: 'source.verify', payload: { sourceId: 11 } }),
      ]);
    });

    it('never announces an episode whose only match is fake', async () => {
      const { search, notifications, backgroundJobs } = setupEpisodeTest(false);

      await search();

      expect(notifications.episodeAvailable).not.toHaveBeenCalled();
      expect(backgroundJobs.bulkBestEffort).not.toHaveBeenCalled();
    });
  });

  describe('searchSourcesForMovies', () => {
    it('should process movies without sources', async () => {
      const {
        service,
        mockMovie,
        mockMovieRepository,
        mockContentDirectoryService,
        mockContentSourceRepository,
      } = setupTest();

      mockContentDirectoryService.searchSourcesForMovie.mockImplementationOnce(async () => {
        throw new Error('Search failed');
      });
      await service.searchSourcesForMovies();

      // Process one single movie
      expect(mockMovieRepository.findMoviesPendingSourceSearch).toHaveBeenCalledTimes(1);
      expect(mockMovieRepository.findMoviesPendingSourceSearch).toHaveBeenCalledWith(1);
      // Search for sources for the movie
      expect(mockContentDirectoryService.searchSourcesForMovie).toHaveBeenCalledTimes(1);
      expect(mockContentDirectoryService.searchSourcesForMovie).toHaveBeenCalledWith(
        mockMovie.imdbId,
        false, // isOnDemand
        expect.anything(),
        true
      );
      // The search failed, so no sources were created
      expect(mockContentSourceRepository.upsertForMovie).not.toHaveBeenCalled();
      expect(mockMovieRepository.markSourceSearched).not.toHaveBeenCalled();
    });
  });

  describe('processSourceDiscovery', () => {
    it('does not reset provider state while the search backoff is active', async () => {
      const { service, mockMovie, mockMovieRepository, mockContentDirectoryService } = setupTest();
      mockMovieRepository.findById.mockResolvedValue({
        ...mockMovie,
        contentDirectoriesSearched: ['YTS', 'THERARBG'],
        nextSourceSearchAt: new Date(Date.now() + 60_000),
      });
      mockContentDirectoryService.getMovieDirectoryNames.mockReturnValue(['YTS', 'THERARBG']);

      await expect(service.processSourceDiscovery(mockMovie.id)).resolves.toEqual({
        complete: true,
        sourceCount: 0,
      });
      expect(mockMovieRepository.resetSourceSearchState).not.toHaveBeenCalled();
      expect(mockContentDirectoryService.searchSourcesForMovie).not.toHaveBeenCalled();
    });
  });

  describe('getSourcesForMovie', () => {
    it('should return sources for a movie', async () => {
      const {
        service,
        mockContentSource1,
        mockContentSource2,
        mockMovie,
        mockContentSourceRepository,
        mockContentDirectoryService,
      } = setupTest();

      const sources = await service.getSourcesForMovie(mockMovie.id);

      expect(mockContentSourceRepository.findByMovieId).toHaveBeenCalledWith(mockMovie.id);

      // findByMovieId returns two sources
      expect(sources).toHaveLength(2);
      expect(sources[0]).toEqual(mockContentSource1);
      expect(sources[1]).toEqual(mockContentSource2);

      // Because we have sources in the database, the search is not triggered
      expect(mockContentDirectoryService.searchSourcesForMovie).not.toHaveBeenCalled();
    });
  });

  describe('getSourcesForMovieWithOnDemandSearch', () => {
    describe('when movie has existing sources', () => {
      it('should return immediately without triggering API calls', async () => {
        const {
          service,
          mockContentSource1,
          mockContentSource2,
          mockMovie,
          mockContentSourceRepository,
          mockContentDirectoryService,
        } = setupTest();

        const sources = await service.getSourcesForMovieWithOnDemandSearch(mockMovie);

        expect(mockContentSourceRepository.findByMovieId).toHaveBeenCalledWith(mockMovie.id);
        // we mocked findByMovieId to return two sources
        expect(sources).toEqual([mockContentSource1, mockContentSource2]);

        // Similar to getSourcesForMovie, we don't trigger the search
        expect(mockContentDirectoryService.searchSourcesForMovie).not.toHaveBeenCalled();
      });
    });

    describe('when movie has no sources', () => {
      it('should trigger high priority search', async () => {
        const {
          service,
          mockMovie,
          mockSource1,
          mockContentSourceRepository,
          mockContentDirectoryService,
          mockMovieRepository,
        } = setupTest();

        mockContentSourceRepository.findByMovieId.mockResolvedValueOnce([]);
        mockContentDirectoryService.searchSourcesForMovie.mockResolvedValueOnce(
          delayedResult(
            {
              sources: [mockSource1],
              trailerCode: 'efgh5678',
              source: 'YTS',
            },
            1500
          )
        );

        const startTime = Date.now();
        const searchPromise = service.getSourcesForMovieWithOnDemandSearch(mockMovie, 1200);
        jest.advanceTimersByTime(1200);
        const sources = await searchPromise;
        const endTime = Date.now();

        // The search should take less than 1200ms and return an empty array because the search is not finished yet
        expect(endTime - startTime).toBeLessThanOrEqual(1200);
        expect(sources).toEqual([]);

        // The search is triggered
        expect(mockContentSourceRepository.findByMovieId).toHaveBeenCalledWith(mockMovie.id);
        expect(mockContentDirectoryService.searchSourcesForMovie).toHaveBeenCalledWith(
          mockMovie.imdbId,
          true,
          expect.any(Array),
          true
        );

        // The search is not finished yet, so markSourceSearched is not called
        expect(mockMovieRepository.markSourceSearched).not.toHaveBeenCalled();
      });

      it('should pass high priority flag to content directory service', async () => {
        const { service, mockMovie, mockContentSourceRepository, mockContentDirectoryService } =
          setupTest();

        mockContentSourceRepository.findByMovieId.mockResolvedValueOnce([]);

        await service.getSourcesForMovieWithOnDemandSearch(mockMovie);

        expect(mockContentDirectoryService.searchSourcesForMovie).toHaveBeenCalledWith(
          mockMovie.imdbId,
          true, // isOnDemand
          expect.anything(), // contentDirectoriesSearched
          true
        );
      });

      it('should continue background search after timeout', async () => {
        const {
          service,
          mockMovie,
          mockSource1,
          mockContentSourceRepository,
          mockContentDirectoryService,
          mockMovieRepository,
        } = setupTest();

        mockContentSourceRepository.findByMovieId.mockResolvedValueOnce([]);
        const timeout1 = 200;
        const timeout2 = 400;

        mockContentDirectoryService.searchSourcesForMovie.mockResolvedValueOnce(
          delayedResult(
            {
              sources: [mockSource1],
              trailerCode: 'abcd1234',
              source: 'YTS',
            },
            timeout2
          )
        );

        const startTime = Date.now();
        const sourcesPromise = service.getSourcesForMovieWithOnDemandSearch(mockMovie, timeout1);
        jest.advanceTimersByTime(timeout1);
        const sources = await sourcesPromise;
        const endTime = Date.now();

        // The search should take slightly more than the timeout and return an empty array because the search is not finished yet
        expect(endTime - startTime).toBeLessThanOrEqual(timeout1 + 50); // 50ms because of sync operations that sum up
        expect(sources).toEqual([]);
        expect(mockMovieRepository.markSourceSearched).not.toHaveBeenCalled();

        // Wait for background search to complete
        jest.advanceTimersByTime(timeout2 - timeout1);
        jest.useRealTimers();
        await new Promise(resolve => setTimeout(resolve, 20));

        // The search is finished, so sources are created
        expect(mockMovieRepository.markSourceSearched).toHaveBeenCalledTimes(1);
        expect(mockContentSourceRepository.upsertForMovie).toHaveBeenCalledTimes(1);
      });
    });

    describe('when movie has no IMDb ID', () => {
      it('should return empty array without triggering search', async () => {
        const {
          service,
          mockContentSourceRepository,
          mockContentDirectoryService,
          mockMovieRepository,
        } = setupTest();

        mockContentSourceRepository.findByMovieId.mockResolvedValueOnce([]);

        const sources = await service.getSourcesForMovieWithOnDemandSearch(
          createMockMovie({ imdbId: null })
        );

        expect(sources).toEqual([]);
        expect(mockContentDirectoryService.searchSourcesForMovie).not.toHaveBeenCalled();
        expect(mockMovieRepository.markSourceSearched).not.toHaveBeenCalled();
      });
    });

    describe('when search fails', () => {
      it('should handle errors gracefully and return empty array', async () => {
        const { service, mockMovie, mockContentSourceRepository, mockContentDirectoryService } =
          setupTest();

        mockContentSourceRepository.findByMovieId.mockResolvedValueOnce([]);
        mockContentDirectoryService.searchSourcesForMovie.mockRejectedValue(
          new Error('Search failed')
        );

        const sources = await service.getSourcesForMovieWithOnDemandSearch(mockMovie);

        // The search is triggered ( but we made it fail )
        expect(mockContentDirectoryService.searchSourcesForMovie).toHaveBeenCalledWith(
          mockMovie.imdbId,
          true,
          expect.any(Array),
          true
        );

        // The search failed, so no sources are returned
        expect(sources).toEqual([]);
      });
    });
  });

  describe('syncStatsForSources', () => {
    it('should update stats for sources that need updates', async () => {
      const { service, mockSource1, mockContentSourceRepository, mockSourceMetadataFileService } =
        setupTest();

      const newWatchers = mockSource1.watchers + 10;
      const newBroadcasters = mockSource1.broadcasters + 10;

      const sourceToUpdate = createMockSourceForStats({
        hash: mockSource1.hash,
      });
      mockContentSourceRepository.findSourceThatNeedsStatsUpdate.mockResolvedValueOnce([
        sourceToUpdate,
      ]);
      mockSourceMetadataFileService.getStats.mockResolvedValueOnce({
        broadcasters: newBroadcasters,
        watchers: newWatchers,
      });

      await service.syncStatsForSources();

      // It processes 5 sources at a time
      expect(mockContentSourceRepository.findSourceThatNeedsStatsUpdate).toHaveBeenCalledWith(5);

      // But we only return one source so it should be called only once
      expect(mockSourceMetadataFileService.getStats).toHaveBeenCalledTimes(1);
      expect(mockSourceMetadataFileService.getStats).toHaveBeenCalledWith(sourceToUpdate.hash);

      // And it should update the stats for the source
      expect(mockContentSourceRepository.updateStats).toHaveBeenCalledWith(
        sourceToUpdate,
        newBroadcasters,
        newWatchers,
        expect.any(Date)
      );
    });

    it('should update stats also for sources without file', async () => {
      const { service, mockSource1, mockSourceMetadataFileService, mockContentSourceRepository } =
        setupTest();

      const sourceWithoutFile = createMockSourceForStats({
        hash: mockSource1.hash,
        file: undefined,
      });
      const newWatchers = mockSource1.watchers + 10;
      const newBroadcasters = mockSource1.broadcasters + 10;

      mockContentSourceRepository.findSourceThatNeedsStatsUpdate.mockResolvedValueOnce([
        sourceWithoutFile,
      ]);
      mockSourceMetadataFileService.getStats.mockResolvedValueOnce({
        broadcasters: newBroadcasters,
        watchers: newWatchers,
      });

      await service.syncStatsForSources();

      // It can't getStats if there's no file to load
      expect(mockSourceMetadataFileService.getStats).toHaveBeenCalledTimes(1);
      expect(mockSourceMetadataFileService.getStats).toHaveBeenCalledWith(sourceWithoutFile.hash);

      // And it should update the stats for the source
      expect(mockContentSourceRepository.updateStats).toHaveBeenCalledWith(
        sourceWithoutFile,
        newBroadcasters,
        newWatchers,
        expect.any(Date)
      );
    });

    it('should handle magnet service errors gracefully', async () => {
      const { service, mockSource1, mockSourceMetadataFileService, mockContentSourceRepository } =
        setupTest();

      const sourceToUpdate = createMockSourceForStats({
        hash: mockSource1.hash,
      });
      mockContentSourceRepository.findSourceThatNeedsStatsUpdate.mockResolvedValueOnce([
        sourceToUpdate,
      ]);
      mockSourceMetadataFileService.getStats.mockRejectedValueOnce(new Error('Stats fetch failed'));

      await service.syncStatsForSources();

      // getStats was correctly called but it failed
      expect(mockSourceMetadataFileService.getStats).toHaveBeenCalledWith(sourceToUpdate.hash);

      // So it should not update the stats for the source
      expect(mockContentSourceRepository.updateStats).not.toHaveBeenCalled();
    });

    it('should classify scrape timeouts as expected debug events', async () => {
      const { service, mockSource1, mockSourceMetadataFileService, mockContentSourceRepository } =
        setupTest();
      const sourceToUpdate = createMockSourceForStats({ hash: mockSource1.hash });
      mockContentSourceRepository.findSourceThatNeedsStatsUpdate.mockResolvedValueOnce([
        sourceToUpdate,
      ]);
      mockSourceMetadataFileService.getStats.mockRejectedValueOnce(
        new ErrorWithStatus('Scrape request timed out', 'scrape_timeout')
      );

      await service.syncStatsForSources();

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'SourceService',
        `Stats scrape timed out for source ${sourceToUpdate.id} (quality: ${sourceToUpdate.quality})`
      );
      expect(mockLogger.error).not.toHaveBeenCalledWith(
        'SourceService',
        expect.stringContaining(`source ${sourceToUpdate.id}`),
        expect.anything()
      );
      expect(mockContentSourceRepository.updateStats).not.toHaveBeenCalled();
    });

    it('should skip when VPN is disconnected', async () => {
      const { service, mockContentSourceRepository } = createServiceWithDisconnectedVpn();
      await service.syncStatsForSources();

      expect(mockContentSourceRepository.findSourceThatNeedsStatsUpdate).not.toHaveBeenCalled();
    });
  });

  describe('VPN dependency handling', () => {
    it('should skip source search when VPN is disconnected', async () => {
      const { service, mockMovieRepository, mockContentDirectoryService } =
        createServiceWithDisconnectedVpn();
      await service.searchSourcesForMovies();

      expect(mockMovieRepository.findMoviesPendingSourceSearch).not.toHaveBeenCalled();
      expect(mockContentDirectoryService.searchSourcesForMovie).not.toHaveBeenCalled();
    });

    it('should register VPN connection event handlers', async () => {
      const { mockVpnService } = setupTest();

      expect(mockVpnService.on).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(mockVpnService.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
    });
  });
});
