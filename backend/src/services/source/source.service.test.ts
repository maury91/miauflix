import type { Database } from '@database/database';

// Mock the dependencies
jest.mock('@services/source/source-metadata-file.service');
jest.mock('@services/security/vpn.service');
jest.mock('@services/download/download.service');
jest.mock('@services/source-metadata/content-directory.service');

import { Quality, Source, VideoCodec } from '@miauflix/source-metadata-extractor';

import { DownloadService } from '@services/download/download.service';
import { VpnDetectionService } from '@services/security/vpn.service';
import { SourceService } from '@services/source/source.service';
import { SourceMetadataFileService } from '@services/source/source-metadata-file.service';
import { ContentDirectoryService } from '@services/source-metadata/content-directory.service';

// Mock repositories
const mockMovieRepository = {
  findMoviesPendingSourceSearch: jest.fn(() =>
    Promise.resolve([
      { id: 1, imdbId: 'tt1234567', title: 'Test Movie 1' },
      { id: 2, imdbId: 'tt7654321', title: 'Test Movie 2' },
      { id: 3, imdbId: null, title: 'Test Movie Without IMDb ID' },
    ])
  ),
  markSourceSearched: jest.fn(() => Promise.resolve(undefined)),
  updateMovieTrailerIfDoesntExists: jest.fn(() => Promise.resolve(undefined)),
  findMoviesByIdsWithImdb: jest.fn(() => Promise.resolve([])),
};

const mockMovieSourceRepository = {
  createMany: jest.fn(() =>
    Promise.resolve([
      { id: 1, movieId: 1 },
      { id: 2, movieId: 1 },
    ])
  ),
  findByMovieId: jest.fn(() =>
    Promise.resolve([
      { id: 1, movieId: 1, hash: 'abc123', quality: '1080p' },
      { id: 2, movieId: 1, hash: 'def456', quality: '720p' },
    ])
  ),
  findSourceThatNeedsStatsUpdate: jest.fn(() => Promise.resolve([])),
  updateStats: jest.fn(() => Promise.resolve(undefined)),
  getNextSourcesToProcess: jest.fn(() => Promise.resolve([])),
  updateSourceFile: jest.fn(() => Promise.resolve(undefined)),
  findMovieIdsWithUnknownSourceType: jest.fn(() => Promise.resolve([])),
  updateSourceMetadata: jest.fn(() => Promise.resolve(undefined)),
};

// Mock database
const mockDatabase = {
  getMovieRepository: () => mockMovieRepository,
  getMovieSourceRepository: () => mockMovieSourceRepository,
} as unknown as Database;

describe('SourceService', () => {
  const mockDownloadService = new DownloadService() as jest.Mocked<DownloadService>;
  let service: SourceService;
  const mockContentDirectoryService = new ContentDirectoryService(
    {} as never,
    mockDownloadService
  ) as jest.Mocked<ContentDirectoryService>;
  const mockSourceMetadataFileService = new SourceMetadataFileService(
    mockDownloadService
  ) as jest.Mocked<SourceMetadataFileService>;
  const mockVpnService = new VpnDetectionService() as jest.Mocked<VpnDetectionService>;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockDownloadService.generateLink.mockReturnValue('magnet:?xt=urn:btih:test');

    // Setup default mock implementations
    mockContentDirectoryService.searchSourcesForMovie.mockResolvedValue({
      sources: [
        {
          audioCodec: [],
          bitrate: 2000,
          broadcasters: 100,
          hash: 'abc123',
          language: [],
          magnetLink: 'magnet:?xt=urn:btih:abc123&dn=test',
          quality: Quality.FHD,
          resolution: { width: 1920, height: 1080, label: 'FHD' },
          score: 0,
          size: 1500000000,
          source: Source.WEB,
          type: 'WEB',
          uploadDate: new Date('2023-01-01'),
          url: 'https://example.com/source1',
          videoCodec: VideoCodec.X264,
          watchers: 10,
        },
        {
          audioCodec: [],
          bitrate: 1500,
          broadcasters: 50,
          hash: 'def456',
          language: [],
          magnetLink: 'magnet:?xt=urn:btih:def456&dn=test',
          quality: Quality.HD,
          resolution: { width: 1280, height: 720, label: 'HD' },
          score: 0,
          size: 800000000,
          source: Source.BLURAY,
          type: 'BluRay',
          uploadDate: new Date('2023-01-02'),
          url: 'https://example.com/source2',
          videoCodec: VideoCodec.X264,
          watchers: 5,
        },
      ],
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
    mockSourceMetadataFileService.getStats.mockResolvedValue({ seeders: 100, leechers: 10 });
    mockSourceMetadataFileService.getAvailableConcurrency.mockReturnValue(2);
    mockSourceMetadataFileService.isIdle.mockReturnValue(true);
    mockSourceMetadataFileService.status.mockReturnValue({});

    // Create service instance
    service = new SourceService(
      mockDatabase,
      mockVpnService,
      mockContentDirectoryService,
      mockSourceMetadataFileService
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('searchSourcesForMovies', () => {
    it('should process movies without sources', async () => {
      mockContentDirectoryService.searchSourcesForMovie.mockRejectedValueOnce(
        new Error('Search failed')
      );
      await service.searchSourcesForMovies();

      expect(mockMovieRepository.findMoviesPendingSourceSearch).toHaveBeenCalledTimes(1);
      expect(mockMovieRepository.findMoviesPendingSourceSearch).toHaveBeenCalledWith(1);
      expect(mockContentDirectoryService.searchSourcesForMovie).toHaveBeenCalledTimes(2);
      expect(mockMovieSourceRepository.createMany).toHaveBeenCalledTimes(1);
      expect(mockMovieRepository.markSourceSearched).toHaveBeenCalledTimes(3);
    });
  });

  describe('getSourcesForMovie', () => {
    it('should return sources for a movie', async () => {
      const sources = await service.getSourcesForMovie(1);
      expect(mockMovieSourceRepository.findByMovieId).toHaveBeenCalledWith(1);
      expect(sources).toHaveLength(2);
    });
  });

  describe('getSourcesForMovieWithOnDemandSearch', () => {
    describe('when movie has existing sources', () => {
      it('should return immediately without triggering API calls', async () => {
        const existingSources = [
          { id: 1, movieId: 1, hash: 'abc123', quality: '1080p' },
          { id: 2, movieId: 1, hash: 'def456', quality: '720p' },
        ];
        mockMovieSourceRepository.findByMovieId.mockResolvedValueOnce(existingSources);

        const movie = { id: 1, imdbId: 'tt1234567', title: 'Test Movie', sourceSearched: false };
        const sources = await service.getSourcesForMovieWithOnDemandSearch(movie);

        expect(sources).toEqual(existingSources);
        expect(mockMovieSourceRepository.findByMovieId).toHaveBeenCalledWith(1);
        expect(mockContentDirectoryService.searchSourcesForMovie).not.toHaveBeenCalled();
      });
    });

    describe('when movie has no sources', () => {
      it('should trigger high priority search with 1200ms default timeout', async () => {
        // Use real timers for this test since it involves complex Promise.race behavior
        jest.useRealTimers();

        mockMovieSourceRepository.findByMovieId.mockResolvedValueOnce([]);

        const movie = { id: 1, imdbId: 'tt1234567', title: 'Test Movie', sourceSearched: false };

        const searchPromise = service.getSourcesForMovieWithOnDemandSearch(movie, 1200);
        const sources = await searchPromise;

        expect(mockMovieSourceRepository.findByMovieId).toHaveBeenCalledWith(1);
        expect(mockContentDirectoryService.searchSourcesForMovie).toHaveBeenCalledWith(
          'tt1234567',
          true
        );
        expect(sources).toEqual([]);

        // Wait for the markSourceSearched call which happens without await
        await new Promise(resolve => setTimeout(resolve, 10));
        expect(mockMovieRepository.markSourceSearched).toHaveBeenCalledWith(1);
      });

      it('should pass high priority flag to tracker service', async () => {
        mockMovieSourceRepository.findByMovieId.mockResolvedValueOnce([]);

        const movie = { id: 1, imdbId: 'tt1234567', title: 'Test Movie', sourceSearched: false };
        await service.getSourcesForMovieWithOnDemandSearch(movie);

        expect(mockContentDirectoryService.searchSourcesForMovie).toHaveBeenCalledWith(
          'tt1234567',
          true
        );
      });
    });

    describe('when search times out', () => {
      it('should return empty array but continue search in background', async () => {
        // Use real timers for timeout behavior
        jest.useRealTimers();

        mockMovieSourceRepository.findByMovieId.mockResolvedValueOnce([]);

        mockContentDirectoryService.searchSourcesForMovie.mockImplementation(() => {
          return new Promise(resolve => {
            setTimeout(
              () =>
                resolve({
                  sources: [],
                  trailerCode: 'efgh5678',
                  source: 'YTS',
                }),
              400
            ); // Take longer than timeout
          });
        });

        const movie = {
          id: 1,
          imdbId: 'tt-slow-search',
          title: 'Slow Movie',
          sourceSearched: false,
        };

        const startTime = Date.now();
        const sources = await service.getSourcesForMovieWithOnDemandSearch(movie, 200);
        const endTime = Date.now();

        expect(endTime - startTime).toBeLessThan(220); // Should timeout around 200ms
        expect(sources).toEqual([]);
        expect(mockContentDirectoryService.searchSourcesForMovie).toHaveBeenCalledWith(
          'tt-slow-search',
          true
        );

        // Wait for background search to complete and markSourceSearched to be called
        await new Promise(resolve => setTimeout(resolve, 400)); // Wait for search to complete (400ms + buffer)
        expect(mockMovieRepository.markSourceSearched).toHaveBeenCalledWith(1);

        // Restore fake timers
        jest.useFakeTimers();
      });

      it('should continue background search after timeout', async () => {
        // Use real timers for timeout behavior
        jest.useRealTimers();

        mockMovieSourceRepository.findByMovieId.mockResolvedValueOnce([]);

        let searchResolved = false;
        mockContentDirectoryService.searchSourcesForMovie.mockImplementation(() => {
          return new Promise(resolve => {
            setTimeout(() => {
              searchResolved = true;
              resolve({
                sources: [],
                trailerCode: 'abcd1234',
                source: 'YTS',
              });
            }, 400); // Take longer than timeout
          });
        });

        const movie = { id: 1, imdbId: 'tt1234567', title: 'Test Movie', sourceSearched: false };

        const startTime = Date.now();
        const sources = await service.getSourcesForMovieWithOnDemandSearch(movie, 200);
        const endTime = Date.now();

        expect(endTime - startTime).toBeLessThan(220); // Should timeout around 200ms
        expect(sources).toEqual([]);
        expect(searchResolved).toBe(false);

        // Wait for background search to complete
        await new Promise(resolve => setTimeout(resolve, 400)); // Wait for search to complete (400ms + buffer)
        expect(searchResolved).toBe(true);
        expect(mockMovieRepository.markSourceSearched).toHaveBeenCalledWith(1);

        // Restore fake timers
        jest.useFakeTimers();
      });
    });

    describe('when movie has no IMDb ID', () => {
      it('should return empty array without triggering search', async () => {
        mockMovieSourceRepository.findByMovieId.mockResolvedValueOnce([]);

        const movie = { id: 1, imdbId: null, title: 'Test Movie', sourceSearched: false };
        const sources = await service.getSourcesForMovieWithOnDemandSearch(movie);

        expect(sources).toEqual([]);
        expect(mockContentDirectoryService.searchSourcesForMovie).not.toHaveBeenCalled();
        expect(mockMovieRepository.markSourceSearched).not.toHaveBeenCalled();
      });
    });

    describe('when search fails', () => {
      it('should handle errors gracefully and return empty array', async () => {
        mockMovieSourceRepository.findByMovieId.mockResolvedValueOnce([]);
        mockContentDirectoryService.searchSourcesForMovie.mockRejectedValue(
          new Error('Search failed')
        );

        const movie = { id: 1, imdbId: 'tt1234567', title: 'Test Movie', sourceSearched: false };

        const sources = await service.getSourcesForMovieWithOnDemandSearch(movie);

        expect(sources).toEqual([]);
        expect(mockContentDirectoryService.searchSourcesForMovie).toHaveBeenCalledWith(
          'tt1234567',
          true
        );
      });
    });
  });

  describe('syncStatsForSources', () => {
    it('should update stats for sources that need updates', async () => {
      const sourcesToUpdate = [
        {
          id: 1,
          hash: 'abc123',
          quality: '1080p',
          file: Buffer.from('mock file'),
          broadcasters: 90,
          watchers: 15,
          lastStatsCheck: new Date(Date.now() - 7 * 60 * 60 * 1000),
          nextStatsCheckAt: new Date(Date.now() - 1000),
        },
      ];
      mockMovieSourceRepository.findSourceThatNeedsStatsUpdate.mockResolvedValueOnce(
        sourcesToUpdate as never[]
      );
      mockSourceMetadataFileService.getStats.mockResolvedValueOnce({ seeders: 100, leechers: 10 });

      await service.syncStatsForSources();

      expect(mockMovieSourceRepository.findSourceThatNeedsStatsUpdate).toHaveBeenCalledWith(5);
      expect(mockSourceMetadataFileService.getStats).toHaveBeenCalledWith('abc123');
      expect(mockMovieSourceRepository.updateStats).toHaveBeenCalledWith(
        1,
        100,
        10,
        expect.any(Date)
      );
    });

    it('should skip sources without source metadata files', async () => {
      const sourcesToUpdate = [
        {
          id: 1,
          hash: 'abc123',
          quality: '1080p',
          file: null,
          broadcasters: 90,
          watchers: 15,
          lastStatsCheck: new Date(Date.now() - 7 * 60 * 60 * 1000),
          nextStatsCheckAt: new Date(Date.now() - 1000),
        },
      ];
      mockMovieSourceRepository.findSourceThatNeedsStatsUpdate.mockResolvedValueOnce(
        sourcesToUpdate as never[]
      );

      await service.syncStatsForSources();

      expect(mockSourceMetadataFileService.getStats).not.toHaveBeenCalled();
      expect(mockMovieSourceRepository.updateStats).not.toHaveBeenCalled();
    });

    it('should handle magnet service errors gracefully', async () => {
      const sourcesToUpdate = [
        {
          id: 1,
          hash: 'abc123',
          quality: '1080p',
          file: Buffer.from('mock file'),
          broadcasters: 90,
          watchers: 15,
          lastStatsCheck: new Date(),
          nextStatsCheckAt: new Date(),
        },
      ];
      mockMovieSourceRepository.findSourceThatNeedsStatsUpdate.mockResolvedValueOnce(
        sourcesToUpdate as never[]
      );
      mockSourceMetadataFileService.getStats.mockRejectedValueOnce(new Error('Stats fetch failed'));

      await service.syncStatsForSources();

      expect(mockSourceMetadataFileService.getStats).toHaveBeenCalledWith('abc123');
      expect(mockMovieSourceRepository.updateStats).not.toHaveBeenCalled();
    });

    it('should skip when VPN is disconnected', async () => {
      mockVpnService.isVpnActive.mockResolvedValueOnce(false);

      const serviceWithoutVpn = new SourceService(
        mockDatabase,
        mockVpnService,
        mockContentDirectoryService,
        mockSourceMetadataFileService
      );

      await serviceWithoutVpn.syncStatsForSources();

      expect(mockMovieSourceRepository.findSourceThatNeedsStatsUpdate).not.toHaveBeenCalled();
    });
  });

  describe('resyncMovieSources', () => {
    it('should update source metadata when movies need processing', async () => {
      const movie = { id: 1, imdbId: 'tt1234567', title: 'Test Movie' };
      mockMovieSourceRepository.findMovieIdsWithUnknownSourceType.mockResolvedValueOnce([
        1,
      ] as never[]);
      mockMovieRepository.findMoviesByIdsWithImdb.mockResolvedValueOnce([movie] as never[]);

      await service.resyncMovieSources();

      expect(mockMovieSourceRepository.findMovieIdsWithUnknownSourceType).toHaveBeenCalled();
      expect(mockMovieRepository.findMoviesByIdsWithImdb).toHaveBeenCalledWith([1], 1);
      expect(mockContentDirectoryService.searchSourcesForMovie).toHaveBeenCalledWith('tt1234567');
    });

    it('should skip when no movies need processing', async () => {
      mockMovieSourceRepository.findMovieIdsWithUnknownSourceType.mockResolvedValueOnce([]);

      await service.resyncMovieSources();

      expect(mockMovieRepository.findMoviesByIdsWithImdb).not.toHaveBeenCalled();
      expect(mockContentDirectoryService.searchSourcesForMovie).not.toHaveBeenCalled();
    });

    it('should handle tracker service errors gracefully', async () => {
      const movie = { id: 1, imdbId: 'tt1234567', title: 'Test Movie' };
      mockMovieSourceRepository.findMovieIdsWithUnknownSourceType.mockResolvedValueOnce([
        1,
      ] as never[]);
      mockMovieRepository.findMoviesByIdsWithImdb.mockResolvedValueOnce([movie] as never[]);
      mockContentDirectoryService.searchSourcesForMovie.mockRejectedValueOnce(
        new Error('Resync failed')
      );

      await service.resyncMovieSources();

      expect(mockContentDirectoryService.searchSourcesForMovie).toHaveBeenCalledWith('tt1234567');
      // Should not throw - error is handled internally
    });

    it('should skip when VPN is disconnected', async () => {
      mockVpnService.isVpnActive.mockResolvedValueOnce(false);

      const serviceWithoutVpn = new SourceService(
        mockDatabase,
        mockVpnService,
        mockContentDirectoryService,
        mockSourceMetadataFileService
      );

      await serviceWithoutVpn.resyncMovieSources();

      expect(mockMovieSourceRepository.findMovieIdsWithUnknownSourceType).not.toHaveBeenCalled();
    });
  });

  describe('VPN dependency handling', () => {
    it('should skip source search when VPN is disconnected', async () => {
      mockVpnService.isVpnActive.mockResolvedValueOnce(false);

      const serviceWithoutVpn = new SourceService(
        mockDatabase,
        mockVpnService,
        mockContentDirectoryService,
        mockSourceMetadataFileService
      );

      await serviceWithoutVpn.searchSourcesForMovies();

      expect(mockMovieRepository.findMoviesPendingSourceSearch).not.toHaveBeenCalled();
      expect(mockContentDirectoryService.searchSourcesForMovie).not.toHaveBeenCalled();
    });

    it('should register VPN connection event handlers', async () => {
      new SourceService(
        mockDatabase,
        mockVpnService,
        mockContentDirectoryService,
        mockSourceMetadataFileService
      );

      expect(mockVpnService.on).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(mockVpnService.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
    });
  });
});
