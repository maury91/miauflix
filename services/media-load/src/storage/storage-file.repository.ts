import type { Database } from 'bun:sqlite';

import type { Encryption } from '../lib/encryption';
import {
  CLAIM_RANK,
  type ClaimInput,
  type ClaimKind,
  type StorageFile,
  type StorageFileClaim,
} from './types';

interface FileRow {
  id: number;
  storageId: number;
  k: string;
  offset: number;
  length: number;
  completedAt: number | null;
}

interface ClaimRow {
  id: number;
  storageId: number;
  k: string;
  kind: ClaimKind;
  ownerKey: string;
  rangeStart: number;
  rangeEnd: number | null;
  expiresAt: number | null;
  createdAt: number;
  updatedAt: number;
}

/** SQL rank of a claim row alias `c`; unclaimed storage ranks 0. */
const CLAIM_RANK_SQL = `CASE c.kind ${Object.entries(CLAIM_RANK)
  .map(([kind, rank]) => `WHEN '${kind}' THEN ${rank}`)
  .join(' ')} ELSE 0 END`;

const LIVE_CLAIM = 'c.storageId = s.id AND (c.expiresAt IS NULL OR c.expiresAt > $now)';

/** Files of stored sources and the claims on them. Paths are stored encrypted (column `k`). */
export class StorageFileRepository {
  constructor(
    private readonly db: Database,
    private readonly encryption: Encryption
  ) {}

  /** The stored form of a path: deterministic, so equal paths compare equal. */
  private key(path: string): string {
    return this.encryption.encryptString(path, true);
  }

  private toFile(row: FileRow): StorageFile {
    return {
      id: row.id,
      storageId: row.storageId,
      path: this.encryption.decryptString(row.k),
      offset: row.offset,
      length: row.length,
      completedAt: row.completedAt === null ? null : new Date(row.completedAt),
    };
  }

  private toClaim(row: ClaimRow): StorageFileClaim {
    return {
      id: row.id,
      storageId: row.storageId,
      path: this.encryption.decryptString(row.k),
      kind: row.kind,
      ownerKey: row.ownerKey,
      rangeStart: row.rangeStart,
      rangeEnd: row.rangeEnd,
      expiresAt: row.expiresAt === null ? null : new Date(row.expiresAt),
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  }

  /** Record a source's file table; existing rows (and their completion) are kept. */
  async upsertFiles(
    storageId: number,
    files: ReadonlyArray<{ path: string; offset: number; length: number }>
  ): Promise<void> {
    if (!files.length) return;
    const insert = this.db.query(
      'INSERT OR IGNORE INTO storage_file (storageId, k, offset, length, completedAt) VALUES (?, ?, ?, ?, NULL)'
    );
    this.db.transaction(() => {
      for (const file of files)
        insert.run(storageId, this.key(file.path), file.offset, file.length);
    })();
  }

  async findFiles(storageId: number): Promise<StorageFile[]> {
    return this.db
      .query<FileRow, [number]>('SELECT * FROM storage_file WHERE storageId = ?')
      .all(storageId)
      .map(row => this.toFile(row));
  }

  private inPaths(paths: string[]): { sql: string; keys: string[] } {
    return { sql: paths.map(() => '?').join(', '), keys: paths.map(path => this.key(path)) };
  }

  async markFilesComplete(storageId: number, paths: string[], at = new Date()): Promise<void> {
    if (!paths.length) return;
    const { sql, keys } = this.inPaths(paths);
    this.db
      .query(
        `UPDATE storage_file SET completedAt = ? WHERE storageId = ? AND completedAt IS NULL AND k IN (${sql})`
      )
      .run(at.getTime(), storageId, ...keys);
  }

  /** Forget the completion of files whose pieces were cleared. */
  async clearFilesComplete(storageId: number, paths: string[]): Promise<void> {
    if (!paths.length) return;
    const { sql, keys } = this.inPaths(paths);
    this.db
      .query(`UPDATE storage_file SET completedAt = NULL WHERE storageId = ? AND k IN (${sql})`)
      .run(storageId, ...keys);
  }

  /** Insert or refresh one owner's claim on a file. */
  async upsertClaim(storageId: number, path: string, claim: ClaimInput): Promise<void> {
    const now = Date.now();
    this.db
      .query(
        `INSERT INTO storage_file_claim
           (storageId, k, kind, ownerKey, rangeStart, rangeEnd, expiresAt, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (storageId, k, kind, ownerKey) DO UPDATE SET
           rangeStart = excluded.rangeStart, rangeEnd = excluded.rangeEnd,
           expiresAt = excluded.expiresAt, updatedAt = excluded.updatedAt`
      )
      .run(
        storageId,
        this.key(path),
        claim.kind,
        claim.ownerKey,
        claim.rangeStart ?? 0,
        claim.rangeEnd ?? null,
        claim.expiresAt ? claim.expiresAt.getTime() : null,
        now,
        now
      );
  }

  async deleteClaims(
    storageId: number,
    where: { ownerKey?: string; kind?: ClaimKind; path?: string } = {}
  ): Promise<void> {
    const conditions = ['storageId = ?'];
    const params: Array<number | string> = [storageId];
    if (where.ownerKey !== undefined) {
      conditions.push('ownerKey = ?');
      params.push(where.ownerKey);
    }
    if (where.kind !== undefined) {
      conditions.push('kind = ?');
      params.push(where.kind);
    }
    if (where.path !== undefined) {
      conditions.push('k = ?');
      params.push(this.key(where.path));
    }
    this.db
      .query(`DELETE FROM storage_file_claim WHERE ${conditions.join(' AND ')}`)
      .run(...params);
  }

  /** Claims that are still live at `now`, for one storage or (omitted) every storage. */
  async findLiveClaims(storageId?: number, now = new Date()): Promise<StorageFileClaim[]> {
    const rows =
      storageId === undefined
        ? this.db
            .query<
              ClaimRow,
              [number]
            >('SELECT * FROM storage_file_claim WHERE expiresAt IS NULL OR expiresAt > ?')
            .all(now.getTime())
        : this.db
            .query<
              ClaimRow,
              [number, number]
            >('SELECT * FROM storage_file_claim WHERE (expiresAt IS NULL OR expiresAt > ?) AND storageId = ?')
            .all(now.getTime(), storageId);
    return rows.map(row => this.toClaim(row));
  }

  /** Give other files (subtitle sidecars) the same live claims as a source file. */
  async copyClaims(storageId: number, fromPath: string, toPaths: string[]): Promise<void> {
    const live = (await this.findLiveClaims(storageId)).filter(claim => claim.path === fromPath);
    for (const path of toPaths) {
      for (const claim of live) {
        await this.upsertClaim(storageId, path, {
          kind: claim.kind,
          ownerKey: claim.ownerKey,
          expiresAt: claim.expiresAt,
        });
      }
    }
  }

  /** Delete expired claims, or every claim of a kind; returns the affected storage ids. */
  async deleteClaimsWhere(where: { expiredAt?: Date; kind?: ClaimKind }): Promise<number[]> {
    const conditions: string[] = [];
    const params: Array<number | string> = [];
    if (where.expiredAt) {
      conditions.push('expiresAt <= ?');
      params.push(where.expiredAt.getTime());
    }
    if (where.kind) {
      conditions.push('kind = ?');
      params.push(where.kind);
    }
    const filter = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = this.db
      .query<
        { storageId: number },
        Array<number | string>
      >(`SELECT DISTINCT storageId FROM storage_file_claim ${filter}`)
      .all(...params);
    if (!rows.length) return [];
    this.db.query(`DELETE FROM storage_file_claim ${filter}`).run(...params);
    return rows.map(row => row.storageId);
  }

  /**
   * Idle storage (no active stream), least protected first: by strongest live claim rank (storage
   * with no live claims ranks 0), then least recently wanted. Whether any of it may actually go
   * depends on the rank of each file; see `StorageService.reclaimFiles`.
   */
  async findIdleStorageIds(excludeSourceId?: number, now = new Date()): Promise<number[]> {
    const exclude = excludeSourceId === undefined ? '' : 'AND s.sourceId != $exclude';
    return this.db
      .query<{ id: number }, Record<string, number>>(
        `SELECT s.id AS id, COALESCE(MAX(${CLAIM_RANK_SQL}), 0) AS claimRank
         FROM storage s LEFT JOIN storage_file_claim c ON ${LIVE_CLAIM}
         WHERE s.activeStreams = 0 ${exclude}
         GROUP BY s.id
         ORDER BY claimRank ASC, s.lastInterestAt ASC, s.lastAccessAt ASC, s.createdAt ASC`
      )
      .all({
        $now: now.getTime(),
        ...(excludeSourceId === undefined ? {} : { $exclude: excludeSourceId }),
      })
      .map(row => Number(row.id));
  }

  /** Sources whose live claims are all speculative (nobody is watching or has watched them). */
  async findSpeculativeSourceIds(now = new Date()): Promise<number[]> {
    return this.db
      .query<{ sourceId: number }, Record<string, number>>(
        `SELECT s.sourceId AS sourceId
         FROM storage s INNER JOIN storage_file_claim c ON ${LIVE_CLAIM}
         GROUP BY s.id
         HAVING SUM(CASE WHEN c.kind IN ('playback', 'watched') THEN 1 ELSE 0 END) = 0`
      )
      .all({ $now: now.getTime() })
      .map(row => Number(row.sourceId));
  }
}
