/**
 * Tests for YTS sanitizer
 */

import { sanitize, sanitizeMovie, sanitizeTorrent } from './sanitizer';
import { clearCache } from './utils';
import type { YTSMovie, YTSTorrent, YTSMovieListResponse } from './types';

describe('YTS Sanitizer', () => {
  beforeEach(() => {
    clearCache();
  });

  describe('sanitizeMovie', () => {
    it('should sanitize movie titles', () => {
      const movie: YTSMovie = {
        id: 123,
        url: 'https://yts.mx/movie/123',
        imdb_code: 'tt1234567',
        title: 'Original Movie Title',
        title_english: 'Original English Title',
        title_long: 'Original Movie Title (2024)',
        slug: 'original-movie-title-2024',
        year: 2024,
        rating: 7.5,
        runtime: 120,
        genres: ['Action', 'Drama'],
        summary: 'Original summary',
        description_full: 'Original description',
        synopsis: 'Original synopsis',
        yt_trailer_code: 'dQw4w9WgXcQ',
        language: 'English',
        mpa_rating: 'PG-13',
        background_image: 'https://yts.mx/assets/images/bg.jpg',
        background_image_original: 'https://yts.mx/assets/images/bg_orig.jpg',
        torrents: [],
        date_uploaded: '2024-01-01 12:00:00',
        date_uploaded_unix: 1704110400,
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
        url: 'https://yts.mx/movie/123',
        imdb_code: 'tt1234567',
        title: 'Original Movie Title',
        title_english: 'Original English Title',
        title_long: 'Original Movie Title (2024)',
        slug: 'original-movie-title-2024',
        year: 2024,
        rating: 7.5,
        runtime: 120,
        genres: ['Action', 'Drama'],
        summary: 'Original summary',
        description_full: 'Original description',
        synopsis: 'Original synopsis',
        yt_trailer_code: 'dQw4w9WgXcQ',
        language: 'English',
        mpa_rating: 'PG-13',
        background_image: 'https://yts.mx/assets/images/bg.jpg',
        background_image_original: 'https://yts.mx/assets/images/bg_orig.jpg',
        torrents: [],
        date_uploaded: '2024-01-01 12:00:00',
        date_uploaded_unix: 1704110400,
      };

      const sanitized = sanitizeMovie(movie);

      expect(sanitized.imdb_code).not.toBe(movie.imdb_code);
      expect(sanitized.imdb_code).toMatch(/^tt\d{8}$/);
    });

    it('should sanitize URLs', () => {
      const movie: YTSMovie = {
        id: 123,
        url: 'https://yts.mx/movies/original-movie-2024',
        imdb_code: 'tt1234567',
        title: 'Original Movie Title',
        title_english: 'Original English Title',
        title_long: 'Original Movie Title (2024)',
        slug: 'original-movie-title-2024',
        year: 2024,
        rating: 7.5,
        runtime: 120,
        genres: ['Action', 'Drama'],
        summary: 'Original summary',
        description_full: 'Original description',
        synopsis: 'Original synopsis',
        yt_trailer_code: 'dQw4w9WgXcQ',
        language: 'English',
        mpa_rating: 'PG-13',
        background_image: 'https://yts.mx/assets/images/bg.jpg',
        background_image_original: 'https://yts.mx/assets/images/bg_orig.jpg',
        torrents: [],
        date_uploaded: '2024-01-01 12:00:00',
        date_uploaded_unix: 1704110400,
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
        url: 'https://yts.mx/movie/123',
        imdb_code: 'tt1234567',
        title: 'Original Title',
        title_english: 'Original English Title',
        title_long: 'Original Title (2024)',
        slug: 'original-title-2024',
        year: 2024,
        rating: 7.5,
        runtime: 120,
        genres: ['Action'],
        summary: 'Original summary',
        description_full: 'Original description',
        synopsis: 'Original synopsis',
        yt_trailer_code: 'dQw4w9WgXcQ',
        language: 'English',
        mpa_rating: 'PG-13',
        background_image: 'https://yts.mx/assets/images/bg.jpg',
        background_image_original: 'https://yts.mx/assets/images/bg_orig.jpg',
        torrents: [],
        date_uploaded: '2024-01-01 12:00:00',
        date_uploaded_unix: 1704110400,
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

      const sanitized = sanitizeTorrent(torrent, {}, new Set<string>());

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

      const sanitized = sanitizeTorrent(torrent, {}, new Set<string>());

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
        status_message: 'Query was successful',
        data: {
          movie_count: 100,
          limit: 20,
          page_number: 1,
          movies: [
            {
              id: 1,
              url: 'https://yts.mx/movie/1',
              imdb_code: 'tt1111111',
              title: 'Movie 1',
              title_english: 'Movie 1',
              title_long: 'Movie 1 (2024)',
              slug: 'movie-1-2024',
              year: 2024,
              rating: 7.0,
              runtime: 90,
              genres: ['Action'],
              summary: 'Movie 1 summary',
              description_full: 'Movie 1 description',
              synopsis: 'Movie 1 synopsis',
              yt_trailer_code: 'trailer1',
              language: 'English',
              mpa_rating: 'PG-13',
              background_image: 'https://yts.mx/bg1.jpg',
              background_image_original: 'https://yts.mx/bg1_orig.jpg',
              torrents: [],
              date_uploaded: '2024-01-01 12:00:00',
              date_uploaded_unix: 1704110400,
            },
            {
              id: 2,
              url: 'https://yts.mx/movie/2',
              imdb_code: 'tt2222222',
              title: 'Movie 2',
              title_english: 'Movie 2',
              title_long: 'Movie 2 (2024)',
              slug: 'movie-2-2024',
              year: 2024,
              rating: 8.0,
              runtime: 120,
              genres: ['Drama'],
              summary: 'Movie 2 summary',
              description_full: 'Movie 2 description',
              synopsis: 'Movie 2 synopsis',
              yt_trailer_code: 'trailer2',
              language: 'English',
              mpa_rating: 'R',
              background_image: 'https://yts.mx/bg2.jpg',
              background_image_original: 'https://yts.mx/bg2_orig.jpg',
              torrents: [],
              date_uploaded: '2024-01-02 12:00:00',
              date_uploaded_unix: 1704196800,
            },
          ],
        },
        '@meta': {
          server_time: 1704110400,
          server_timezone: 'UTC',
          api_version: 2,
          execution_time: '0.01 ms',
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
        status_message: 'Query was successful',
        data: {
          movie_count: 100,
          limit: 20,
          page_number: 1,
          movies: Array.from({ length: 10 }, (_, i) => ({
            id: i + 1,
            url: `https://yts.mx/movie/${i + 1}`,
            imdb_code: `tt${(i + 1).toString().padStart(7, '0')}`,
            title: `Movie ${i + 1}`,
            title_english: `Movie ${i + 1}`,
            title_long: `Movie ${i + 1} (2024)`,
            slug: `movie-${i + 1}-2024`,
            year: 2024,
            rating: 7.0 + i * 0.1,
            runtime: 90 + i * 10,
            genres: ['Action'],
            summary: `Movie ${i + 1} summary`,
            description_full: `Movie ${i + 1} description`,
            synopsis: `Movie ${i + 1} synopsis`,
            yt_trailer_code: `trailer${i + 1}`,
            language: 'English',
            mpa_rating: 'PG-13',
            background_image: `https://yts.mx/bg${i + 1}.jpg`,
            background_image_original: `https://yts.mx/bg${i + 1}_orig.jpg`,
            torrents: [],
            date_uploaded: '2024-01-01 12:00:00',
            date_uploaded_unix: 1704110400,
          })),
        },
        '@meta': {
          server_time: 1704110400,
          server_timezone: 'UTC',
          api_version: 2,
          execution_time: '0.01 ms',
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
