import { logger } from '@logger';
import type { ImportedSource } from '@miauflix/service-contracts';
import { In, MoreThan } from 'typeorm';

import type { Database } from '@database/database';
import { Storage } from '@entities/storage.entity';
import { StorageFile } from '@entities/storage-file.entity';
import { StorageFileClaim } from '@entities/storage-file-claim.entity';

import {
  type MediaLoadClientService,
  sourceDescriptor,
  type StorageHandoff,
} from './media-load-client.service';

const BATCH_SIZE = 50;

const iso = (value: Date | null | undefined): string | null => (value ? value.toISOString() : null);

/** One backend storage row, its files and its claims, as the service imports them. */
const toImported = (
  storage: Storage,
  files: StorageFile[],
  claims: StorageFileClaim[]
): ImportedSource => ({
  source: sourceDescriptor(storage.contentSource),
  storage: {
    downloadedPieces: Buffer.from(storage.downloadedPieces ?? []).toString('base64'),
    size: Number(storage.size) || 0,
    logicalBytes: storage.logicalBytes,
    verifiedBytes: storage.verifiedBytes,
    allocatedBytes: storage.allocatedBytes,
    reservedBytes: storage.reservedBytes,
    totalPieces: storage.totalPieces,
    pieceLength: storage.pieceLength,
    lastInterestAt: iso(storage.lastInterestAt),
    videoCompletedAt: iso(storage.videoCompletedAt),
    localOnly: storage.localOnly,
    encryptedLayout: storage.encryptedLayout,
    downloaded: storage.downloaded,
    location: storage.location,
    lastAccessAt: iso(storage.lastAccessAt),
    lastWriteAt: iso(storage.lastWriteAt),
    createdAt: iso(storage.createdAt) ?? new Date().toISOString(),
    updatedAt: iso(storage.updatedAt) ?? new Date().toISOString(),
  },
  files: files.map(file => ({
    path: file.path,
    offset: file.offset,
    length: file.length,
    completedAt: iso(file.completedAt),
  })),
  claims: claims.map(claim => ({
    path: claim.path,
    kind: claim.kind,
    ownerKey: claim.ownerKey,
    rangeStart: claim.rangeStart,
    rangeEnd: claim.rangeEnd,
    expiresAt: iso(claim.expiresAt),
  })),
});

/**
 * Hands the storage this backend recorded (before media-load ran the torrent engine) to the
 * service, once: every row with its source descriptor, files and claims, in batches, then
 * `completeImport`. The service skips sources it already stores, so a handoff cut short is
 * simply run again. The backend's rows are left in place; a later release drops the tables.
 */
export const createStorageHandoff =
  (db: Database): StorageHandoff =>
  async (client: MediaLoadClientService) => {
    if (await client.importStatus()) return;
    const storages = db.getRepository(Storage);
    const files = db.getRepository(StorageFile);
    const claims = db.getRepository(StorageFileClaim);
    let lastId = 0;
    let imported = 0;
    let skipped = 0;
    for (;;) {
      const batch = await storages.find({
        where: { id: MoreThan(lastId) },
        relations: { contentSource: true },
        order: { id: 'ASC' },
        take: BATCH_SIZE,
      });
      if (!batch.length) break;
      lastId = batch[batch.length - 1].id;
      // A row whose source is gone has nothing to fetch or serve.
      const owned = batch.filter(storage => storage.contentSource);
      skipped += batch.length - owned.length;
      if (!owned.length) continue;
      const ids = owned.map(storage => storage.id);
      const [fileRows, claimRows] = await Promise.all([
        files.find({ where: { storageId: In(ids) } }),
        claims.find({ where: { storageId: In(ids) } }),
      ]);
      const result = await client.importStorage(
        owned.map(storage =>
          toImported(
            storage,
            fileRows.filter(file => file.storageId === storage.id),
            claimRows.filter(claim => claim.storageId === storage.id)
          )
        )
      );
      imported += result.imported;
      skipped += result.skipped;
    }
    const stored = await client.completeImport();
    logger.info(
      'MediaLoad',
      `Storage handed to media-load: ${imported} imported, ${skipped} skipped, ${stored} stored there`
    );
  };
