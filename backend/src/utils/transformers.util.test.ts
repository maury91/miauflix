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

    const [row] = providerSourcesToEntities([metadata], 'indexer-a');

    expect(row.hash).toBe(metadata.hash);
    expect(row.source).toBe(metadata.provider);
    expect(row.url).toBeNull();
    expect(row).not.toHaveProperty('movieId');
  });

  it('treats the epoch as an unknown upload date, so it is not scored as ancient', () => {
    const known = createMockSourceMetadata({ uploadDate: new Date() });
    const unknown = createMockSourceMetadata({ ...known, uploadDate: new Date(0) });
    const [withDate] = providerSourcesToEntities([known], 'indexer-a');
    const [withoutDate] = providerSourcesToEntities([unknown], 'indexer-a');
    expect(withDate.sourceUploadedAt).toEqual(known.uploadDate);
    expect(withoutDate.sourceUploadedAt).toBeUndefined();
    // Unknown (x0.9) beats ancient (x0.7).
    expect(withoutDate.streamingScore).toBeGreaterThan(
      providerSourcesToEntities([{ ...unknown, uploadDate: new Date(1) }], 'indexer-a')[0]
        .streamingScore
    );
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
