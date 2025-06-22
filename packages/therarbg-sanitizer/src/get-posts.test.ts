import { sanitize } from './sanitizer';
import type { GetPostsResponse } from './types';

describe('Get-Posts Sanitization', () => {
  const mockGetPostsResponse: GetPostsResponse = {
    links: {
      next: 'https://therarbg.to/get-posts/keywords:tt1234567:ncategory:XXX:time:30D?format=json&page=2',
      previous: null,
    },
    page_size: 50,
    count: 3,
    total: 132,
    results: [
      {
        pk: '86519e',
        n: 'Clay Adventures A Grand Day Out 1989 UHD BluRay 2160p DTS HD MA',
        a: 1750590679,
        c: 'Movies',
        s: 16106127360,
        t: null,
        u: 'CptCrunchzz',
        se: 2,
        le: 8,
        i: 'tt9876543',
        h: '96CC81A2FB71970A3AD4713DCD6A943582AC9F8C',
        tg: ['DTS', 'TS', '4K', 'BluRay'],
      },
      {
        pk: '8785e9',
        n: 'Video Editor Pro 2020 v14.0.3.1 (x64) (Activated) (B4tman)',
        a: 1748658446,
        c: 'Apps',
        s: 1687082972,
        t: null,
        u: 'Anonymous',
        se: 19732,
        le: 13164,
        i: null,
        h: 'B31464420D719F527AAC8E48C9DBCFE02B0B229C',
        tg: [],
      },
    ],
  };

  const mockHttpVcrWrappedResponse = {
    status: 200,
    statusText: 'OK',
    headers: {
      'content-type': 'application/json',
    },
    body: mockGetPostsResponse,
    bodyIsJson: true,
  };

  describe('get-posts response detection', () => {
    it('should detect get-posts responses correctly', () => {
      const result = sanitize(mockGetPostsResponse);

      expect(result).toHaveProperty('results');
      expect(result).toHaveProperty('page_size');
      expect(result).toHaveProperty('links');
      expect(Array.isArray(result.results)).toBe(true);
    });

    it('should detect HTTP-VCR wrapped get-posts responses', () => {
      const result = sanitize(mockHttpVcrWrappedResponse);

      expect(result).toHaveProperty('body');
      expect(result.body).toHaveProperty('results');
      expect(Array.isArray(result.body.results)).toBe(true);
    });
  });

  describe('mixed content type handling', () => {
    it('should sanitize Movie content with IMDB-based logic', () => {
      const result = sanitize(mockGetPostsResponse);
      const movieResult = result.results[0];

      // Movie title should be sanitized
      expect(movieResult.n).not.toBe(
        'Clay Adventures A Grand Day Out 1989 UHD BluRay 2160p DTS HD MA'
      );
      expect(movieResult.n).toMatch(/\d{4}/); // Should preserve year
      expect(movieResult.n).toMatch(/(BluRay|UHD|2160p|DTS)/i); // Should preserve technical metadata

      // IMDB ID should be replaced with fake one
      expect(movieResult.i).not.toBe('tt9876543');
      expect(movieResult.i).toMatch(/^tt\d{7}$/);

      // Hash should be replaced
      expect(movieResult.h).not.toBe('96CC81A2FB71970A3AD4713DCD6A943582AC9F8C');
      expect(movieResult.h).toMatch(/^[A-F0-9]{40}$/);
    });

    it('should sanitize App content with generic logic', () => {
      const result = sanitize(mockGetPostsResponse);
      const appResult = result.results[1];

      // App name should be sanitized to generic app name
      expect(appResult.n).not.toBe('Video Editor Pro 2020 v14.0.3.1 (x64) (Activated) (B4tman)');
      expect(appResult.n).toMatch(/\d+\.\d+$/); // Should end with version number

      // IMDB ID should be null for apps
      expect(appResult.i).toBeNull();

      // Hash should be replaced with fake hash
      expect(appResult.h).not.toBe('B31464420D719F527AAC8E48C9DBCFE02B0B229C');
      expect(appResult.h).toMatch(/^[A-F0-9]{40}$/);
    });
  });

  describe('pagination and metadata handling', () => {
    it('should preserve pagination structure', () => {
      const result = sanitize(mockGetPostsResponse);

      expect(result.page_size).toBe(50);
      expect(result.count).toBe(3);
      expect(result.total).toBe(132);
      expect(result.links).toHaveProperty('next');
      expect(result.links).toHaveProperty('previous');
    });

    it('should preserve pagination URLs unchanged', () => {
      const result = sanitize(mockGetPostsResponse);

      expect(result.links.next).toBe(mockGetPostsResponse.links.next);
      expect(result.links.previous).toBe(mockGetPostsResponse.links.previous);
    });
  });

  describe('maxTorrents limiting', () => {
    it('should limit results when maxTorrents is specified', () => {
      const result = sanitize(mockGetPostsResponse, undefined, { maxTorrents: 1 });

      expect(result.results).toHaveLength(1);
      expect(result.count).toBe(1); // Should update count
      expect(result.total).toBe(1); // Should update total
    });
  });

  describe('deterministic results', () => {
    it('should produce consistent results for same input', () => {
      const result1 = sanitize(mockGetPostsResponse);
      const result2 = sanitize(mockGetPostsResponse);

      expect(result1.results[0].n).toBe(result2.results[0].n);
      expect(result1.results[0].h).toBe(result2.results[0].h);
      expect(result1.results[0].i).toBe(result2.results[0].i);
    });
  });

  describe('username sanitization', () => {
    it('should sanitize uploader usernames', () => {
      const result = sanitize(mockGetPostsResponse);

      expect(result.results[0].u).not.toBe('CptCrunchzz');
      expect(result.results[1].u).not.toBe('Anonymous');

      // Should be realistic names
      expect(result.results[0].u).toMatch(/^[A-Za-z\s.-]+$/);
      expect(result.results[1].u).toMatch(/^[A-Za-z\s.-]+$/);
    });
  });

  describe('preserveImdbId option', () => {
    it('should preserve IMDB IDs when preserveImdbId option is true', () => {
      const result = sanitize(mockGetPostsResponse, undefined, {
        preserveImdbId: true,
      });

      // IMDB ID should be preserved for Movie content
      expect(result.results[0].i).toBe('tt9876543');

      // App content should still have null IMDB ID
      expect(result.results[1].i).toBeNull();
    });

    it('should generate fake IMDB IDs when preserveImdbId option is false', () => {
      const result = sanitize(mockGetPostsResponse, undefined, {
        preserveImdbId: false,
      });

      // IMDB ID should be different (fake) for Movie content
      expect(result.results[0].i).not.toBe('tt9876543');
      expect(result.results[0].i).toMatch(/^tt\d+$/); // Should still be valid IMDB format

      // App content should still have null IMDB ID
      expect(result.results[1].i).toBeNull();
    });

    it('should generate fake IMDB IDs by default when option is not specified', () => {
      const result = sanitize(mockGetPostsResponse);

      // Without preserveImdbId option, it should default to generating fake IDs (preserveImdbId: false)
      expect(result.results[0].i).not.toBe('tt9876543');
      expect(result.results[0].i).toMatch(/^tt\d+$/);
    });
  });
});
