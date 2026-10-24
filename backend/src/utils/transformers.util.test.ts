import { createMockSourceMetadata } from '@__test-utils__/mocks/movie.mock';
import { configureFakerSeed } from '@__test-utils__/utils';

import { normalizeInfoHash, providerSourcesToEntities } from './transformers.util';

describe('providerSourcesToEntities', () => {
  beforeAll(() => {
    configureFakerSeed();
  });

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('maps provider metadata without tying the row to a movie', () => {
    const metadata = createMockSourceMetadata();

    const [row] = providerSourcesToEntities([metadata], 'YTS');

    expect(row.hash).toBe(metadata.hash);
    expect(row.source).toBe('YTS');
    expect(row).not.toHaveProperty('movieId');
  });
});

describe('normalizeInfoHash', () => {
  it('trims and lowercases provider hashes', () => {
    expect(normalizeInfoHash(' ABCDEF1234567890ABCDEF1234567890ABCDEF12 ')).toBe(
      'abcdef1234567890abcdef1234567890abcdef12'
    );
  });

  it('is idempotent for already normalized hashes', () => {
    const hash = 'abcdef1234567890abcdef1234567890abcdef12';
    expect(normalizeInfoHash(normalizeInfoHash(hash))).toBe(hash);
  });
});
