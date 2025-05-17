import { beforeEach, describe, expect, it, mock } from 'bun:test';

import type { Database } from '@database/database';
import type { VpnDetectionService } from '@services/security/vpn.service';

import { SourceService } from './source.service';

// Create mock repositories and DB
const mockMovieRepository = {
  findMoviesWithoutSources: mock(() =>
    Promise.resolve([
      { id: 1, imdbId: 'tt1234567', title: 'Test Movie 1' },
      { id: 2, imdbId: 'tt7654321', title: 'Test Movie 2' },
      { id: 3, imdbId: null, title: 'Test Movie Without IMDb ID' },
    ])
  ),
  markSourceSearched: mock(() => Promise.resolve(undefined)),
};

const mockMovieSourceRepository = {
  createMany: mock(() =>
    Promise.resolve([
      { id: 1, movieId: 1 },
      { id: 2, movieId: 1 },
    ])
  ),
  findByMovieId: mock(() =>
    Promise.resolve([
      { id: 1, movieId: 1, hash: 'abc123', quality: '1080p' },
      { id: 2, movieId: 1, hash: 'def456', quality: '720p' },
    ])
  ),
};

const mockTrackerService = {
  searchTorrentsForMovie: mock((imdbId: string) => {
    if (imdbId === 'tt1234567') {
      return Promise.resolve({
        title: 'Test Movie 1',
        torrents: [
          {
            magnetLink: 'magnet:?xt=urn:btih:abc123',
            quality: '1080p',
            resolution: { height: 1080, width: 1920, label: 'FHD' },
            size: { bytes: 1500000000, value: 1.5, unit: 'GB' },
            videoCodec: 'x264',
            seeders: 100,
            leechers: 10,
          },
          {
            magnetLink: 'magnet:?xt=urn:btih:def456',
            quality: '720p',
            resolution: { height: 720, width: 1280, label: 'HD' },
            size: { bytes: 800000000, value: 800, unit: 'MB' },
            videoCodec: 'x264',
            seeders: 50,
            leechers: 5,
          },
        ],
      });
    } else if (imdbId === 'tt7654321') {
      return Promise.resolve(null); // No torrents found
    } else {
      return Promise.reject(new Error('Failed to search torrents'));
    }
  }),
  // Add missing properties from TrackerService
  ytsApi: { status: () => ({ ok: true }) },
  status: () => ({ yts: { ok: true } }),
};

// Create mock VPN service
const mockVpnService = {
  isVpnActive: mock(() => Promise.resolve(true)),
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  on: mock((event: string, callback: () => void) => {
    /* Do nothing */
  }),
  status: mock(() => ({ connected: true })),
} as unknown as VpnDetectionService;

// Create a mock database
const mockDatabase = {
  getMovieRepository: () => mockMovieRepository,
  getMovieSourceRepository: () => mockMovieSourceRepository,
} as unknown as Database;

describe('MovieSourceService', () => {
  let service: SourceService;

  beforeEach(() => {
    // Reset mock call counts
    mockMovieRepository.findMoviesWithoutSources.mockClear();
    mockMovieRepository.markSourceSearched.mockClear();
    mockMovieSourceRepository.createMany.mockClear();
    mockMovieSourceRepository.findByMovieId.mockClear();
    mockTrackerService.searchTorrentsForMovie.mockClear();

    // Create service instance with direct injection of the mock tracker service
    service = new SourceService(mockDatabase, mockVpnService, mockTrackerService);
  });

  describe('searchSourcesForMovies', () => {
    it('should process movies without sources', async () => {
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
});
