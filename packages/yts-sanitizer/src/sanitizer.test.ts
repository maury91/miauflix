/**
 * Tests for YTS sanitizer
 */

import { sanitize, sanitizeMovie, sanitizeTorrent } from './sanitizer.js';
import { clearCache } from './utils.js';
import type { YTSMovie, YTSTorrent, YTSMovieListResponse } from './types.js';

describe('YTS Sanitizer', () => {
  beforeEach(() => {
    clearCache();
  });

  describe('sanitizeMovie', () => {
    it('should sanitize movie titles', () => {
      const movie: YTSMovie = {
        id: 123,
        title: 'Original Movie Title',
        title_english: 'Original English Title',
      };

      const sanitized = sanitizeMovie(movie);

      expect(sanitized.title).not.toBe(movie.title);
      expect(sanitized.title_english).not.toBe(movie.title_english);
      expect(sanitized.title).toBeTruthy();
      expect(sanitized.title_english).toBeTruthy();
    });

    it('should sanitize IMDB codes', () => {
      const movie: YTSMovie = {
        id: 123,
        imdb_code: 'tt1234567',
      };

      const sanitized = sanitizeMovie(movie);

      expect(sanitized.imdb_code).not.toBe(movie.imdb_code);
      expect(sanitized.imdb_code).toMatch(/^tt\d{8}$/);
    });

    it('should sanitize URLs', () => {
      const movie: YTSMovie = {
        id: 123,
        url: 'https://yts.mx/movies/original-movie-2024',
        background_image: 'https://yts.mx/assets/images/bg.jpg',
      };

      const sanitized = sanitizeMovie(movie);

      expect(sanitized.url).not.toBe(movie.url);
      expect(sanitized.background_image).not.toBe(movie.background_image);
      expect(sanitized.url).toMatch(/^https:\/\//);
      expect(sanitized.background_image).toMatch(/^https:\/\//);
    });

    it('should generate consistent results for same ID', () => {
      const movie: YTSMovie = {
        id: 123,
        title: 'Original Title',
      };

      const sanitized1 = sanitizeMovie(movie);
      const sanitized2 = sanitizeMovie(movie);

      expect(sanitized1.title).toBe(sanitized2.title);
    });
  });

  describe('sanitizeTorrent', () => {
    it('should sanitize torrent hashes', () => {
      const torrent: YTSTorrent = {
        hash: '1234567890ABCDEF1234567890ABCDEF12345678',
        url: 'https://yts.mx/torrent/download/1234567890ABCDEF1234567890ABCDEF12345678',
      };

      const sanitized = sanitizeTorrent(torrent);

      expect(sanitized.hash).not.toBe(torrent.hash);
      expect(sanitized.hash).toMatch(/^[A-F0-9]{40}$/);
      expect(sanitized.url).toContain(sanitized.hash);
    });

    it('should preserve other torrent properties', () => {
      const torrent: YTSTorrent = {
        hash: '1234567890ABCDEF1234567890ABCDEF12345678',
        quality: '1080p',
        seeds: 100,
        peers: 50,
        size: '2.1 GB',
      };

      const sanitized = sanitizeTorrent(torrent);

      expect(sanitized.quality).toBe(torrent.quality);
      expect(sanitized.seeds).toBe(torrent.seeds);
      expect(sanitized.peers).toBe(torrent.peers);
      expect(sanitized.size).toBe(torrent.size);
    });
  });

  describe('sanitize', () => {
    it('should sanitize movie list response', () => {
      const response: YTSMovieListResponse = {
        status: 'ok',
        data: {
          movie_count: 100,
          movies: [
            {
              id: 1,
              title: 'Movie 1',
              imdb_code: 'tt1111111',
            },
            {
              id: 2,
              title: 'Movie 2',
              imdb_code: 'tt2222222',
            },
          ],
        },
      };

      const sanitized = sanitize(response);

      expect(sanitized.status).toBe('ok');
      expect(sanitized.data?.movies).toHaveLength(2);
      expect(sanitized.data?.movies?.[0]?.title).not.toBe('Movie 1');
      expect(sanitized.data?.movies?.[1]?.title).not.toBe('Movie 2');
    });

    it('should limit movie count when maxMovies option is provided', () => {
      const response: YTSMovieListResponse = {
        status: 'ok',
        data: {
          movie_count: 100,
          movies: Array.from({ length: 10 }, (_, i) => ({
            id: i + 1,
            title: `Movie ${i + 1}`,
          })),
        },
      };

      const sanitized = sanitize(response, undefined, { maxMovies: 5 });

      expect(sanitized.data?.movies).toHaveLength(5);
      expect(sanitized.data?.movie_count).toBe(5);
    });

    it('should handle single movie response', () => {
      const response = {
        status: 'ok',
        data: {
          movie: {
            id: 123,
            title: 'Single Movie',
            imdb_code: 'tt1234567',
          },
        },
      };

      const sanitized = sanitize(response);

      expect(sanitized.status).toBe('ok');
      expect(sanitized.data?.movie?.title).not.toBe('Single Movie');
      expect(sanitized.data?.movie?.imdb_code).not.toBe('tt1234567');
    });

    it('should return data unchanged for unrecognized formats', () => {
      const data = { some: 'unknown', format: true };
      const sanitized = sanitize(data);
      expect(sanitized).toEqual(data);
    });
  });
});
