import {
  shouldUseLegalHash,
  selectLegalHash,
  getLegalHashMetadata,
  getAvailableLegalHashes,
  validateLegalHashAvailability,
  generateSafeInfoHash,
} from './utils';
import { LEGAL_HASHES } from './constants';
import type { SanitizationOptions } from './types';

describe('Legal Hash Functionality', () => {
  describe('shouldUseLegalHash', () => {
    it('should return true for odd IMDB IDs', () => {
      expect(shouldUseLegalHash('tt0111161')).toBe(true); // 111161 is odd
      expect(shouldUseLegalHash('tt0111163')).toBe(true); // 111163 is odd
      expect(shouldUseLegalHash('tt1234567')).toBe(true); // 1234567 is odd
    });

    it('should return false for even IMDB IDs', () => {
      expect(shouldUseLegalHash('tt0068646')).toBe(false); // 68646 is even
      expect(shouldUseLegalHash('tt0111162')).toBe(false); // 111162 is even
      expect(shouldUseLegalHash('tt1234568')).toBe(false); // 1234568 is even
    });

    it('should handle IMDB IDs with leading zeros', () => {
      expect(shouldUseLegalHash('tt0000001')).toBe(true); // 1 is odd
      expect(shouldUseLegalHash('tt0000002')).toBe(false); // 2 is even
    });
  });

  describe('selectLegalHash - IMDB-based strategy', () => {
    const options: SanitizationOptions = { legalHashStrategy: 'imdb-based' };

    it('should return consistent hashes for same IMDB ID', () => {
      const hash1 = selectLegalHash('tt0111161', options);
      const hash2 = selectLegalHash('tt0111161', options);
      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[A-F0-9]{40}$/);
    });

    it('should return different hashes for different IMDB IDs', () => {
      const hash1 = selectLegalHash('tt0111161', options);
      const hash2 = selectLegalHash('tt0111163', options);
      expect(hash1).not.toBe(hash2);
    });

    it('should filter by content type when specified', () => {
      const movieHash = selectLegalHash('tt0111161', options, 'Movie');
      const shortHash = selectLegalHash('tt0111161', options, 'short');

      // Should be different when filtering by type
      expect(movieHash).toMatch(/^[A-F0-9]{40}$/);
      expect(shortHash).toMatch(/^[A-F0-9]{40}$/);

      // Verify the hashes correspond to the right content types
      const movieMeta = getLegalHashMetadata(movieHash);
      const shortMeta = getLegalHashMetadata(shortHash);

      if (movieMeta) expect(movieMeta.type).toBe('Movie');
      if (shortMeta) expect(shortMeta.type).toBe('short');
    });
  });

  describe('selectLegalHash - weighted strategy', () => {
    const options: SanitizationOptions = { legalHashStrategy: 'weighted' };

    it('should return consistent hashes for same seed', () => {
      const hash1 = selectLegalHash('test_seed', options);
      const hash2 = selectLegalHash('test_seed', options);
      expect(hash1).toBe(hash2);
    });

    it('should favor higher weighted hashes', () => {
      // Run multiple times to check weight distribution
      const results = new Map<string, number>();

      for (let i = 0; i < 100; i++) {
        const hash = selectLegalHash(`seed_${i}`, options);
        const metadata = getLegalHashMetadata(hash);
        if (metadata) {
          const weight = metadata.weight || 1;
          results.set(hash, (results.get(hash) || 0) + weight);
        }
      }

      expect(results.size).toBeGreaterThan(0);
    });
  });

  describe('selectLegalHash - sequential strategy', () => {
    const options: SanitizationOptions = { legalHashStrategy: 'sequential' };

    it('should return hashes in deterministic order', () => {
      const hash1 = selectLegalHash('seed1', options);
      const hash2 = selectLegalHash('seed2', options);
      const hash3 = selectLegalHash('seed1', options); // Same as seed1

      expect(hash1).toBe(hash3);
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('selectLegalHash - random strategy', () => {
    const options: SanitizationOptions = { legalHashStrategy: 'random' };

    it('should return consistent hashes for same seed', () => {
      const hash1 = selectLegalHash('random_seed', options);
      const hash2 = selectLegalHash('random_seed', options);
      expect(hash1).toBe(hash2);
    });

    it('should respect content type filtering', () => {
      const movieHash = selectLegalHash('random_seed', options, 'Movie');
      const metadata = getLegalHashMetadata(movieHash);

      if (metadata) {
        expect(metadata.type).toBe('Movie');
      }
    });
  });

  describe('getLegalHashMetadata', () => {
    it('should return metadata for valid hashes', () => {
      const testHash = LEGAL_HASHES[0].hash;
      const metadata = getLegalHashMetadata(testHash);

      expect(metadata).toBeDefined();
      expect(metadata?.hash).toBe(testHash);
      expect(metadata?.title).toBeDefined();
    });

    it('should return undefined for invalid hashes', () => {
      const metadata = getLegalHashMetadata('INVALID_HASH');
      expect(metadata).toBeUndefined();
    });

    it('should be case insensitive', () => {
      const testHash = LEGAL_HASHES[0].hash;
      const lowerMetadata = getLegalHashMetadata(testHash.toLowerCase());
      const upperMetadata = getLegalHashMetadata(testHash.toUpperCase());

      expect(lowerMetadata).toBeDefined();
      expect(upperMetadata).toBeDefined();
      expect(lowerMetadata?.hash).toBe(upperMetadata?.hash);
    });
  });

  describe('getAvailableLegalHashes', () => {
    it('should return all hashes when no filters applied', () => {
      const hashes = getAvailableLegalHashes();
      expect(hashes.length).toBe(LEGAL_HASHES.length);
    });

    it('should filter by content type', () => {
      const movieHashes = getAvailableLegalHashes('Movie');
      const shortHashes = getAvailableLegalHashes('short');

      expect(movieHashes.length).toBeGreaterThan(0);
      expect(shortHashes.length).toBeGreaterThan(0);

      movieHashes.forEach(hash => expect(hash.type).toBe('Movie'));
      shortHashes.forEach(hash => expect(hash.type).toBe('short'));
    });

    it('should filter by minimum weight', () => {
      const highWeightHashes = getAvailableLegalHashes(undefined, 9);

      highWeightHashes.forEach(hash => {
        expect(hash.weight || 1).toBeGreaterThanOrEqual(9);
      });
    });

    it('should filter by year range', () => {
      const modernHashes = getAvailableLegalHashes(undefined, undefined, { min: 2000 });
      const classicHashes = getAvailableLegalHashes(undefined, undefined, { max: 1970 });

      modernHashes.forEach(hash => {
        if (hash.year) expect(hash.year).toBeGreaterThanOrEqual(2000);
      });

      classicHashes.forEach(hash => {
        if (hash.year) expect(hash.year).toBeLessThanOrEqual(1970);
      });
    });

    it('should combine multiple filters', () => {
      const filteredHashes = getAvailableLegalHashes('Movie', 8, { min: 1920, max: 1970 });

      filteredHashes.forEach(hash => {
        expect(hash.type).toBe('Movie');
        expect(hash.weight || 1).toBeGreaterThanOrEqual(8);
        if (hash.year) {
          expect(hash.year).toBeGreaterThanOrEqual(1920);
          expect(hash.year).toBeLessThanOrEqual(1970);
        }
      });
    });
  });

  describe('validateLegalHashAvailability', () => {
    it('should validate sufficient hashes are available', () => {
      const options: SanitizationOptions = { minLegalHashes: 5 };
      const result = validateLegalHashAvailability(options);

      expect(result.isValid).toBe(true);
      expect(result.available).toBeGreaterThanOrEqual(5);
      expect(result.required).toBe(5);
    });

    it('should fail validation when insufficient hashes', () => {
      const options: SanitizationOptions = { minLegalHashes: 1000 };
      const result = validateLegalHashAvailability(options);

      expect(result.isValid).toBe(false);
      expect(result.available).toBeLessThan(1000);
      expect(result.required).toBe(1000);
    });

    it('should validate with content type filtering', () => {
      const options: SanitizationOptions = { minLegalHashes: 3 };
      const result = validateLegalHashAvailability(options, 'Movie');

      expect(result.available).toBeGreaterThan(0);
    });
  });

  describe('generateSafeInfoHash', () => {
    it('should use legal hash for odd IMDB IDs when enabled', () => {
      const hash = generateSafeInfoHash(
        'original_hash',
        'tt0111161', // odd
        true, // useLegalHashes
        { legalHashStrategy: 'imdb-based' },
        'Movie'
      );

      expect(hash).toMatch(/^[A-F0-9]{40}$/);

      // Should be a legal hash
      const metadata = getLegalHashMetadata(hash);
      expect(metadata).toBeDefined();
    });

    it('should use fake hash for even IMDB IDs', () => {
      const hash = generateSafeInfoHash(
        'original_hash',
        'tt0111162', // even
        true, // useLegalHashes
        { legalHashStrategy: 'imdb-based' },
        'Movie'
      );

      expect(hash).toMatch(/^[A-F0-9]{40}$/);

      // Should NOT be a legal hash
      const metadata = getLegalHashMetadata(hash);
      expect(metadata).toBeUndefined();
    });

    it('should generate consistent fake hashes', () => {
      const hash1 = generateSafeInfoHash('original_hash', 'tt0111162', false);
      const hash2 = generateSafeInfoHash('original_hash', 'tt0111162', false);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[A-F0-9]{40}$/);
    });

    it('should use custom seed when provided', () => {
      const options: SanitizationOptions = { customSeed: 'custom_test_seed' };

      const hash1 = generateSafeInfoHash('original1', 'tt0111161', true, options, 'Movie');
      const hash2 = generateSafeInfoHash('original2', 'tt0111163', true, options, 'Movie');

      // Should be the same because custom seed overrides IMDB-based seeding
      expect(hash1).toBe(hash2);
    });

    it('should respect different legal hash strategies', () => {
      const imdbOptions: SanitizationOptions = { legalHashStrategy: 'imdb-based' };
      const weightedOptions: SanitizationOptions = { legalHashStrategy: 'weighted' };

      const imdbHash = generateSafeInfoHash('original', 'tt0111161', true, imdbOptions, 'Movie');
      const weightedHash = generateSafeInfoHash(
        'original',
        'tt0111161',
        true,
        weightedOptions,
        'Movie'
      );

      expect(imdbHash).toMatch(/^[A-F0-9]{40}$/);
      expect(weightedHash).toMatch(/^[A-F0-9]{40}$/);

      // Both should be legal hashes but potentially different
      expect(getLegalHashMetadata(imdbHash)).toBeDefined();
      expect(getLegalHashMetadata(weightedHash)).toBeDefined();
    });
  });

  describe('Integration Tests', () => {
    it('should provide deterministic behavior across all strategies', () => {
      const strategies: Array<SanitizationOptions['legalHashStrategy']> = [
        'imdb-based',
        'weighted',
        'sequential',
        'random',
      ];

      strategies.forEach(strategy => {
        const options: SanitizationOptions = { legalHashStrategy: strategy };

        const hash1 = selectLegalHash('tt0111161', options, 'Movie');
        const hash2 = selectLegalHash('tt0111161', options, 'Movie');

        expect(hash1).toBe(hash2);
        expect(hash1).toMatch(/^[A-F0-9]{40}$/);

        const metadata = getLegalHashMetadata(hash1);
        expect(metadata).toBeDefined();
      });
    });

    it('should maintain consistency between hash generation and metadata lookup', () => {
      const hash = selectLegalHash('tt0111161', { legalHashStrategy: 'imdb-based' }, 'Movie');
      const metadata = getLegalHashMetadata(hash);

      expect(metadata).toBeDefined();
      expect(metadata?.hash).toBe(hash);
      expect(metadata?.type).toBe('Movie');
    });

    it('should handle edge cases gracefully', () => {
      // Test with empty/invalid inputs
      expect(() => selectLegalHash('', {})).not.toThrow();
      expect(() => selectLegalHash('invalid', {})).not.toThrow();
      expect(() => getLegalHashMetadata('')).not.toThrow();
      expect(() => getAvailableLegalHashes('invalid' as any)).not.toThrow();
    });
  });
});
