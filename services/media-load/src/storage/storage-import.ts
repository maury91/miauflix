import type { ImportedSource } from '@miauflix/service-contracts';

import type { MediaLoadDatabase } from '../db/database';
import { ErrorWithStatus } from '../lib/errors';

const IMPORTED_KEY = 'storage_import';

const time = (value: string | null): number | null => (value ? new Date(value).getTime() : null);

/**
 * The one-time import of the storage the backend recorded before media-load ran the engine.
 * Each source is written in one transaction and skipped when the service already stores it, so
 * a batch retried after a crash adds only what is missing. Completion is recorded in `meta`.
 */
export class StorageImporter {
  constructor(private readonly database: MediaLoadDatabase) {}

  get imported(): boolean {
    return (
      this.database.db
        .query<{ value: string }, [string]>('SELECT value FROM meta WHERE key = ?')
        .get(IMPORTED_KEY) !== null
    );
  }

  /** @throws ErrorWithStatus `import_closed` once the import finished. */
  async importItems(items: ImportedSource[]): Promise<{ imported: number; skipped: number }> {
    if (this.imported)
      throw new ErrorWithStatus('The storage import already finished', 'import_closed');
    let imported = 0;
    for (const item of items) {
      // The descriptor first: storage rows reference it. A descriptor alone is harmless.
      await this.database.getSourceRepository().put({
        id: item.source.id,
        hash: item.source.hash,
        magnetLink: item.source.magnetLink,
        size: item.source.size || 0,
        ...(item.source.file ? { file: Buffer.from(item.source.file, 'base64') } : {}),
      });
      if (this.importOne(item)) imported++;
    }
    return { imported, skipped: items.length - imported };
  }

  /** Close the import; returns how many storages the service holds. */
  complete(): number {
    const { db } = this.database;
    db.query('INSERT OR IGNORE INTO meta (key, value) VALUES (?, ?)').run(
      IMPORTED_KEY,
      new Date().toISOString()
    );
    return (db.query('SELECT COUNT(*) AS count FROM storage').get() as { count: number }).count;
  }

  private importOne({ source, storage, files, claims }: ImportedSource): boolean {
    const { db, encryption } = this.database;
    const key = (path: string) => encryption.encryptString(path, true);
    return db.transaction(() => {
      const existing = db.query('SELECT id FROM storage WHERE sourceId = ?').get(source.id);
      if (existing) return false;
      const { lastInsertRowid } = db
        .query(
          `INSERT INTO storage (sourceId, downloadedPieces, size, logicalBytes, verifiedBytes,
             allocatedBytes, reservedBytes, totalPieces, pieceLength, lastInterestAt,
             videoCompletedAt, localOnly, encryptedLayout, activeStreams, downloaded, location,
             lastAccessAt, lastWriteAt, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          source.id,
          Buffer.from(storage.downloadedPieces, 'base64'),
          storage.size,
          storage.logicalBytes,
          storage.verifiedBytes,
          storage.allocatedBytes,
          storage.reservedBytes,
          storage.totalPieces,
          storage.pieceLength,
          time(storage.lastInterestAt),
          time(storage.videoCompletedAt),
          storage.localOnly ? 1 : 0,
          storage.encryptedLayout
            ? encryption.encryptString(JSON.stringify(storage.encryptedLayout))
            : null,
          storage.downloaded,
          storage.location,
          time(storage.lastAccessAt),
          time(storage.lastWriteAt),
          time(storage.createdAt) ?? Date.now(),
          time(storage.updatedAt) ?? Date.now()
        );
      const storageId = Number(lastInsertRowid);
      const insertFile = db.query(
        `INSERT OR IGNORE INTO storage_file (storageId, k, offset, length, completedAt)
         VALUES (?, ?, ?, ?, ?)`
      );
      for (const file of files)
        insertFile.run(storageId, key(file.path), file.offset, file.length, time(file.completedAt));
      const insertClaim = db.query(
        `INSERT OR IGNORE INTO storage_file_claim
           (storageId, k, kind, ownerKey, rangeStart, rangeEnd, expiresAt, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      const now = Date.now();
      // Playback claims belong to streams of the previous run; none is open now.
      for (const claim of claims)
        if (claim.kind !== 'playback')
          insertClaim.run(
            storageId,
            key(claim.path),
            claim.kind,
            claim.ownerKey,
            claim.rangeStart,
            claim.rangeEnd,
            time(claim.expiresAt),
            now,
            now
          );
      return true;
    })();
  }
}
