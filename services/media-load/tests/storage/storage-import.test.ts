import type { ImportedSource } from '@miauflix/service-contracts';

import { StorageImporter } from '../../src/storage/storage-import';
import { testDatabase } from '../helpers/engine';

const item = (id: number): ImportedSource => {
  const hash = id.toString(16).padStart(40, '0');
  return {
    source: { id, hash, magnetLink: `magnet:?xt=urn:btih:${hash}`, size: 8 },
    storage: {
      downloadedPieces: Buffer.from([0b11000000]).toString('base64'),
      size: 8,
      logicalBytes: 8,
      verifiedBytes: 8,
      allocatedBytes: 8,
      reservedBytes: 0,
      totalPieces: 2,
      pieceLength: 4,
      lastInterestAt: null,
      videoCompletedAt: '2026-10-02T00:00:00.000Z',
      localOnly: false,
      encryptedLayout: null,
      downloaded: 10_000,
      location: `/downloads/${id}`,
      lastAccessAt: null,
      lastWriteAt: null,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-10-02T00:00:00.000Z',
    },
    files: [
      { path: 'Show.S01E01.mkv', offset: 0, length: 4, completedAt: '2026-10-02T00:00:00.000Z' },
      { path: 'Show.S01E02.mkv', offset: 4, length: 4, completedAt: null },
    ],
    claims: [
      {
        path: 'Show.S01E01.mkv',
        kind: 'watchlist',
        ownerKey: 'user:1',
        rangeStart: 0,
        rangeEnd: 1024,
        expiresAt: '2099-01-01T00:00:00.000Z',
      },
      {
        path: 'Show.S01E02.mkv',
        kind: 'playback',
        ownerKey: 'stream',
        rangeStart: 0,
        rangeEnd: null,
        expiresAt: null,
      },
    ],
  };
};

describe('StorageImporter', () => {
  it('keeps the recorded values, dates, files and claims, but not playback claims', async () => {
    const database = await testDatabase();
    const importer = new StorageImporter(database);

    await expect(importer.importItems([item(5)])).resolves.toEqual({ imported: 1, skipped: 0 });

    const storage = (await database.getStorageRepository().findBySourceIdWithRelation(5))!;
    expect(storage).toMatchObject({
      sourceId: 5,
      downloadedPieces: new Uint8Array([0b11000000]),
      totalPieces: 2,
      activeStreams: 0,
      location: '/downloads/5',
      videoCompletedAt: new Date('2026-10-02T00:00:00.000Z'),
      createdAt: new Date('2026-09-01T00:00:00.000Z'),
      contentSource: { id: 5, hash: '5'.padStart(40, '0') },
    });
    const files = await database.getStorageFileRepository().findFiles(storage.id);
    expect(files.map(file => [file.path, file.completedAt])).toEqual([
      ['Show.S01E01.mkv', new Date('2026-10-02T00:00:00.000Z')],
      ['Show.S01E02.mkv', null],
    ]);
    const claims = await database.getStorageFileRepository().findLiveClaims(storage.id);
    expect(claims.map(claim => [claim.path, claim.kind, claim.rangeEnd])).toEqual([
      ['Show.S01E01.mkv', 'watchlist', 1024],
    ]);
    database.close();
  });

  it('records completion once and refuses later batches', async () => {
    const database = await testDatabase();
    const importer = new StorageImporter(database);
    expect(importer.imported).toBe(false);
    await importer.importItems([item(1)]);
    expect(importer.complete()).toBe(1);
    expect(importer.complete()).toBe(1);
    expect(new StorageImporter(database).imported).toBe(true);
    await expect(importer.importItems([item(2)])).rejects.toMatchObject({
      status: 'import_closed',
    });
    database.close();
  });
});
