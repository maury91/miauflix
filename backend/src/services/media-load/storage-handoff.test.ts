jest.unmock('@database/database');

import { createTestDatabase } from '@__test-utils__/database.helpers';
import { TestDataFactory } from '@__test-utils__/test-data.factory';
import { F, MAX_FRAME_BYTES, methodName } from '@miauflix/contract';
import { type ImportedSource, mediaLoad } from '@miauflix/service-contracts';

import { Storage } from '@entities/storage.entity';
import { StorageFile } from '@entities/storage-file.entity';
import { StorageFileClaim } from '@entities/storage-file-claim.entity';

import type { MediaLoadClientService } from './media-load-client.service';
import { createStorageHandoff } from './storage-handoff';

/** The service side of the handoff, remembering every batch. */
const fakeClient = (status: { imported: boolean; sealed?: boolean } = { imported: false }) => {
  const batches: ImportedSource[][] = [];
  const client = {
    importStatus: jest.fn(async () => status),
    importStorage: jest.fn(async (items: ImportedSource[]) => {
      batches.push(items);
      return { imported: items.length, skipped: 0 };
    }),
    completeImport: jest.fn(async () => batches.flat().length),
  };
  return { client: client as unknown as MediaLoadClientService, mock: client, batches };
};

describe('createStorageHandoff', () => {
  const dbHelper = createTestDatabase();

  beforeEach(async () => {
    await dbHelper.setupTestDatabase();
  });

  afterEach(async () => {
    await dbHelper.cleanup();
  });

  const seed = async (count: number, bitfieldBytes?: number) => {
    const db = dbHelper.getDatabase();
    const factory = new TestDataFactory(db);
    const movie = await factory.createTestMovie();
    const stored: Storage[] = [];
    for (let index = 0; index < count; index++) {
      const source = await factory.createTestContentSource(movie.id);
      stored.push(
        await db.getRepository(Storage).save({
          ...factory.createTestStorage(source.id),
          ...(bitfieldBytes ? { downloadedPieces: Buffer.alloc(bitfieldBytes) } : {}),
          totalPieces: 2,
          pieceLength: 4,
          videoCompletedAt: new Date('2026-10-02T00:00:00.000Z'),
          encryptedLayout: {
            storeName: `store-${index}`,
            filenameSalt: `download-${source.hash}`,
            pieceLength: 4,
            files: [{ path: 'Movie.mkv', offset: 0, length: 8 }],
          },
        })
      );
    }
    return { db, stored };
  };

  it('sends every stored source with its descriptor, files and claims, then completes', async () => {
    const { db, stored } = await seed(2);
    const [first] = stored;
    await db.getRepository(StorageFile).save({
      storageId: first.id,
      path: 'Movie.mkv',
      offset: 0,
      length: 8,
      completedAt: new Date('2026-10-02T00:00:00.000Z'),
    });
    await db.getRepository(StorageFileClaim).save({
      storageId: first.id,
      path: 'Movie.mkv',
      kind: 'watched',
      ownerKey: 'user:1',
      rangeStart: 0,
      rangeEnd: null,
      expiresAt: null,
    });
    const { client, mock, batches } = fakeClient();

    await createStorageHandoff(db)(client);

    const items = batches.flat();
    expect(items).toHaveLength(2);
    const firstSource = await db.getContentSourceRepository().findById(first.sourceId);
    expect(items[0]).toMatchObject({
      source: { id: first.sourceId, hash: firstSource!.hash, magnetLink: firstSource!.magnetLink },
      storage: {
        location: first.location,
        totalPieces: 2,
        videoCompletedAt: '2026-10-02T00:00:00.000Z',
        encryptedLayout: { storeName: 'store-0', pieceLength: 4 },
        downloadedPieces: Buffer.from(first.downloadedPieces).toString('base64'),
      },
      files: [{ path: 'Movie.mkv', offset: 0, length: 8, completedAt: '2026-10-02T00:00:00.000Z' }],
      claims: [{ path: 'Movie.mkv', kind: 'watched', ownerKey: 'user:1', rangeEnd: null }],
    });
    expect(items[1]).toMatchObject({ files: [], claims: [] });
    expect(mock.completeImport).toHaveBeenCalledTimes(1);
  });

  it('completes an empty import, and does nothing once the service holds the storage', async () => {
    const { db } = await seed(0);
    const empty = fakeClient();
    await createStorageHandoff(db)(empty.client);
    expect(empty.mock.importStorage).not.toHaveBeenCalled();
    expect(empty.mock.completeImport).toHaveBeenCalledTimes(1);

    const done = fakeClient({ imported: true });
    await createStorageHandoff(db)(done.client);
    expect(done.mock.completeImport).not.toHaveBeenCalled();
  });

  it('sends large stores in batches', async () => {
    const { db } = await seed(51);
    const { client, batches } = fakeClient();
    await createStorageHandoff(db)(client);
    expect(batches.map(batch => batch.length)).toEqual([50, 1]);
  });

  it('retries adoption without reading or resending legacy rows once sealed', async () => {
    const { db } = await seed(1);
    const { client, mock } = fakeClient({ imported: false, sealed: true });
    const getRepository = jest.spyOn(db, 'getRepository');
    try {
      await createStorageHandoff(db)(client);
      expect(getRepository).not.toHaveBeenCalled();
      expect(mock.importStorage).not.toHaveBeenCalled();
      expect(mock.completeImport).toHaveBeenCalledTimes(1);
    } finally {
      getRepository.mockRestore();
    }
  });

  it('splits a page when its serialized records would exceed the frame limit', async () => {
    const { db, stored } = await seed(2, 6 * 1024 * 1024);
    const { client, batches } = fakeClient();
    await createStorageHandoff(db)(client);

    expect(batches.map(batch => batch.map(item => item.source.id))).toEqual(
      stored.map(storage => [storage.sourceId])
    );
    for (const items of batches) {
      const frame = [
        F.call,
        Number.MAX_SAFE_INTEGER,
        methodName(mediaLoad, 'importStorage'),
        { items },
      ];
      expect(Buffer.byteLength(JSON.stringify(frame))).toBeLessThanOrEqual(MAX_FRAME_BYTES);
    }
  });

  it('reports an oversized source and leaves its original record available', async () => {
    const {
      db,
      stored: [storage],
    } = await seed(1, 12 * 1024 * 1024);
    const { client, mock } = fakeClient();
    await expect(createStorageHandoff(db)(client)).rejects.toThrow(
      `legacy source ${storage.sourceId} exceeds the 16 MiB import frame limit`
    );
    expect(mock.importStorage).not.toHaveBeenCalled();
    expect(mock.completeImport).not.toHaveBeenCalled();
    expect(await db.getRepository(Storage).count()).toBe(1);
  });
});
