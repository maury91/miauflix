import type { Database } from 'bun:sqlite';

import type { Encryption } from '../lib/encryption';
import type { SourceRepository } from './source.repository';
import type { EncryptedStorageLayout, Storage } from './types';

interface StorageRow {
  id: number;
  sourceId: number;
  downloadedPieces: Uint8Array;
  size: number;
  logicalBytes: number;
  verifiedBytes: number;
  allocatedBytes: number;
  reservedBytes: number;
  totalPieces: number;
  pieceLength: number;
  lastInterestAt: number | null;
  videoCompletedAt: number | null;
  localOnly: number;
  encryptedLayout: string | null;
  activeStreams: number;
  downloaded: number;
  location: string;
  lastAccessAt: number | null;
  lastWriteAt: number | null;
  createdAt: number;
  updatedAt: number;
}

type StorageValues = Partial<Omit<Storage, 'contentSource' | 'createdAt' | 'id' | 'updatedAt'>>;

const COLUMNS = [
  'sourceId',
  'downloadedPieces',
  'size',
  'logicalBytes',
  'verifiedBytes',
  'allocatedBytes',
  'reservedBytes',
  'totalPieces',
  'pieceLength',
  'lastInterestAt',
  'videoCompletedAt',
  'localOnly',
  'encryptedLayout',
  'activeStreams',
  'downloaded',
  'location',
  'lastAccessAt',
  'lastWriteAt',
] as const satisfies ReadonlyArray<keyof StorageValues>;

const date = (value: number | null): Date | null => (value === null ? null : new Date(value));

/** Storage records, as the backend's TypeORM repository returned them. */
export class StorageRepository {
  constructor(
    private readonly db: Database,
    private readonly encryption: Encryption,
    private readonly sources: SourceRepository
  ) {}

  private toStorage(row: StorageRow, withSource = false): Storage {
    const storage: Storage = {
      ...row,
      downloadedPieces: new Uint8Array(row.downloadedPieces ?? []),
      localOnly: Boolean(row.localOnly),
      encryptedLayout: row.encryptedLayout
        ? (JSON.parse(this.encryption.decryptString(row.encryptedLayout)) as EncryptedStorageLayout)
        : null,
      lastInterestAt: date(row.lastInterestAt),
      videoCompletedAt: date(row.videoCompletedAt),
      lastAccessAt: date(row.lastAccessAt),
      lastWriteAt: date(row.lastWriteAt),
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
    if (withSource) storage.contentSource = this.sources.findByIdSync(row.sourceId);
    return storage;
  }

  /** Column values for a write, encoded for SQLite. */
  private encode(values: StorageValues): Record<string, unknown> {
    const encoded: Record<string, unknown> = {};
    for (const column of COLUMNS) {
      if (!(column in values)) continue;
      const value = values[column];
      if (value === undefined) continue;
      if (column === 'encryptedLayout') {
        encoded[column] = value ? this.encryption.encryptString(JSON.stringify(value)) : null;
      } else if (value instanceof Date) encoded[column] = value.getTime();
      else if (typeof value === 'boolean') encoded[column] = value ? 1 : 0;
      else encoded[column] = value;
    }
    return encoded;
  }

  private one(where: string, ...params: Array<number | string>): StorageRow | null {
    return this.db
      .query<StorageRow, Array<number | string>>(`SELECT * FROM storage WHERE ${where}`)
      .get(...params);
  }

  async findById(id: number): Promise<Storage | null> {
    const row = this.one('id = ?', id);
    return row ? this.toStorage(row) : null;
  }

  async findBySourceId(sourceId: number): Promise<Storage | null> {
    const row = this.one('sourceId = ?', sourceId);
    return row ? this.toStorage(row) : null;
  }

  async findBySourceIdWithRelation(sourceId: number): Promise<Storage | null> {
    const row = this.one('sourceId = ?', sourceId);
    return row ? this.toStorage(row, true) : null;
  }

  /** Every storage with its source, largest charge first (the admin inventory). */
  async findAll(): Promise<Storage[]> {
    return this.db
      .query<StorageRow, []>(
        'SELECT * FROM storage ORDER BY allocatedBytes DESC, reservedBytes DESC, id ASC'
      )
      .all()
      .map(row => this.toStorage(row, true));
  }

  async findStoragesWithCompletion(): Promise<Storage[]> {
    return this.db
      .query<StorageRow, []>('SELECT * FROM storage WHERE videoCompletedAt IS NOT NULL')
      .all()
      .map(row => this.toStorage(row, true));
  }

  async create(storage: StorageValues): Promise<Storage> {
    const now = Date.now();
    const values = {
      downloadedPieces: new Uint8Array(0),
      ...this.encode(storage),
      createdAt: now,
      updatedAt: now,
    };
    const columns = Object.keys(values);
    const { lastInsertRowid } = this.db
      .query(
        `INSERT INTO storage (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`
      )
      .run(...(Object.values(values) as never[]));
    return (await this.findById(Number(lastInsertRowid)))!;
  }

  async update(id: number, storage: StorageValues): Promise<Storage | null> {
    const values = { ...this.encode(storage), updatedAt: Date.now() };
    this.db
      .query(
        `UPDATE storage SET ${Object.keys(values)
          .map(column => `${column} = ?`)
          .join(', ')} WHERE id = ?`
      )
      .run(...(Object.values(values) as never[]), id);
    return this.findById(id);
  }

  async delete(id: number): Promise<boolean> {
    return this.db.query('DELETE FROM storage WHERE id = ?').run(id).changes > 0;
  }

  async deleteBySourceId(sourceId: number): Promise<boolean> {
    return this.db.query('DELETE FROM storage WHERE sourceId = ?').run(sourceId).changes > 0;
  }

  async updateLastAccess(id: number): Promise<void> {
    await this.update(id, { lastAccessAt: new Date() });
  }

  async updateDownloadProgress(
    id: number,
    downloaded: number,
    downloadedPieces: Uint8Array,
    size?: number
  ): Promise<void> {
    await this.update(id, {
      downloaded,
      downloadedPieces,
      lastWriteAt: new Date(),
      ...(size !== undefined ? { size } : {}),
    });
  }

  async updateAccounting(
    id: number,
    accounting: Partial<Pick<Storage, 'logicalBytes' | 'verifiedBytes'>>
  ): Promise<void> {
    await this.update(id, accounting);
  }

  async reconcileAllocation(id: number, allocatedBytes: number): Promise<void> {
    this.db
      .query(
        `UPDATE storage SET allocatedBytes = ?1,
           reservedBytes = CASE WHEN ?1 >= reservedBytes THEN 0 ELSE reservedBytes END,
           updatedAt = ?2
         WHERE id = ?3`
      )
      .run(allocatedBytes, Date.now(), id);
  }

  async changeActiveStreams(id: number, delta: -1 | 1): Promise<boolean> {
    const expression =
      delta === 1
        ? 'activeStreams + 1'
        : 'CASE WHEN activeStreams > 0 THEN activeStreams - 1 ELSE 0 END';
    const now = Date.now();
    return (
      this.db
        .query(
          `UPDATE storage SET activeStreams = ${expression}, lastInterestAt = ?, updatedAt = ? WHERE id = ?`
        )
        .run(now, now, id).changes > 0
    );
  }

  async resetActiveStreams(): Promise<void> {
    this.db
      .query('UPDATE storage SET activeStreams = 0, updatedAt = ? WHERE activeStreams > 0')
      .run(Date.now());
  }

  /** Storage not accessed for `daysSinceLastAccess` days (or never), oldest first. */
  async findOldUnaccessed(daysSinceLastAccess: number, limit?: number): Promise<Storage[]> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysSinceLastAccess);
    return this.db
      .query<StorageRow, [number, number]>(
        `SELECT * FROM storage WHERE lastAccessAt < ? OR lastAccessAt IS NULL
         ORDER BY lastAccessAt ASC LIMIT ?`
      )
      .all(cutoff.getTime(), limit ?? -1)
      .map(row => this.toStorage(row));
  }

  async getStorageCount(): Promise<number> {
    return (this.db.query('SELECT COUNT(*) AS count FROM storage').get() as { count: number })
      .count;
  }

  private sum(expression: string): bigint {
    const row = this.db.query(`SELECT SUM(${expression}) AS total FROM storage`).get() as {
      total: number | null;
    };
    return BigInt(row.total ?? 0);
  }

  async getTotalStorageUsage(): Promise<bigint> {
    return this.sum('size');
  }

  /** Application charge: physical allocation, or the reservation until measured. */
  async getChargedStorageUsage(): Promise<bigint> {
    return this.sum('MAX(allocatedBytes, reservedBytes)');
  }

  async getTotalReservedStorageUsage(): Promise<bigint> {
    return this.sum('reservedBytes');
  }

  async findByDownloadedRange(minProgress: number, maxProgress: number): Promise<Storage[]> {
    return this.db
      .query<StorageRow, [number, number]>(
        'SELECT * FROM storage WHERE downloaded >= ? AND downloaded <= ? ORDER BY downloaded DESC'
      )
      .all(minProgress, maxProgress)
      .map(row => this.toStorage(row));
  }
}
