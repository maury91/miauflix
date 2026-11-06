import { lstatSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';

import type { ImportedSource } from '@miauflix/service-contracts';

import type { MediaLoadDatabase } from '../db/database';
import { ErrorWithStatus } from '../lib/errors';

const IMPORTED_KEY = 'storage_import';
const SEALED_KEY = 'storage_import_sealed';

const time = (value: string | null): number | null => (value ? new Date(value).getTime() : null);

/**
 * The one-time import of the storage the backend recorded before media-load ran the engine.
 * Each source is written in one transaction and skipped when the service already stores it, so
 * a batch retried after a crash adds only what is missing. Completion is recorded in `meta`.
 */
export class StorageImporter {
  constructor(private readonly database: MediaLoadDatabase) {}

  status(): { imported: boolean; sealed: boolean } {
    const markers = this.database.db
      .query<{ key: string }, [string, string]>('SELECT key FROM meta WHERE key IN (?, ?)')
      .all(IMPORTED_KEY, SEALED_KEY);
    return {
      imported: markers.some(marker => marker.key === IMPORTED_KEY),
      sealed: markers.length > 0,
    };
  }

  private assertOpen(): void {
    if (this.status().sealed)
      throw new ErrorWithStatus('The storage import is closed to writes', 'import_closed');
  }

  /** Import only source directories directly under a configured downloads mount. */
  async importItems(
    items: ImportedSource[],
    downloadRoots: readonly string[]
  ): Promise<{ imported: number; skipped: number }> {
    this.assertOpen();
    const roots = new Set(downloadRoots.map(root => resolve(root)));
    let imported = 0;
    for (const item of items) {
      this.assertOpen();
      const location = this.validateLocation(item, roots);
      // The descriptor first: storage rows reference it. A descriptor alone is harmless.
      await this.database.getSourceRepository().put({
        id: item.source.id,
        hash: item.source.hash,
        magnetLink: item.source.magnetLink,
        size: item.source.size || 0,
        ...(item.source.file ? { file: Buffer.from(item.source.file, 'base64') } : {}),
      });
      if (this.importOne(item, location)) imported++;
    }
    return { imported, skipped: items.length - imported };
  }

  /** Seal writes durably before adoption so a restart can retry adoption alone. */
  seal(): void {
    this.database.db
      .query('INSERT OR IGNORE INTO meta (key, value) VALUES (?, ?)')
      .run(SEALED_KEY, new Date().toISOString());
  }

  /** Record successful adoption and return how many storages the service holds. */
  complete(): number {
    const { db } = this.database;
    return db.transaction(() => {
      const { count } = db
        .query<{ count: number }, []>('SELECT COUNT(*) AS count FROM storage')
        .get()!;
      db.query('INSERT OR IGNORE INTO meta (key, value) VALUES (?, ?)').run(
        IMPORTED_KEY,
        new Date().toISOString()
      );
      db.query('DELETE FROM meta WHERE key = ?').run(SEALED_KEY);
      return count;
    })();
  }

  private validateLocation(item: ImportedSource, roots: ReadonlySet<string>): string {
    const input = item.storage.location;
    const location =
      typeof input === 'string' && input && !input.includes('\0') ? resolve(input) : '';
    if (roots.has(dirname(location)) && /^[a-f0-9]{16}$/.test(basename(location))) {
      // A missing directory is valid for a reserved download. Never follow a final symlink.
      const entry = lstatSync(location, { throwIfNoEntry: false });
      if (!entry || entry.isDirectory()) return location;
    }
    throw new ErrorWithStatus(
      `Invalid storage location for legacy source ${item.source.id}`,
      'invalid_storage_location'
    );
  }

  private importOne({ source, storage, files, claims }: ImportedSource, location: string): boolean {
    const { db, encryption } = this.database;
    const key = (path: string) => encryption.encryptString(path, true);
    return db.transaction(() => {
      this.assertOpen();
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
          location,
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
