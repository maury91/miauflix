jest.mock('@logger');
jest.unmock('@database/database');

import { createTestDatabase } from '@__test-utils__/database.helpers';
import { configureFakerSeed } from '@__test-utils__/utils';

import { MediaListItem } from '@entities/list.entity';

describe('Database repository write serialization', () => {
  const dbHelper = createTestDatabase();

  beforeAll(() => {
    configureFakerSeed();
  });

  afterEach(async () => {
    await dbHelper.cleanup();
  });

  it('queues updateAll and deleteAll behind a failing transaction', async () => {
    const database = await dbHelper.setupTestDatabase();
    const repository = database.getRepository(MediaListItem);
    const list = await database.getMediaListRepository().createMediaList('Bulk writes', '', 'bulk');
    await repository.save([
      { listId: list.id, generation: 'initial', position: 0, mediaType: 'movie', mediaId: 1 },
      { listId: list.id, generation: 'initial', position: 1, mediaType: 'movie', mediaId: 2 },
    ]);

    let release!: () => void;
    let resolveEntered!: () => void;
    const barrier = new Promise<void>(resolve => {
      release = resolve;
    });
    const transactionEntered = new Promise<void>(resolve => {
      resolveEntered = resolve;
    });
    const blockedTransaction = database.transaction(async manager => {
      resolveEntered();
      await barrier;
      await manager.getRepository(MediaListItem).updateAll({ generation: 'rolled-back' });
      throw new Error('intentional rollback');
    });
    await transactionEntered;

    const update = repository.updateAll({ generation: 'updated' });
    release();
    await expect(blockedTransaction).rejects.toThrow('intentional rollback');
    await update;
    expect(await repository.find({ where: { generation: 'updated' } })).toHaveLength(2);

    let deleteRelease!: () => void;
    let resolveDeleteEntered!: () => void;
    const deleteBarrier = new Promise<void>(resolve => {
      deleteRelease = resolve;
    });
    const deleteTransactionEntered = new Promise<void>(resolve => {
      resolveDeleteEntered = resolve;
    });
    const secondBlockedTransaction = database.transaction(async () => {
      resolveDeleteEntered();
      await deleteBarrier;
      throw new Error('second intentional rollback');
    });
    await deleteTransactionEntered;

    const deletion = repository.deleteAll();
    deleteRelease();
    await expect(secondBlockedTransaction).rejects.toThrow('second intentional rollback');
    await deletion;
    expect(await repository.count({ where: { listId: list.id } })).toBe(0);
  });
});
