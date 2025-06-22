import type { ImdbDetailPost } from './therarbg.types';
import { filterTorrents, validateImdbId } from './therarbg.utils';

describe('TheRarBG Utils', () => {
  describe('validateImdbId', () => {
    it('should validate and normalize proper IMDB IDs', () => {
      expect(validateImdbId('tt0111161')).toEqual({
        isValid: true,
        normalizedId: 'tt0111161',
      });

      expect(validateImdbId('0111161')).toEqual({
        isValid: true,
        normalizedId: 'tt0111161',
      });

      expect(validateImdbId('12345678')).toEqual({
        isValid: true,
        normalizedId: 'tt12345678',
      });
    });

    it('should extract IMDB ID from URLs', () => {
      expect(validateImdbId('https://www.imdb.com/title/tt0111161/')).toEqual({
        isValid: true,
        normalizedId: 'tt0111161',
      });
    });

    it('should reject invalid IMDB IDs', () => {
      expect(validateImdbId('invalid')).toEqual({
        isValid: false,
        error: 'Invalid IMDB ID format',
      });

      expect(validateImdbId('')).toEqual({
        isValid: false,
        error: 'IMDB ID is required',
      });

      expect(validateImdbId('12345')).toEqual({
        isValid: false,
        error: 'Invalid IMDB ID format',
      });
    });

    it('should handle null and undefined values', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(validateImdbId(null as any)).toEqual({
        isValid: false,
        error: 'IMDB ID is required',
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(validateImdbId(undefined as any)).toEqual({
        isValid: false,
        error: 'IMDB ID is required',
      });
    });
  });

  describe('filterTorrents', () => {
    const createMockTorrent = (overrides: Partial<ImdbDetailPost>): ImdbDetailPost => ({
      eid: 'test',
      pid: 1,
      category: 14,
      category_str: 'Movies',
      type: 'HD',
      genre: [],
      status: null,
      name: 'Test Movie 1080p',
      short_name: null,
      num_files: 1,
      size: 2147483648, // 2GB
      size_char: '2.0 GB',
      thumbnail: null,
      seeders: 10,
      leechers: 2,
      username: 'testuser',
      downloads: 100,
      added: 1640995200,
      descr: null,
      imdb: 'tt0111161',
      language: 'English',
      info_hash: 'TESTHASH',
      textlanguage: null,
      trailer: null,
      season: 0,
      episode: 0,
      timestamp: '2023-01-01T00:00:00Z',
      last_checked: '2023-01-01T00:00:00Z',
      files: [],
      trackers: [],
      has_torrent: true,
      images: [],
      is_recomended: false,
      source: '1',
      source_list: [],
      extra_data: { pending_torrent: false },
      upvotes: 0,
      downvotes: 0,
      report_count: 0,
      comment_count: 0,
      imdb_data: 123,
      ...overrides,
    });

    it('should filter out torrents without torrent files', () => {
      const torrents = [
        createMockTorrent({ has_torrent: true, seeders: 10, size: 2147483648 }),
        createMockTorrent({ has_torrent: false, seeders: 10, size: 2147483648 }),
      ];

      const filtered = filterTorrents(torrents);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].has_torrent).toBe(true);
    });

    it('should filter out torrents with insufficient seeders', () => {
      const torrents = [
        createMockTorrent({ has_torrent: true, seeders: 5, size: 2147483648 }),
        createMockTorrent({ has_torrent: true, seeders: 1, size: 2147483648 }),
      ];

      const filtered = filterTorrents(torrents);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].seeders).toBe(5);
    });

    it('should filter out torrents that are too small', () => {
      const torrents = [
        createMockTorrent({ has_torrent: true, seeders: 10, size: 2147483648 }), // 2GB
        createMockTorrent({ has_torrent: true, seeders: 10, size: 52428800 }), // 50MB
      ];

      const filtered = filterTorrents(torrents);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].size).toBe(2147483648);
    });

    it('should return empty array when no torrents meet criteria', () => {
      const torrents = [createMockTorrent({ has_torrent: false, seeders: 1, size: 104857600 })];

      const filtered = filterTorrents(torrents);
      expect(filtered).toHaveLength(0);
    });
  });
});
