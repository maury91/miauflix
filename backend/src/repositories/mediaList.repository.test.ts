jest.mock('@logger');
jest.unmock('@database/database');

import { createTestDatabase } from '@__test-utils__/database.helpers';

describe('MediaListRepository snapshots', () => {
  const dbHelper = createTestDatabase();

  afterEach(async () => {
    await dbHelper.cleanup();
  });

  it('paginates in provider order and atomically replaces generations', async () => {
    const database = await dbHelper.setupTestDatabase();
    const repository = database.getMediaListRepository();
    const list = await repository.createMediaList('Popular', 'Popular media', 'popular');

    await repository.stagePage(list.id, 'first', 0, [
      { mediaType: 'movie', mediaId: 10 },
      { mediaType: 'tv', mediaId: 20 },
      { mediaType: 'movie', mediaId: 30 },
    ]);
    await repository.activateGeneration(list.id, 'first');

    expect((await repository.getPage(list.id, 'first', 1, 1))[0].mediaId).toBe(20);
    expect(await repository.countItems(list.id, 'first')).toBe(3);

    await repository.stagePage(list.id, 'second', 0, [
      { mediaType: 'tv', mediaId: 40 },
      { mediaType: 'movie', mediaId: 50 },
    ]);
    expect(await repository.countItems(list.id, 'first')).toBe(3);

    await repository.activateGeneration(list.id, 'second');
    expect(await repository.countItems(list.id, 'first')).toBe(0);
    expect((await repository.getPage(list.id, 'second', 0, 10)).map(item => item.mediaId)).toEqual([
      40, 50,
    ]);
  });

  it('can discard a failed staging generation without touching the active one', async () => {
    const database = await dbHelper.setupTestDatabase();
    const repository = database.getMediaListRepository();
    const list = await repository.createMediaList('Popular', 'Popular media', 'popular');
    await repository.stagePage(list.id, 'active', 0, [{ mediaType: 'movie', mediaId: 10 }]);
    await repository.activateGeneration(list.id, 'active');
    await repository.stagePage(list.id, 'failed', 0, [{ mediaType: 'movie', mediaId: 20 }]);

    await repository.discardGeneration(list.id, 'failed');

    expect(await repository.countItems(list.id, 'active')).toBe(1);
    expect(await repository.countItems(list.id, 'failed')).toBe(0);
  });

  it('ignores duplicate media identities in a staging generation', async () => {
    const database = await dbHelper.setupTestDatabase();
    const repository = database.getMediaListRepository();
    const list = await repository.createMediaList('Popular', 'Popular media', 'popular');

    await repository.stagePage(list.id, 'next', 0, [
      { mediaType: 'movie', mediaId: 10 },
      { mediaType: 'movie', mediaId: 10 },
      { mediaType: 'tv', mediaId: 10 },
    ]);

    expect(await repository.countItems(list.id, 'next')).toBe(2);
    expect(
      (await repository.getPage(list.id, 'next', 0, 10)).map(item => [item.mediaType, item.mediaId])
    ).toEqual([
      ['movie', 10],
      ['tv', 10],
    ]);
  });
});
