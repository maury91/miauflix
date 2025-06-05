import type { Database } from '@database/database';

// Mock the dependencies
jest.mock('./tracker.service');
jest.mock('./magnet.service');
jest.mock('@services/security/vpn.service');

import { VpnDetectionService } from '@services/security/vpn.service';
import { VideoCodec } from '@utils/torrent-name-parser.util';

import { MagnetService } from './magnet.service';
import { SourceService } from './source.service';
import { TrackerService } from './tracker.service';

// Mock repositories
const mockMovieRepository = {
  findMoviesWithoutSources: jest.fn(() =>
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
  updateTorrentFile: jest.fn(() => Promise.resolve(undefined)),
  findMovieIdsWithUnknownSourceType: jest.fn(() => Promise.resolve([])),
  updateSourceMetadata: jest.fn(() => Promise.resolve(undefined)),
};

// Mock database
const mockDatabase = {
  getMovieRepository: () => mockMovieRepository,
  getMovieSourceRepository: () => mockMovieSourceRepository,
} as unknown as Database;

describe('SourceService', () => {
  let service: SourceService;
  let mockTrackerService: jest.Mocked<TrackerService>;
  let mockMagnetService: jest.Mocked<MagnetService>;
  let mockVpnService: jest.Mocked<VpnDetectionService>;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Get the mocked classes and create instances

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockTrackerService = new TrackerService({} as any) as jest.Mocked<TrackerService>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockMagnetService = new MagnetService({} as any) as jest.Mocked<MagnetService>;
    mockVpnService = new VpnDetectionService() as jest.Mocked<VpnDetectionService>;

    // Setup default mock implementations
    mockTrackerService.searchTorrentsForMovie.mockResolvedValue({
      id: 1,
      imdbCode: 'tt1234567',
      title: 'Test Movie 1',
      titleLong: 'Test Movie 1 (2023)',
      year: 2023,
      rating: 7.5,
      runtime: 120,
      genres: ['Action', 'Drama'],
      summary: 'Test movie summary',
      language: 'en',
      coverImage: 'https://example.com/cover.jpg',
      backdropImage: 'https://example.com/backdrop.jpg',
      trailerCode: 'abcd1234',
      torrents: [
        {
          approximateBitrate: 2000,
          audioCodec: null,
          leechers: 10,
          magnetLink: 'magnet:?xt=urn:btih:abc123&dn=test',
          quality: '1080p',
          resolution: { width: 1920, height: 1080, label: 'FHD' },
          seeders: 100,
          size: { bytes: 1500000000, value: 1.5, unit: 'GB' },
          source: 'YTS',
          uploadDate: new Date('2023-01-01'),
          url: 'https://example.com/torrent1',
          videoCodec: VideoCodec.X264,
          type: 'WEB',
        },
        {
          approximateBitrate: 1500,
          audioCodec: null,
          leechers: 5,
          magnetLink: 'magnet:?xt=urn:btih:def456&dn=test',
          quality: '720p',
          resolution: { width: 1280, height: 720, label: 'HD' },
          seeders: 50,
          size: { bytes: 800000000, value: 800, unit: 'MB' },
          source: 'YTS',
          uploadDate: new Date('2023-01-02'),
          url: 'https://example.com/torrent2',
          videoCodec: VideoCodec.X264,
          type: 'BluRay',
        },
      ],
    });

    mockTrackerService.status.mockReturnValue({
      yts: {
        queue: 0,
        successes: [],
        failures: [],
        lastRequest: null,
      },
    });

    mockVpnService.isVpnActive.mockResolvedValue(true);
    mockVpnService.on.mockReturnValue(jest.fn());
    mockVpnService.status.mockReturnValue({ isVpnActive: true, disabled: false });

    mockMagnetService.getTorrent.mockResolvedValue(Buffer.from('mock torrent file'));
    mockMagnetService.getServiceStatistics.mockReturnValue({});
    mockMagnetService.getStats.mockResolvedValue({ seeders: 100, leechers: 10 });
    mockMagnetService.getAvailableConcurrency.mockReturnValue(2);
    mockMagnetService.isIdle.mockReturnValue(true);
    mockMagnetService.status.mockReturnValue({});

    // Create service instance
    service = new SourceService(
      mockDatabase,
      mockVpnService,
      mockTrackerService,
      mockMagnetService
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('searchSourcesForMovies', () => {
    it('should process movies without sources', async () => {
      mockTrackerService.searchTorrentsForMovie.mockRejectedValueOnce(new Error('Search failed'));
      await service.searchSourcesForMovies();

      expect(mockMovieRepository.findMoviesWithoutSources).toHaveBeenCalledTimes(1);
      expect(mockMovieRepository.findMoviesWithoutSources).toHaveBeenCalledWith(1);
      expect(mockTrackerService.searchTorrentsForMovie).toHaveBeenCalledTimes(2);
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
        expect(mockTrackerService.searchTorrentsForMovie).not.toHaveBeenCalled();
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
        expect(mockTrackerService.searchTorrentsForMovie).toHaveBeenCalledWith('tt1234567', true);
        expect(sources).toEqual([]);

        // Wait for the markSourceSearched call which happens without await
        await new Promise(resolve => setTimeout(resolve, 10));
        expect(mockMovieRepository.markSourceSearched).toHaveBeenCalledWith(1);
      });

      it('should pass high priority flag to tracker service', async () => {
        mockMovieSourceRepository.findByMovieId.mockResolvedValueOnce([]);

        const movie = { id: 1, imdbId: 'tt1234567', title: 'Test Movie', sourceSearched: false };
        await service.getSourcesForMovieWithOnDemandSearch(movie);

        expect(mockTrackerService.searchTorrentsForMovie).toHaveBeenCalledWith('tt1234567', true);
      });
    });

    describe('when search times out', () => {
      it('should return empty array but continue search in background', async () => {
        // Use real timers for timeout behavior
        jest.useRealTimers();

        mockMovieSourceRepository.findByMovieId.mockResolvedValueOnce([]);

        mockTrackerService.searchTorrentsForMovie.mockImplementation(() => {
          return new Promise(resolve => {
            setTimeout(
              () =>
                resolve({
                  id: 2,
                  imdbCode: 'tt-slow-search',
                  title: 'Slow Movie',
                  titleLong: 'Slow Movie (2023)',
                  year: 2023,
                  rating: 6.0,
                  runtime: 90,
                  genres: ['Drama'],
                  summary: 'Slow movie summary',
                  language: 'en',
                  coverImage: 'https://example.com/cover2.jpg',
                  backdropImage: 'https://example.com/backdrop2.jpg',
                  trailerCode: 'efgh5678',
                  torrents: [],
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
        expect(mockTrackerService.searchTorrentsForMovie).toHaveBeenCalledWith(
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
        mockTrackerService.searchTorrentsForMovie.mockImplementation(() => {
          return new Promise(resolve => {
            setTimeout(() => {
              searchResolved = true;
              resolve({
                id: 1,
                imdbCode: 'tt1234567',
                title: 'Test Movie',
                titleLong: 'Test Movie (2023)',
                year: 2023,
                rating: 7.5,
                runtime: 120,
                genres: ['Action'],
                summary: 'Test movie summary',
                language: 'en',
                coverImage: 'https://example.com/cover.jpg',
                backdropImage: 'https://example.com/backdrop.jpg',
                trailerCode: 'abcd1234',
                torrents: [],
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
        expect(mockTrackerService.searchTorrentsForMovie).not.toHaveBeenCalled();
        expect(mockMovieRepository.markSourceSearched).not.toHaveBeenCalled();
      });
    });

    describe('when search fails', () => {
      it('should handle errors gracefully and return empty array', async () => {
        mockMovieSourceRepository.findByMovieId.mockResolvedValueOnce([]);
        mockTrackerService.searchTorrentsForMovie.mockRejectedValue(new Error('Search failed'));

        const movie = { id: 1, imdbId: 'tt1234567', title: 'Test Movie', sourceSearched: false };

        const sources = await service.getSourcesForMovieWithOnDemandSearch(movie);

        expect(sources).toEqual([]);
        expect(mockTrackerService.searchTorrentsForMovie).toHaveBeenCalledWith('tt1234567', true);
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
      mockMagnetService.getStats.mockResolvedValueOnce({ seeders: 100, leechers: 10 });

      await service.syncStatsForSources();

      expect(mockMovieSourceRepository.findSourceThatNeedsStatsUpdate).toHaveBeenCalledWith(5);
      expect(mockMagnetService.getStats).toHaveBeenCalledWith('abc123');
      expect(mockMovieSourceRepository.updateStats).toHaveBeenCalledWith(
        1,
        100,
        10,
        expect.any(Date)
      );
    });

    it('should skip sources without torrent files', async () => {
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

      expect(mockMagnetService.getStats).not.toHaveBeenCalled();
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
      mockMagnetService.getStats.mockRejectedValueOnce(new Error('Stats fetch failed'));

      await service.syncStatsForSources();

      expect(mockMagnetService.getStats).toHaveBeenCalledWith('abc123');
      expect(mockMovieSourceRepository.updateStats).not.toHaveBeenCalled();
    });

    it('should skip when VPN is disconnected', async () => {
      mockVpnService.isVpnActive.mockResolvedValueOnce(false);

      const serviceWithoutVpn = new SourceService(
        mockDatabase,
        mockVpnService,
        mockTrackerService,
        mockMagnetService
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
      expect(mockTrackerService.searchTorrentsForMovie).toHaveBeenCalledWith('tt1234567');
    });

    it('should skip when no movies need processing', async () => {
      mockMovieSourceRepository.findMovieIdsWithUnknownSourceType.mockResolvedValueOnce([]);

      await service.resyncMovieSources();

      expect(mockMovieRepository.findMoviesByIdsWithImdb).not.toHaveBeenCalled();
      expect(mockTrackerService.searchTorrentsForMovie).not.toHaveBeenCalled();
    });

    it('should handle tracker service errors gracefully', async () => {
      const movie = { id: 1, imdbId: 'tt1234567', title: 'Test Movie' };
      mockMovieSourceRepository.findMovieIdsWithUnknownSourceType.mockResolvedValueOnce([
        1,
      ] as never[]);
      mockMovieRepository.findMoviesByIdsWithImdb.mockResolvedValueOnce([movie] as never[]);
      mockTrackerService.searchTorrentsForMovie.mockRejectedValueOnce(new Error('Resync failed'));

      await service.resyncMovieSources();

      expect(mockTrackerService.searchTorrentsForMovie).toHaveBeenCalledWith('tt1234567');
      // Should not throw - error is handled internally
    });

    it('should skip when VPN is disconnected', async () => {
      mockVpnService.isVpnActive.mockResolvedValueOnce(false);

      const serviceWithoutVpn = new SourceService(
        mockDatabase,
        mockVpnService,
        mockTrackerService,
        mockMagnetService
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
        mockTrackerService,
        mockMagnetService
      );

      await serviceWithoutVpn.searchSourcesForMovies();

      expect(mockMovieRepository.findMoviesWithoutSources).not.toHaveBeenCalled();
      expect(mockTrackerService.searchTorrentsForMovie).not.toHaveBeenCalled();
    });

    it('should register VPN connection event handlers', async () => {
      new SourceService(mockDatabase, mockVpnService, mockTrackerService, mockMagnetService);

      expect(mockVpnService.on).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(mockVpnService.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
    });
  });
});
