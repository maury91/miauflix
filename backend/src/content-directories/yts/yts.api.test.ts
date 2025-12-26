import { MockCache } from '@__test-utils__/cache.mock';

import { RequestService } from '@services/request/request.service';

import { YTSApi } from './yts.api';

const imdbId = 'tt29623480';

describe('YTSApi', () => {
  let api: YTSApi;
  let requestService: RequestService;

  beforeEach(() => {
    // Create a minimal mock cache with just the required methods
    const mockCache = new MockCache();

    requestService = new RequestService();

    api = new YTSApi(mockCache, requestService);
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
      expect(movie.imdb_code).toBe('tt34802706'); // Sanitized IMDB code
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
      expect(result.data.movie.imdb_code).toBe('tt34802706'); // Sanitized IMDB code
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
});
