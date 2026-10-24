import { In, IsNull, LessThanOrEqual, type Repository } from 'typeorm';

import type { Database } from '@database/database';
import { Storage } from '@entities/storage.entity';
import { StorageFile } from '@entities/storage-file.entity';
import { CLAIM_RANK, type ClaimKind, StorageFileClaim } from '@entities/storage-file-claim.entity';

export interface ClaimInput {
  kind: ClaimKind;
  ownerKey: string;
  /** Start of the wanted range in bytes; defaults to the file start. */
  rangeStart?: number;
  /** End of the wanted range in bytes; null or omitted wants the whole file. */
  rangeEnd?: number | null;
  expiresAt?: Date | null;
}

/** SQL rank of a claim row alias `c`; unclaimed storage ranks 0. */
const CLAIM_RANK_SQL = `CASE c.kind ${Object.entries(CLAIM_RANK)
  .map(([kind, rank]) => `WHEN '${kind}' THEN ${rank}`)
  .join(' ')} ELSE 0 END`;

const LIVE_CLAIM = 'c.storageId = s.id AND (c.expiresAt IS NULL OR c.expiresAt > :now)';

export class StorageFileRepository {
  private readonly files: Repository<StorageFile>;
  private readonly claims: Repository<StorageFileClaim>;

  constructor(private readonly database: Database) {
    this.files = database.getRepository(StorageFile);
    this.claims = database.getRepository(StorageFileClaim);
  }

  /** Record a source's file table; existing rows (and their completion) are kept. */
  async upsertFiles(
    storageId: number,
    files: ReadonlyArray<{ path: string; offset: number; length: number }>
  ): Promise<void> {
    if (!files.length) return;
    await this.database.write(() =>
      this.files
        .createQueryBuilder()
        .insert()
        .into(StorageFile)
        .values(files.map(file => ({ storageId, ...file, completedAt: null })))
        .orIgnore()
        .execute()
    );
  }

  findFiles(storageId: number): Promise<StorageFile[]> {
    return this.files.find({ where: { storageId } });
  }

  async markFilesComplete(storageId: number, paths: string[], at = new Date()): Promise<void> {
    if (!paths.length) return;
    await this.files.update(
      { storageId, path: In(paths), completedAt: IsNull() },
      { completedAt: at }
    );
  }

  /** Forget the completion of files whose pieces were cleared. */
  async clearFilesComplete(storageId: number, paths: string[]): Promise<void> {
    if (!paths.length) return;
    await this.files.update({ storageId, path: In(paths) }, { completedAt: null });
  }

  /** Insert or refresh one owner's claim on a file. */
  async upsertClaim(storageId: number, path: string, claim: ClaimInput): Promise<void> {
    await this.database.write(() =>
      this.claims
        .createQueryBuilder()
        .insert()
        .into(StorageFileClaim)
        .values({
          storageId,
          path,
          kind: claim.kind,
          ownerKey: claim.ownerKey,
          rangeStart: claim.rangeStart ?? 0,
          rangeEnd: claim.rangeEnd ?? null,
          expiresAt: claim.expiresAt ?? null,
          updatedAt: new Date(),
        })
        .orUpdate(
          ['rangeStart', 'rangeEnd', 'expiresAt', 'updatedAt'],
          ['storageId', 'path', 'kind', 'ownerKey']
        )
        .execute()
    );
  }

  async deleteClaims(
    storageId: number,
    where: { ownerKey?: string; kind?: ClaimKind; path?: string } = {}
  ): Promise<void> {
    await this.claims.delete({ storageId, ...where });
  }

  /** Claims that are still live at `now`, for one storage or (omitted) every storage. */
  findLiveClaims(storageId?: number, now = new Date()): Promise<StorageFileClaim[]> {
    const query = this.claims
      .createQueryBuilder('c')
      .where('(c.expiresAt IS NULL OR c.expiresAt > :now)', { now });
    if (storageId !== undefined) query.andWhere('c.storageId = :storageId', { storageId });
    return query.getMany();
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
    const condition = {
      ...(where.expiredAt ? { expiresAt: LessThanOrEqual(where.expiredAt) } : {}),
      ...(where.kind ? { kind: where.kind } : {}),
    };
    const rows = await this.claims.find({ where: condition, select: { storageId: true } });
    if (!rows.length) return [];
    await this.claims.delete(condition);
    return [...new Set(rows.map(row => row.storageId))];
  }

  /**
   * Idle storage (no active stream), least protected first: by strongest live claim rank (storage
   * with no live claims ranks 0), then least recently wanted. Whether any of it may actually go
   * depends on the rank of each file; see `StorageService.reclaimFiles`.
   */
  async findIdleStorageIds(excludeSourceId?: number, now = new Date()): Promise<number[]> {
    const query = this.database
      .getRepository(Storage)
      .createQueryBuilder('s')
      .leftJoin(StorageFileClaim, 'c', LIVE_CLAIM, { now })
      .select('s.id', 'id')
      .addSelect(`COALESCE(MAX(${CLAIM_RANK_SQL}), 0)`, 'claimRank')
      .where('s.activeStreams = 0')
      .groupBy('s.id')
      .orderBy('claimRank', 'ASC')
      .addOrderBy('s.lastInterestAt', 'ASC')
      .addOrderBy('s.lastAccessAt', 'ASC')
      .addOrderBy('s.createdAt', 'ASC');
    if (excludeSourceId !== undefined)
      query.andWhere('s.sourceId != :excludeSourceId', { excludeSourceId });
    const rows = await query.getRawMany<{ id: number }>();
    return rows.map(row => Number(row.id));
  }

  /** Sources whose live claims are all speculative (nobody is watching or has watched them). */
  async findSpeculativeSourceIds(now = new Date()): Promise<number[]> {
    const rows = await this.database
      .getRepository(Storage)
      .createQueryBuilder('s')
      .innerJoin(StorageFileClaim, 'c', LIVE_CLAIM, { now })
      .select('s.sourceId', 'sourceId')
      .groupBy('s.id')
      .having(`SUM(CASE WHEN c.kind IN ('playback', 'watched') THEN 1 ELSE 0 END) = 0`)
      .getRawMany<{ sourceId: number }>();
    return rows.map(row => Number(row.sourceId));
  }
}
