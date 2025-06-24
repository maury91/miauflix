import { sanitize, sanitizeImdbData, sanitizePost, sanitizeImdbDetail } from './sanitizer';
import { shouldUseLegalHash, getLegalHashMetadata } from './utils';
import type { TheRARBGImdbData, TheRARBGPost, SanitizationOptions } from './types';

describe('Sanitizer Functions', () => {
  // Mock data for testing
  const mockImdbData: TheRARBGImdbData = {
    imdb_id: 'tt0111161',
    tmdb_id: 278,
    name: 'The Cosmic Adventure',
    content_type: 'Movie',
    plot: 'A group of space explorers discover a mysterious planet with ancient secrets that could change the fate of humanity.',
    actors: ['Alex Thompson', 'Sarah Mitchell', 'Robert Chen'],
    directors: ['Maria Rodriguez'],
    director: 'Maria Rodriguez',
    cast: 'Alex Thompson, Sarah Mitchell, Robert Chen, David Wilson',
    top_credits: [
      {
        id: 'director1',
        name: 'Director',
        credits: ['Maria Rodriguez'],
      },
      {
        id: 'stars1',
        name: 'Stars',
        credits: ['Alex Thompson', 'Sarah Mitchell'],
      },
    ],
    thumbnail: 'https://example.com/thumb.jpg',
    image: 'https://example.com/poster.jpg',
    rott_url: 'https://rottentomatoes.com/movie',
    video_list: [
      { key: 'dQw4w9WgXcQ', site: 'YouTube' },
      { key: 'abc123def456', site: 'YouTube' },
    ],
    rating: '8.5',
    genre_list: ['Sci-Fi'],
    genre: 'Sci-Fi',
    theme_list: ['Space', 'Adventure'],
    release_detailed: {
      day: 15,
      date: '2023-06-15',
      year: 2023,
      month: 6,
      originLocations: [{ cca2: 'US', country: 'United States' }],
      releaseLocation: { cca2: 'US', country: 'United States' },
    },
    spoken_languages: [{ id: 'en', language: 'English' }],
    runtime: '128 min',
    rating_count: 125000,
    budget: 45000000,
    rott_score_official: 85,
    rott_score_audience: 92,
    mpa_rating: 'PG-13',
    critics_consensus: 'The Cosmic Adventure delivers stunning visuals and an engaging storyline.',
    is_recomended: true,
    has_post: true,
    updated_at: '2023-01-01T00:00:00Z',
    created_at: '2023-01-01T00:00:00Z',
  };

  const mockPost: TheRARBGPost = {
    eid: 'e12345',
    pid: 12345,
    name: 'The.Cosmic.Adventure.2023.1080p.BluRay.x264-GROUP',
    short_name: 'The Cosmic Adventure (2023)',
    imdb: 'tt0111161',
    info_hash: 'ABCDEF1234567890ABCDEF1234567890ABCDEF12',
    username: 'uploader123',
    size: 2147483648,
    seeders: 100,
    leechers: 10,
    thumbnail: 'https://example.com/torrent-thumb.jpg',
    descr: 'High quality rip of The Cosmic Adventure with excellent video and audio.',
    files: [
      {
        name: 'The.Cosmic.Adventure.2023.1080p.BluRay.x264-GROUP.mkv',
        size: 2000000000,
        full_location: '/movies/The.Cosmic.Adventure.2023.1080p.BluRay.x264-GROUP.mkv',
      },
      {
        name: 'sample.mkv',
        size: 50000000,
        full_location: '/movies/sample.mkv',
      },
    ],
    images: ['https://example.com/screenshot1.jpg', 'https://example.com/screenshot2.jpg'],
    category: 'Movies',
    category_str: 'Movies',
    type: 'movie',
    genre: ['Sci-Fi'],
    status: 'active',
    num_files: 2,
    size_char: '2.0 GB',
    downloads: 5000,
    added: 1672531200,
    language: 'en',
    textlanguage: 'English',
    trailer: null,
    season: 0,
    episode: 0,
    timestamp: '2023-01-01T00:00:00Z',
    last_checked: '2023-01-01T00:00:00Z',
    trackers: [
      {
        seeders: 100,
        tracker: 'udp://tracker.example.com:80',
        leechers: 10,
        completed: 5000,
        scrape_error: null,
      },
    ],
    has_torrent: true,
    is_recomended: true,
    source: 'TheRARBG',
    source_list: ['TheRARBG'],
    extra_data: { pending_torrent: false },
    upvotes: 150,
    downvotes: 5,
    report_count: 0,
    comment_count: 25,
    imdb_data: 1,
  };

  describe('sanitizeImdbData', () => {
    it('should sanitize all IMDB data fields', () => {
      const result = sanitizeImdbData(mockImdbData);

      // Should change sensitive data
      expect(result.name).not.toBe(mockImdbData.name);
      expect(result.imdb_id).not.toBe(mockImdbData.imdb_id);
      expect(result.plot).not.toBe(mockImdbData.plot);

      // Should preserve structure
      expect(result.content_type).toBe(mockImdbData.content_type);
      expect(result.release_detailed.year).toBe(mockImdbData.release_detailed.year);
      expect(result.rating).toBe(mockImdbData.rating);

      // Should be deterministic
      const result2 = sanitizeImdbData(mockImdbData);
      expect(result.name).toBe(result2.name);
      expect(result.imdb_id).toBe(result2.imdb_id);
    });

    it('should sanitize person names in all fields', () => {
      const result = sanitizeImdbData(mockImdbData);

      // Actors array
      expect(result.actors).toBeDefined();
      expect(result.actors?.length).toBe(mockImdbData.actors?.length);
      result.actors?.forEach((actor, index) => {
        expect(actor).not.toBe(mockImdbData.actors?.[index]);
        expect(actor).toMatch(/^[A-Za-z\s.-]+$/); // Should be a realistic name
      });

      // Directors array
      expect(result.directors).toBeDefined();
      expect(result.directors?.length).toBe(mockImdbData.directors?.length);
      result.directors?.forEach((director, index) => {
        expect(director).not.toBe(mockImdbData.directors?.[index]);
      });

      // Single director
      expect(result.director).not.toBe(mockImdbData.director);

      // Cast string
      expect(result.cast).not.toBe(mockImdbData.cast);
      expect(result.cast).toContain(','); // Should maintain comma separation
    });

    it('should sanitize top credits structure', () => {
      const result = sanitizeImdbData(mockImdbData);

      expect(result.top_credits).toBeDefined();
      expect(result.top_credits?.length).toBe(mockImdbData.top_credits?.length);

      result.top_credits?.forEach((credit, index) => {
        const originalCredit = mockImdbData.top_credits?.[index];
        expect(credit.name).toBe(originalCredit?.name); // Name unchanged
        expect(credit.credits.length).toBe(originalCredit?.credits.length);

        credit.credits.forEach((name, nameIndex) => {
          expect(name).not.toBe(originalCredit?.credits[nameIndex]);
        });
      });
    });

    it('should sanitize URLs and video keys', () => {
      const result = sanitizeImdbData(mockImdbData);

      // URLs should be sanitized but maintain structure
      expect(result.thumbnail).not.toBe(mockImdbData.thumbnail);
      expect(result.image).not.toBe(mockImdbData.image);
      expect(result.rott_url).not.toBe(mockImdbData.rott_url);

      // Video list should be sanitized
      expect(result.video_list).toBeDefined();
      expect(result.video_list?.length).toBe(mockImdbData.video_list?.length);

      result.video_list?.forEach((video, index) => {
        const originalVideo = mockImdbData.video_list?.[index];
        expect(video.key).not.toBe(originalVideo?.key);
        expect(video.site).toBe(originalVideo?.site); // Site unchanged
        expect(video.key).toMatch(/^fake_video_/); // Should have fake prefix
      });
    });

    it('should handle missing or null data gracefully', () => {
      const incompleteData: Partial<TheRARBGImdbData> = {
        imdb_id: 'tt0111161',
        name: 'Test Movie',
        content_type: 'Movie',
      };

      const result = sanitizeImdbData(incompleteData as TheRARBGImdbData);

      expect(result.name).not.toBe(incompleteData.name);
      expect(result.imdb_id).not.toBe(incompleteData.imdb_id);
      expect(result.content_type).toBe(incompleteData.content_type);
    });

    it('should return input unchanged for invalid data', () => {
      expect(sanitizeImdbData(null as any)).toBe(null);
      expect(sanitizeImdbData(undefined as any)).toBe(undefined);
      expect(sanitizeImdbData('string' as any)).toBe('string');
    });

    it('should handle TV content differently from movies', () => {
      const tvData: TheRARBGImdbData = {
        ...mockImdbData,
        content_type: 'TV',
        name: 'Mystery Chronicles',
      };

      const movieResult = sanitizeImdbData(mockImdbData);
      const tvResult = sanitizeImdbData(tvData);

      // Should generate different fake data for different content types
      expect(movieResult.name).not.toBe(tvResult.name);
      expect(movieResult.imdb_id).not.toBe(tvResult.imdb_id);
    });
  });

  describe('sanitizePost', () => {
    it('should sanitize post with legal hash options', () => {
      const options: SanitizationOptions = {
        useLegalHashes: true,
        legalHashStrategy: 'imdb-based',
      };

      const result = sanitizePost(mockPost, mockImdbData, options);

      // Should change sensitive data
      expect(result.name).not.toBe(mockPost.name);
      expect(result.short_name).not.toBe(mockPost.short_name);
      expect(result.imdb).not.toBe(mockPost.imdb);
      expect(result.info_hash).not.toBe(mockPost.info_hash);
      expect(result.username).not.toBe(mockPost.username);

      // Should preserve technical metadata in names
      expect(result.name).toContain('1080p');
      expect(result.name).toContain('BluRay');
      expect(result.name).toContain('x264');

      // Should preserve non-sensitive data
      expect(result.pid).toBe(mockPost.pid);
      expect(result.size).toBe(mockPost.size);
      expect(result.seeders).toBe(mockPost.seeders);
      expect(result.leechers).toBe(mockPost.leechers);
      expect(result.category).toBe(mockPost.category);
    });

    it('should use legal hash for odd IMDB IDs when enabled', () => {
      const options: SanitizationOptions = {
        useLegalHashes: true,
        legalHashStrategy: 'imdb-based',
      };

      const result = sanitizePost(mockPost, mockImdbData, options);

      // tt0111161 is odd, so should use legal hash
      expect(shouldUseLegalHash(mockPost.imdb)).toBe(true);

      const metadata = getLegalHashMetadata(result.info_hash);
      expect(metadata).toBeDefined();
      expect(metadata?.type).toBe('Movie'); // Should match content type
    });

    it('should use fake hash for even IMDB IDs', () => {
      const evenImdbData = { ...mockImdbData, imdb_id: 'tt0111162' };
      const evenPost = { ...mockPost, imdb: 'tt0111162' };

      const options: SanitizationOptions = {
        useLegalHashes: true,
        legalHashStrategy: 'imdb-based',
      };

      const result = sanitizePost(evenPost, evenImdbData, options);

      // tt0111162 is even, so should use fake hash
      expect(shouldUseLegalHash(evenPost.imdb)).toBe(false);

      const metadata = getLegalHashMetadata(result.info_hash);
      expect(metadata).toBeUndefined(); // Should not be a legal hash
    });

    it('should sanitize file information', () => {
      const result = sanitizePost(mockPost, mockImdbData);

      expect(result.files).toBeDefined();
      expect(result.files?.length).toBe(mockPost.files?.length);

      result.files?.forEach((file, index) => {
        const originalFile = mockPost.files?.[index];

        // File names should be sanitized
        expect(file.name).not.toBe(originalFile?.name);
        expect(file.full_location).not.toBe(originalFile?.full_location);

        // Should preserve file extensions and technical metadata
        expect(file.name).toMatch(/\.(mkv|mp4|avi)$/);

        // Size should be preserved
        expect(file.size).toBe(originalFile?.size);
      });
    });

    it('should sanitize images and URLs', () => {
      const result = sanitizePost(mockPost, mockImdbData);

      // Thumbnail should be sanitized
      expect(result.thumbnail).not.toBe(mockPost.thumbnail);

      // Description should be sanitized
      expect(result.descr).not.toBe(mockPost.descr);

      // Images array should be sanitized
      expect(result.images).toBeDefined();
      expect(result.images?.length).toBe(mockPost.images?.length);

      result.images?.forEach((image, index) => {
        expect(image).not.toBe(mockPost.images?.[index]);
      });
    });

    it('should respect preserveTechnicalMetadata option', () => {
      const optionsPreserve: SanitizationOptions = {
        preserveTechnicalMetadata: true,
      };

      const optionsNoPreserve: SanitizationOptions = {
        preserveTechnicalMetadata: false,
      };

      const resultPreserve = sanitizePost(mockPost, mockImdbData, optionsPreserve);
      const resultNoPreserve = sanitizePost(mockPost, mockImdbData, optionsNoPreserve);

      // With preservation, should keep technical terms
      expect(resultPreserve.name).toContain('1080p');
      expect(resultPreserve.name).toContain('BluRay');
      expect(resultPreserve.name).toContain('x264');

      // Both should still be different from original
      expect(resultPreserve.name).not.toBe(mockPost.name);
      expect(resultNoPreserve.name).not.toBe(mockPost.name);
    });

    it('should handle missing optional fields gracefully', () => {
      const minimalPost: Partial<TheRARBGPost> = {
        pid: 12345,
        name: 'Test.Movie.2023.1080p.BluRay.x264',
        imdb: 'tt0111161',
        info_hash: 'ABCDEF1234567890ABCDEF1234567890ABCDEF12',
      };

      const result = sanitizePost(minimalPost as TheRARBGPost, mockImdbData);

      expect(result.name).not.toBe(minimalPost.name);
      expect(result.imdb).not.toBe(minimalPost.imdb);
      expect(result.info_hash).not.toBe(minimalPost.info_hash);
      expect(result.pid).toBe(minimalPost.pid);
    });

    it('should return input unchanged for invalid data', () => {
      expect(sanitizePost(null as any, mockImdbData)).toBe(null);
      expect(sanitizePost(undefined as any, mockImdbData)).toBe(undefined);
    });

    it('should work with different legal hash strategies', () => {
      const strategies: Array<SanitizationOptions['legalHashStrategy']> = [
        'imdb-based',
        'weighted',
        'sequential',
        'random',
      ];

      strategies.forEach(strategy => {
        const options: SanitizationOptions = {
          useLegalHashes: true,
          legalHashStrategy: strategy,
        };

        const result = sanitizePost(mockPost, mockImdbData, options);

        // Should be deterministic for same inputs
        const result2 = sanitizePost(mockPost, mockImdbData, options);
        expect(result.info_hash).toBe(result2.info_hash);

        // For odd IMDB ID, should use legal hash
        if (shouldUseLegalHash(mockPost.imdb)) {
          const metadata = getLegalHashMetadata(result.info_hash);
          expect(metadata).toBeDefined();
        }
      });
    });
  });

  describe('sanitize (main function)', () => {
    it('should sanitize IMDB detail responses', () => {
      const response = {
        imdb: mockImdbData,
        trb_posts: [mockPost],
      };

      const result = sanitize(response);

      expect(result.imdb.name).not.toBe(mockImdbData.name);
      expect(result.trb_posts[0].name).not.toBe(mockPost.name);
      expect(result.trb_posts[0].info_hash).not.toBe(mockPost.info_hash);
    });

    it('should handle wrapped HTTP-VCR responses', () => {
      const wrappedResponse = {
        status: 200,
        headers: {},
        body: {
          imdb: mockImdbData,
          trb_posts: [mockPost],
        },
      };

      const result = sanitize(wrappedResponse);

      expect(result.status).toBe(200);
      expect(result.body.imdb.name).not.toBe(mockImdbData.name);
      expect(result.body.trb_posts[0].name).not.toBe(mockPost.name);
    });

    it('should respect maxItems option', () => {
      const multiplePosts = Array(10)
        .fill(null)
        .map((_, index) => ({
          ...mockPost,
          pid: 12345 + index,
          name: `Test.Movie.${index}.1080p.BluRay.x264`,
        }));

      const response = {
        imdb: mockImdbData,
        trb_posts: multiplePosts,
      };

      const options: SanitizationOptions = { maxItems: 3 };
      const result = sanitize(response, undefined, options);

      expect(result.trb_posts.length).toBe(3);
      expect(result.trb_posts[0].name).not.toBe(multiplePosts[0].name);
    });

    it('should pass options to sanitization functions', () => {
      const response = {
        imdb: mockImdbData,
        trb_posts: [mockPost],
      };

      const options: SanitizationOptions = {
        useLegalHashes: true,
        legalHashStrategy: 'weighted',
        preserveTechnicalMetadata: true,
      };

      const result = sanitize(response, undefined, options);

      // Should preserve technical metadata
      expect(result.trb_posts[0].name).toContain('1080p');
      expect(result.trb_posts[0].name).toContain('BluRay');

      // For odd IMDB ID with legal hashes enabled, should use legal hash
      if (shouldUseLegalHash(mockPost.imdb)) {
        const metadata = getLegalHashMetadata(result.trb_posts[0].info_hash);
        expect(metadata).toBeDefined();
      }
    });

    it('should handle unknown response formats gracefully', () => {
      const unknownResponse = {
        someField: 'someValue',
        data: [1, 2, 3],
      };

      // Should log warning and return unchanged
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const result = sanitize(unknownResponse);

      expect(result).toBe(unknownResponse);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Unknown TheRARBG response format, returning as-is:',
        unknownResponse
      );

      consoleSpy.mockRestore();
    });

    it('should handle null/undefined input gracefully', () => {
      expect(sanitize(null)).toBe(null);
      expect(sanitize(undefined)).toBe(undefined);
      expect(sanitize('string')).toBe('string');
      expect(sanitize(123)).toBe(123);
    });
  });

  describe('sanitizeImdbDetail (convenience function)', () => {
    it('should work as a convenience wrapper', () => {
      const response = {
        imdb: mockImdbData,
        trb_posts: [mockPost],
      };

      const result = sanitizeImdbDetail(response);

      expect(result.imdb.name).not.toBe(mockImdbData.name);
      expect(result.trb_posts[0].name).not.toBe(mockPost.name);
    });

    it('should pass options correctly', () => {
      const response = {
        imdb: mockImdbData,
        trb_posts: [mockPost],
      };

      const options: SanitizationOptions = {
        useLegalHashes: true,
        maxItems: 1,
      };

      const result = sanitizeImdbDetail(response, options);

      expect(result.trb_posts.length).toBe(1);

      // For odd IMDB ID with legal hashes enabled
      if (shouldUseLegalHash(mockPost.imdb)) {
        const metadata = getLegalHashMetadata(result.trb_posts[0].info_hash);
        expect(metadata).toBeDefined();
      }
    });
  });

  describe('Integration Tests', () => {
    it('should maintain consistency across multiple sanitizations', () => {
      const response = {
        imdb: mockImdbData,
        trb_posts: [mockPost],
      };

      const result1 = sanitize(response);
      const result2 = sanitize(response);

      // Should be deterministic
      expect(result1.imdb.name).toBe(result2.imdb.name);
      expect(result1.imdb.imdb_id).toBe(result2.imdb.imdb_id);
      expect(result1.trb_posts[0].name).toBe(result2.trb_posts[0].name);
      expect(result1.trb_posts[0].info_hash).toBe(result2.trb_posts[0].info_hash);
    });

    it('should work with complex real-world data structures', () => {
      const complexResponse = {
        imdb: {
          ...mockImdbData,
          actors: ['Jane Smith', 'John Doe', 'Emily Johnson', 'Michael Brown', 'Lisa Davis'],
          top_credits: [
            { category: 'Director', credits: ['Director Alpha', 'Director Beta'] },
            { category: 'Writer', credits: ['Writer Gamma'] },
            {
              category: 'Producer',
              credits: ['Producer Delta', 'Producer Epsilon', 'Producer Zeta'],
            },
            { category: 'Stars', credits: ['Star Eta', 'Star Theta', 'Star Iota'] },
          ],
          video_list: Array(5)
            .fill(null)
            .map((_, i) => ({
              key: `video_key_${i}`,
              site: 'YouTube',
            })),
        },
        trb_posts: Array(5)
          .fill(null)
          .map((_, i) => ({
            ...mockPost,
            pid: 12345 + i,
            name: `Movie.Title.${2020 + i}.${['720p', '1080p', '2160p'][i % 3]}.${['BluRay', 'WEB-DL', 'HDTV'][i % 3]}.${['x264', 'x265', 'HEVC'][i % 3]}-GROUP${i}`,
            files: Array(3)
              .fill(null)
              .map((_, j) => ({
                name: `file_${i}_${j}.mkv`,
                size: 1000000000 + i * j * 100000000,
                full_location: `/movies/file_${i}_${j}.mkv`,
              })),
            images: Array(2)
              .fill(null)
              .map((_, j) => `https://example.com/image_${i}_${j}.jpg`),
          })),
      };

      const options: SanitizationOptions = {
        useLegalHashes: true,
        legalHashStrategy: 'weighted',
        preserveTechnicalMetadata: true,
        maxItems: 3,
      };

      const result = sanitize(complexResponse, undefined, options);

      // Should sanitize all data
      expect(result.imdb.name).not.toBe(complexResponse.imdb.name);
      expect(result.imdb.actors.length).toBe(complexResponse.imdb.actors.length);
      expect(result.imdb.top_credits.length).toBe(complexResponse.imdb.top_credits.length);

      // Should respect maxItems
      expect(result.trb_posts.length).toBe(3);

      // Should preserve technical metadata
      result.trb_posts.forEach((post: any) => {
        expect(post.name).toMatch(/\d{4}/); // Year
        expect(post.name).toMatch(/(720p|1080p|2160p)/); // Resolution
        expect(post.name).toMatch(/(BluRay|WEB-DL|HDTV)/); // Source
        expect(post.name).toMatch(/(x264|x265|HEVC)/); // Codec
      });
    });

    it('should handle edge cases in production-like scenarios', () => {
      const edgeCaseResponse = {
        imdb: {
          imdb_id: '',
          name: '',
          content_type: 'Movie',
          actors: [],
          directors: null,
          cast: '',
          top_credits: [],
          video_list: null,
        },
        trb_posts: [
          {
            pid: 1,
            name: '',
            imdb: '',
            info_hash: '',
            files: [],
            images: null,
          },
        ],
      };

      // Should not throw errors
      expect(() => sanitize(edgeCaseResponse)).not.toThrow();

      const result = sanitize(edgeCaseResponse);
      expect(result).toBeDefined();
      expect(result.imdb).toBeDefined();
      expect(result.trb_posts).toBeDefined();
    });
  });

  describe('preserveImdbId option', () => {
    it('should preserve IMDB IDs in IMDB data when preserveImdbId is true', () => {
      const result = sanitizeImdbData(mockImdbData, { preserveImdbId: true });

      expect(result.imdb_id).toBe('tt0111161');
    });

    it('should generate fake IMDB IDs in IMDB data when preserveImdbId is false', () => {
      const result = sanitizeImdbData(mockImdbData, { preserveImdbId: false });

      expect(result.imdb_id).not.toBe('tt0111161');
      expect(result.imdb_id).toMatch(/^tt\d+$/);
    });

    it('should preserve IMDB IDs in posts when preserveImdbId is true', () => {
      const result = sanitizePost(mockPost, mockImdbData, { preserveImdbId: true });

      expect(result.imdb).toBe('tt0111161');
    });

    it('should generate fake IMDB IDs in posts when preserveImdbId is false', () => {
      const result = sanitizePost(mockPost, mockImdbData, { preserveImdbId: false });

      expect(result.imdb).not.toBe('tt0111161');
      expect(result.imdb).toMatch(/^tt\d+$/);
    });
  });
});
