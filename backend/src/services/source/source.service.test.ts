// Mock the dependencies
jest.mock('@database/database');
jest.mock('@repositories/movie.repository');
jest.mock('@repositories/movie-source.repository');
jest.mock('@services/source/source-metadata-file.service');
jest.mock('@services/security/vpn.service');
jest.mock('@services/download/download.service');
jest.mock('@services/source-metadata/content-directory.service');

import {
  createMockMovie,
  createMockMovieSource,
  createMockSourceMetadata,
} from '@__test-utils__/mocks/movie.mock';
import { configureFakerSeed, delayedResult } from '@__test-utils__/utils';
import { Quality, Source } from '@miauflix/source-metadata-extractor';
import type { UpdateResult } from 'typeorm';

import { Database } from '@database/database';
import type { MovieSource } from '@entities/movie-source.entity';
import { MovieRepository } from '@repositories/movie.repository';
import { MovieSourceRepository } from '@repositories/movie-source.repository';
import { DownloadService } from '@services/download/download.service';
import type { EncryptionService } from '@services/encryption/encryption.service';
import { VpnDetectionService } from '@services/security/vpn.service';
import { SourceService } from '@services/source/source.service';
import { SourceMetadataFileService } from '@services/source/source-metadata-file.service';
import { ContentDirectoryService } from '@services/source-metadata/content-directory.service';

describe('SourceService', () => {
  // Helper functions to reduce duplication
  const createServiceWithDisconnectedVpn = () => {
    const {
      mockVpnService,
      mockDatabase,
      mockContentDirectoryService,
      mockSourceMetadataFileService,
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
      service: new SourceService(
        mockDatabase,
        mockVpnService,
        mockContentDirectoryService,
        mockSourceMetadataFileService
      ),
    };
  };

  const createMockSourceForStats = (overrides: Partial<MovieSource> = {}): MovieSource => {
    return createMockMovieSource({
      file: Buffer.from('mock file'),
      lastStatsCheck: new Date(Date.now() - 7 * 60 * 60 * 1000),
      nextStatsCheckAt: new Date(Date.now() - 1000),
      ...overrides,
    });
  };

  const setupTest = () => {
    const mockMovie = createMockMovie();

    // Generate movie sources that reference the first movie
    const mockMovieSource1 = createMockMovieSource({
      movieId: mockMovie.id,
      quality: Quality.FHD,
    });

    const mockMovieSource2 = createMockMovieSource({
      movieId: mockMovie.id,
      quality: Quality.HD,
    });

    // Generate source metadata that matches the movie sources
    const mockSource1 = createMockSourceMetadata({
      hash: mockMovieSource1.hash,
    });

    const mockSource2 = createMockSourceMetadata({
      hash: mockMovieSource2.hash,
      quality: Quality.HD,
      resolution: { width: 1280, height: 720, label: 'HD' },
      source: Source.BLURAY,
    });

    // Mock repositories
    const mockMovieRepository = new MovieRepository({} as never) as jest.Mocked<MovieRepository>;
    const mockMovieSourceRepository = new MovieSourceRepository(
      {} as never
    ) as jest.Mocked<MovieSourceRepository>;
    const mockDatabase = new Database({} as EncryptionService) as jest.Mocked<Database>;

    // Mock services
    const mockDownloadService = new DownloadService() as jest.Mocked<DownloadService>;
    const mockContentDirectoryService = new ContentDirectoryService(
      {} as never,
      mockDownloadService
    ) as jest.Mocked<ContentDirectoryService>;
    const mockSourceMetadataFileService = new SourceMetadataFileService(
      mockDownloadService
    ) as jest.Mocked<SourceMetadataFileService>;
    const mockVpnService = new VpnDetectionService() as jest.Mocked<VpnDetectionService>;

    // Setup repository mocks
    mockMovieRepository.findMoviesPendingSourceSearch.mockResolvedValue([mockMovie]);
    mockMovieRepository.markSourceSearched.mockResolvedValue(undefined);
    mockMovieRepository.updateMovieTrailerIfDoesntExists.mockResolvedValue(undefined);
    mockMovieRepository.findMoviesByIdsWithImdb.mockResolvedValue([]);

    mockMovieSourceRepository.createMany.mockResolvedValue([mockMovieSource1, mockMovieSource2]);
    mockMovieSourceRepository.findByMovieId.mockResolvedValue([mockMovieSource1, mockMovieSource2]);
    mockMovieSourceRepository.findSourceThatNeedsStatsUpdate.mockResolvedValue([]);
    mockMovieSourceRepository.updateStats.mockResolvedValue({} as UpdateResult);
    mockMovieSourceRepository.getNextSourcesToProcess.mockResolvedValue([]);
    mockMovieSourceRepository.updateSourceFile.mockResolvedValue({} as UpdateResult);
    mockMovieSourceRepository.findMovieIdsWithUnknownSourceType.mockResolvedValue([]);
    mockMovieSourceRepository.updateSourceMetadata.mockResolvedValue({} as UpdateResult);

    // Setup service mocks
    mockDownloadService.generateLink.mockReturnValue(`magnet:?xt=urn:btih:${mockSource1.hash}`);

    mockContentDirectoryService.searchSourcesForMovie.mockResolvedValue({
      sources: [mockSource1, mockSource2],
      source: 'YTS',
      trailerCode: 'abcd1234',
    });

    mockContentDirectoryService.status.mockReturnValue([
      {
        queue: 0,
        successes: [],
        failures: [],
        lastRequest: null,
      },
    ]);

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
    mockSourceMetadataFileService.status.mockReturnValue({});

    mockDatabase.getMovieRepository.mockReturnValue(mockMovieRepository);
    mockDatabase.getMovieSourceRepository.mockReturnValue(mockMovieSourceRepository);

    // Create service instance
    const service = new SourceService(
      mockDatabase,
      mockVpnService,
      mockContentDirectoryService,
      mockSourceMetadataFileService
    );

    return {
      service,
      mockMovieSource1,
      mockMovieSource2,
      mockSource1,
      mockSource2,
      mockMovie,
      mockVpnService,
      mockDatabase,
      mockMovieRepository,
      mockMovieSourceRepository,
      mockDownloadService,
      mockContentDirectoryService,
      mockSourceMetadataFileService,
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

  describe('searchSourcesForMovies', () => {
    it('should process movies without sources', async () => {
      const {
        service,
        mockMovie,
        mockMovieRepository,
        mockContentDirectoryService,
        mockMovieSourceRepository,
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
        expect.anything()
      );
      // The search failed, so no sources were created
      expect(mockMovieSourceRepository.createMany).not.toHaveBeenCalled();
      expect(mockMovieRepository.markSourceSearched).not.toHaveBeenCalled();
    });
  });

  describe('getSourcesForMovie', () => {
    it('should return sources for a movie', async () => {
      const {
        service,
        mockMovieSource1,
        mockMovieSource2,
        mockMovie,
        mockMovieSourceRepository,
        mockContentDirectoryService,
      } = setupTest();

      const sources = await service.getSourcesForMovie(mockMovie.id);

      expect(mockMovieSourceRepository.findByMovieId).toHaveBeenCalledWith(mockMovie.id);

      // findByMovieId returns two sources
      expect(sources).toHaveLength(2);
      expect(sources[0]).toEqual(mockMovieSource1);
      expect(sources[1]).toEqual(mockMovieSource2);

      // Because we have sources in the database, the search is not triggered
      expect(mockContentDirectoryService.searchSourcesForMovie).not.toHaveBeenCalled();
    });
  });

  describe('getSourcesForMovieWithOnDemandSearch', () => {
    describe('when movie has existing sources', () => {
      it('should return immediately without triggering API calls', async () => {
        const {
          service,
          mockMovieSource1,
          mockMovieSource2,
          mockMovie,
          mockMovieSourceRepository,
          mockContentDirectoryService,
        } = setupTest();

        const sources = await service.getSourcesForMovieWithOnDemandSearch(mockMovie);

        expect(mockMovieSourceRepository.findByMovieId).toHaveBeenCalledWith(mockMovie.id);
        // we mocked findByMovieId to return two sources
        expect(sources).toEqual([mockMovieSource1, mockMovieSource2]);

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
          mockMovieSourceRepository,
          mockContentDirectoryService,
          mockMovieRepository,
        } = setupTest();

        mockMovieSourceRepository.findByMovieId.mockResolvedValueOnce([]);
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
        expect(mockMovieSourceRepository.findByMovieId).toHaveBeenCalledWith(mockMovie.id);
        expect(mockContentDirectoryService.searchSourcesForMovie).toHaveBeenCalledWith(
          mockMovie.imdbId,
          true,
          expect.any(Array)
        );

        // The search is not finished yet, so markSourceSearched is not called
        expect(mockMovieRepository.markSourceSearched).not.toHaveBeenCalled();
      });

      it('should pass high priority flag to content directory service', async () => {
        const { service, mockMovie, mockMovieSourceRepository, mockContentDirectoryService } =
          setupTest();

        mockMovieSourceRepository.findByMovieId.mockResolvedValueOnce([]);

        await service.getSourcesForMovieWithOnDemandSearch(mockMovie);

        expect(mockContentDirectoryService.searchSourcesForMovie).toHaveBeenCalledWith(
          mockMovie.imdbId,
          true, // isOnDemand
          expect.anything() // contentDirectoriesSearched
        );
      });

      it('should continue background search after timeout', async () => {
        const {
          service,
          mockMovie,
          mockSource1,
          mockMovieSourceRepository,
          mockContentDirectoryService,
          mockMovieRepository,
        } = setupTest();

        mockMovieSourceRepository.findByMovieId.mockResolvedValueOnce([]);
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
        expect(mockMovieSourceRepository.createMany).toHaveBeenCalledTimes(1);
      });
    });

    describe('when movie has no IMDb ID', () => {
      it('should return empty array without triggering search', async () => {
        const {
          service,
          mockMovieSourceRepository,
          mockContentDirectoryService,
          mockMovieRepository,
        } = setupTest();

        mockMovieSourceRepository.findByMovieId.mockResolvedValueOnce([]);

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
        const { service, mockMovie, mockMovieSourceRepository, mockContentDirectoryService } =
          setupTest();

        mockMovieSourceRepository.findByMovieId.mockResolvedValueOnce([]);
        mockContentDirectoryService.searchSourcesForMovie.mockRejectedValue(
          new Error('Search failed')
        );

        const sources = await service.getSourcesForMovieWithOnDemandSearch(mockMovie);

        // The search is triggered ( but we made it fail )
        expect(mockContentDirectoryService.searchSourcesForMovie).toHaveBeenCalledWith(
          mockMovie.imdbId,
          true,
          expect.any(Array)
        );

        // The search failed, so no sources are returned
        expect(sources).toEqual([]);
      });
    });
  });

  describe('syncStatsForSources', () => {
    it('should update stats for sources that need updates', async () => {
      const { service, mockSource1, mockMovieSourceRepository, mockSourceMetadataFileService } =
        setupTest();

      const newWatchers = mockSource1.watchers + 10;
      const newBroadcasters = mockSource1.broadcasters + 10;

      const sourceToUpdate = createMockSourceForStats({
        hash: mockSource1.hash,
      });
      mockMovieSourceRepository.findSourceThatNeedsStatsUpdate.mockResolvedValueOnce([
        sourceToUpdate,
      ]);
      mockSourceMetadataFileService.getStats.mockResolvedValueOnce({
        broadcasters: newBroadcasters,
        watchers: newWatchers,
      });

      await service.syncStatsForSources();

      // It processes 5 sources at a time
      expect(mockMovieSourceRepository.findSourceThatNeedsStatsUpdate).toHaveBeenCalledWith(5);

      // But we only return one source so it should be called only once
      expect(mockSourceMetadataFileService.getStats).toHaveBeenCalledTimes(1);
      expect(mockSourceMetadataFileService.getStats).toHaveBeenCalledWith(sourceToUpdate.hash);

      // And it should update the stats for the source
      expect(mockMovieSourceRepository.updateStats).toHaveBeenCalledWith(
        sourceToUpdate.id,
        newBroadcasters,
        newWatchers,
        expect.any(Date)
      );
    });

    it('should update stats also for sources without file', async () => {
      const { service, mockSource1, mockSourceMetadataFileService, mockMovieSourceRepository } =
        setupTest();

      const sourceWithoutFile = createMockSourceForStats({
        hash: mockSource1.hash,
        file: undefined,
      });
      const newWatchers = mockSource1.watchers + 10;
      const newBroadcasters = mockSource1.broadcasters + 10;

      mockMovieSourceRepository.findSourceThatNeedsStatsUpdate.mockResolvedValueOnce([
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
      expect(mockMovieSourceRepository.updateStats).toHaveBeenCalledWith(
        sourceWithoutFile.id,
        newBroadcasters,
        newWatchers,
        expect.any(Date)
      );
    });

    it('should handle magnet service errors gracefully', async () => {
      const { service, mockSource1, mockSourceMetadataFileService, mockMovieSourceRepository } =
        setupTest();

      const sourceToUpdate = createMockSourceForStats({
        hash: mockSource1.hash,
      });
      mockMovieSourceRepository.findSourceThatNeedsStatsUpdate.mockResolvedValueOnce([
        sourceToUpdate,
      ]);
      mockSourceMetadataFileService.getStats.mockRejectedValueOnce(new Error('Stats fetch failed'));

      await service.syncStatsForSources();

      // getStats was correctly called but it failed
      expect(mockSourceMetadataFileService.getStats).toHaveBeenCalledWith(sourceToUpdate.hash);

      // So it should not update the stats for the source
      expect(mockMovieSourceRepository.updateStats).not.toHaveBeenCalled();
    });

    it('should skip when VPN is disconnected', async () => {
      const { service, mockMovieSourceRepository } = createServiceWithDisconnectedVpn();
      await service.syncStatsForSources();

      expect(mockMovieSourceRepository.findSourceThatNeedsStatsUpdate).not.toHaveBeenCalled();
    });
  });

  // ToDo: This may need to be removed because I added it when the content directory service was incomplete
  // and I needed the database to be updated with the correct data
  describe('resyncMovieSources', () => {
    it('should update source metadata when movies need processing', async () => {
      const {
        service,
        mockMovie,
        mockMovieRepository,
        mockMovieSourceRepository,
        mockContentDirectoryService,
      } = setupTest();

      mockMovieSourceRepository.findMovieIdsWithUnknownSourceType.mockResolvedValueOnce([
        mockMovie.id,
      ]);
      mockMovieRepository.findMoviesByIdsWithImdb.mockResolvedValueOnce([mockMovie]);

      await service.resyncMovieSources();

      expect(mockMovieSourceRepository.findMovieIdsWithUnknownSourceType).toHaveBeenCalled();
      expect(mockMovieRepository.findMoviesByIdsWithImdb).toHaveBeenCalledWith([mockMovie.id], 1);
      expect(mockContentDirectoryService.searchSourcesForMovie).toHaveBeenCalledWith(
        mockMovie.imdbId
      );
    });

    it('should skip when no movies need processing', async () => {
      const { service, mockMovieRepository, mockContentDirectoryService } = setupTest();

      await service.resyncMovieSources();

      expect(mockMovieRepository.findMoviesByIdsWithImdb).not.toHaveBeenCalled();
      expect(mockContentDirectoryService.searchSourcesForMovie).not.toHaveBeenCalled();
    });

    it('should handle tracker service errors gracefully', async () => {
      const {
        service,
        mockMovie,
        mockMovieSourceRepository,
        mockMovieRepository,
        mockContentDirectoryService,
      } = setupTest();

      mockMovieSourceRepository.findMovieIdsWithUnknownSourceType.mockResolvedValueOnce([
        mockMovie.id,
      ]);
      mockMovieRepository.findMoviesByIdsWithImdb.mockResolvedValueOnce([mockMovie]);
      mockContentDirectoryService.searchSourcesForMovie.mockRejectedValueOnce(
        new Error('Resync failed')
      );

      await service.resyncMovieSources();

      expect(mockContentDirectoryService.searchSourcesForMovie).toHaveBeenCalledWith(
        mockMovie.imdbId
      );
      // Should not throw - error is handled internally
    });

    it('should skip when VPN is disconnected', async () => {
      const { service, mockMovieSourceRepository } = createServiceWithDisconnectedVpn();
      await service.resyncMovieSources();

      expect(mockMovieSourceRepository.findMovieIdsWithUnknownSourceType).not.toHaveBeenCalled();
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
