jest.unmock('@database/database');

import { createTestDatabase } from '@__test-utils__/database.helpers';

import type { MovieSource } from '@entities/movie-source.entity';

describe('MovieSourceRepository TV torrent identity', () => {
  const dbHelper = createTestDatabase();

  afterEach(async () => {
    await dbHelper.cleanup();
  });

  it('reuses a null-movie source through the encrypted hash transformer', async () => {
    const database = await dbHelper.setupTestDatabase();
    const repository = database.getMovieSourceRepository();
    const source = {
      hash: 'ABCDEF1234567890ABCDEF1234567890ABCDEF12',
      magnetLink: 'magnet:?xt=urn:btih:test',
      movieId: null,
      quality: null,
      size: 100,
      videoCodec: null,
      source: 'test',
      sourceType: null,
    } satisfies Partial<MovieSource>;

    const first = await repository.createTorrentSource(source);
    const second = await repository.createTorrentSource({
      ...source,
      hash: source.hash.toLowerCase(),
      magnetLink: 'magnet:?xt=urn:btih:updated',
    });

    expect(second.id).toBe(first.id);
    expect(second.movieId).toBeNull();
    expect(second.magnetLink).toBe('magnet:?xt=urn:btih:updated');
    expect(await repository.getRepository().count()).toBe(1);
  });
});
