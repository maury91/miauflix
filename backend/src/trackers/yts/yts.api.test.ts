import { MockCache } from '@__test-utils__/cache.mock';

import { YTSApi } from './yts.api';

const imdbId = 'tt29623480';

describe('YTSApi', () => {
  let api: YTSApi;

  beforeEach(() => {
    // Create a minimal mock cache with just the required methods
    const mockCache = new MockCache();

    api = new YTSApi(mockCache);
  });

  describe('test', () => {
    it('should return true when the API is available', async () => {
      const result = await api.test();
      expect(result).toBe(true);
    });
  });

  describe('searchMovies', () => {
    it('should search movies by IMDb ID', async () => {
      const result = await api.searchMovies(imdbId);
      expect(result.status).toBe('ok');
      expect(result.data.movie_count).toBe(1);
      expect(result.data.movies).toHaveLength(1);

      const movie = result.data.movies[0];
      expect(movie.imdb_code).toBe(imdbId);
      expect(typeof movie.title).toBe('string');
      expect(movie.year).toBeGreaterThan(2000);
      expect(Array.isArray(movie.torrents)).toBe(true);
      expect(movie.torrents.length).toBeGreaterThan(0);
    });

    it('should handle invalid IMDb ID', async () => {
      const result = await api.searchMovies('invalid-id');
      expect(result.status).toBe('ok');
      expect(result.data.movie_count).toBe(0);

      expect(result.data.movies === undefined || Array.isArray(result.data.movies)).toBe(true);
    });
  });

  describe('getMovieByImdbId', () => {
    it('should fetch movie details by IMDb ID', async () => {
      const result = await api.getMovieByImdbId(imdbId);
      expect(result.status).toBe('ok');
      expect(result.data.movie.imdb_code).toBe(imdbId);
      expect(typeof result.data.movie.title).toBe('string');
      expect(result.data.movie.year).toBeGreaterThan(2000);
    });
  });

  describe('getLatestMovies', () => {
    it('should fetch latest movies', async () => {
      const result = await api.getLatestMovies(1, 5);
      expect(result.status).toBe('ok');
      expect(result.data.movies.length).toBeLessThanOrEqual(5);
      expect(result.data.movie_count).toBeGreaterThan(0);

      result.data.movies.forEach(movie => {
        expect(movie.id).toBeDefined();
        expect(movie.title).toBeDefined();
        expect(movie.year).toBeDefined();
        expect(Array.isArray(movie.torrents)).toBe(true);
      });
    });
  });

  describe('getMovieWithTorrents', () => {
    it('should fetch movie with normalized torrents', async () => {
      const result = await api.getMovieWithTorrents(imdbId);
      expect(result).not.toBeNull();

      if (result) {
        expect(result.imdbCode).toBe(imdbId);
        expect(typeof result.title).toBe('string');
        expect(Array.isArray(result.torrents)).toBe(true);
        expect(result.torrents.length).toBeGreaterThan(0);

        const torrent = result.torrents[0];
        expect(torrent.quality).toBeDefined();
        expect(torrent.resolution).toBeDefined();
        expect(torrent.videoCodec).toBeDefined();
        expect(torrent.size).toBeDefined();
        expect(torrent.magnetLink.startsWith('magnet:?xt=urn:btih:')).toBe(true);
      }
    });

    it('should return null for invalid IMDb ID', async () => {
      const result = await api.getMovieWithTorrents('invalid-id');
      expect(result).toBeNull();
    });
  });

  describe('createMagnetLink', () => {
    it('should create a valid magnet link', () => {
      const hash = '8D3655452B7C8E1B5155F92176D106D911F38E59';
      const title = 'The Wild Robot 2024';

      const magnetLink = api.createMagnetLink(hash, title);

      // Check if the magnet link contains the hash and encoded title
      expect(magnetLink).toContain(`magnet:?xt=urn:btih:${hash}`);
      expect(magnetLink).toContain(`&dn=${encodeURIComponent(title)}`);

      // Check if the magnet link contains some trackers
      expect(magnetLink).toContain('&tr=');
      expect(magnetLink).toContain('tracker');
    });
  });
});
