import type {
  RemuxPlan,
  RemuxPriority,
  RemuxSidecar,
  RemuxState,
} from '@miauflix/service-contracts';
import type { Database } from 'bun:sqlite';

import type { Encryption } from '../lib/encryption';

/** Queue order: lower runs first. */
export const PRIORITY_RANK: Record<RemuxPriority, number> = { watching: 0, next: 1, background: 2 };
const PRIORITY_BY_RANK = Object.fromEntries(
  Object.entries(PRIORITY_RANK).map(([priority, rank]) => [rank, priority])
) as Record<number, RemuxPriority>;

export interface RemuxRecord {
  id: number;
  storageId: number;
  sourceId: number;
  location: string;
  filePath: string;
  plan: RemuxPlan;
  priority: RemuxPriority;
  state: RemuxState;
  readySeconds: number;
  bytes: number;
  error: string | null;
  completedAt: number | null;
  createdAt: number;
}

export type RemuxFileKind = 'segment' | 'sidecar';

export interface RemuxFile {
  id: number;
  remuxId: number;
  name: string;
  kind: RemuxFileKind;
  /** Position of a segment in the playlist. */
  seq: number | null;
  /** Seconds of a segment. */
  duration: number | null;
  /** A sidecar's track. */
  sidecar: RemuxSidecar | null;
  size: number;
}

interface RemuxRow {
  id: number;
  storageId: number;
  sourceId: number;
  location: string;
  k: string;
  plan: string;
  priority: number;
  state: RemuxState;
  readySeconds: number;
  bytes: number;
  error: string | null;
  completedAt: number | null;
  createdAt: number;
}

interface FileRow {
  id: number;
  remuxId: number;
  name: string;
  kind: RemuxFileKind;
  seq: number | null;
  duration: number | null;
  meta: string | null;
  size: number;
}

const SELECT_REMUX = `SELECT r.id, r.storageId, s.sourceId, s.location, r.k, r.plan, r.priority, r.state,
  r.readySeconds, r.bytes, r.error, r.completedAt, r.createdAt
  FROM remux r JOIN storage s ON s.id = r.storageId`;

/** Remuxes of stored files and the files they are made of. Paths and plans are stored encrypted. */
export class RemuxRepository {
  constructor(
    private readonly db: Database,
    private readonly encryption: Encryption
  ) {}

  private key(path: string): string {
    return this.encryption.encryptString(path, true);
  }

  private toRecord(row: RemuxRow): RemuxRecord {
    return {
      id: row.id,
      storageId: row.storageId,
      sourceId: row.sourceId,
      location: row.location,
      filePath: this.encryption.decryptString(row.k),
      plan: JSON.parse(this.encryption.decryptString(row.plan)) as RemuxPlan,
      priority: PRIORITY_BY_RANK[row.priority] ?? 'background',
      state: row.state,
      readySeconds: row.readySeconds,
      bytes: row.bytes,
      error: row.error,
      completedAt: row.completedAt,
      createdAt: row.createdAt,
    };
  }

  private toFile(row: FileRow): RemuxFile {
    return {
      id: row.id,
      remuxId: row.remuxId,
      name: row.name,
      kind: row.kind,
      seq: row.seq,
      duration: row.duration,
      sidecar: row.meta
        ? (JSON.parse(this.encryption.decryptString(row.meta)) as RemuxSidecar)
        : null,
      size: row.size,
    };
  }

  find(sourceId: number, filePath: string): RemuxRecord | null {
    const row = this.db
      .query<RemuxRow, [number, string]>(`${SELECT_REMUX} WHERE s.sourceId = ? AND r.k = ?`)
      .get(sourceId, this.key(filePath));
    return row ? this.toRecord(row) : null;
  }

  findById(id: number): RemuxRecord | null {
    const row = this.db.query<RemuxRow, [number]>(`${SELECT_REMUX} WHERE r.id = ?`).get(id);
    return row ? this.toRecord(row) : null;
  }

  /** Queued remuxes, the next to run first. */
  queued(): RemuxRecord[] {
    return this.db
      .query<RemuxRow, []>(
        `${SELECT_REMUX} WHERE r.state = 'queued' ORDER BY r.priority, r.createdAt, r.id`
      )
      .all()
      .map(row => this.toRecord(row));
  }

  /** Remuxes left running by a previous process. */
  running(): RemuxRecord[] {
    return this.db
      .query<RemuxRow, []>(`${SELECT_REMUX} WHERE r.state = 'running'`)
      .all()
      .map(row => this.toRecord(row));
  }

  /** Queue a remux; a failed one is queued again with the new plan. */
  upsert(storageId: number, filePath: string, plan: RemuxPlan, priority: RemuxPriority): void {
    const now = Date.now();
    this.db
      .query(
        `INSERT INTO remux (storageId, k, plan, priority, state, createdAt, updatedAt)
         VALUES (?1, ?2, ?3, ?4, 'queued', ?5, ?5)
         ON CONFLICT (storageId, k) DO UPDATE SET
           priority = MIN(priority, excluded.priority),
           plan = CASE WHEN state = 'failed' THEN excluded.plan ELSE plan END,
           error = CASE WHEN state = 'failed' THEN NULL ELSE error END,
           state = CASE WHEN state = 'failed' THEN 'queued' ELSE state END,
           updatedAt = excluded.updatedAt`
      )
      .run(
        storageId,
        this.key(filePath),
        this.encryption.encryptString(JSON.stringify(plan)),
        PRIORITY_RANK[priority],
        now
      );
  }

  setState(id: number, state: RemuxState, error: string | null = null): void {
    const now = Date.now();
    this.db
      .query(`UPDATE remux SET state = ?, error = ?, completedAt = ?, updatedAt = ? WHERE id = ?`)
      .run(state, error, state === 'complete' ? now : null, now, id);
  }

  setProgress(id: number, readySeconds: number): void {
    this.db
      .query('UPDATE remux SET readySeconds = ?, updatedAt = ? WHERE id = ?')
      .run(readySeconds, Date.now(), id);
  }

  /** Record a written file (replacing one of the same name) and count its bytes. */
  addFile(
    remuxId: number,
    file: {
      name: string;
      kind: RemuxFileKind;
      seq?: number;
      duration?: number;
      sidecar?: RemuxSidecar;
      size: number;
    }
  ): RemuxFile {
    return this.db.transaction(() => {
      const previous = this.file(remuxId, file.name);
      if (previous) {
        this.db.query('DELETE FROM remux_file WHERE id = ?').run(previous.id);
        this.db
          .query('UPDATE remux SET bytes = bytes - ? WHERE id = ?')
          .run(previous.size, remuxId);
      }
      const row = this.db
        .query<
          FileRow,
          [number, string, string, number | null, number | null, string | null, number, number]
        >(
          `INSERT INTO remux_file (remuxId, name, kind, seq, duration, meta, size, createdAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           RETURNING id, remuxId, name, kind, seq, duration, meta, size`
        )
        .get(
          remuxId,
          file.name,
          file.kind,
          file.seq ?? null,
          file.duration ?? null,
          file.sidecar ? this.encryption.encryptString(JSON.stringify(file.sidecar)) : null,
          file.size,
          Date.now()
        )!;
      this.db
        .query('UPDATE remux SET bytes = bytes + ?, updatedAt = ? WHERE id = ?')
        .run(file.size, Date.now(), remuxId);
      return this.toFile(row);
    })();
  }

  /** Set a segment's place and length once the playlist lists it. */
  placeSegment(remuxId: number, name: string, seq: number, duration: number): void {
    this.db
      .query('UPDATE remux_file SET seq = ?, duration = ? WHERE remuxId = ? AND name = ?')
      .run(seq, duration, remuxId, name);
  }

  file(remuxId: number, name: string): RemuxFile | null {
    const row = this.db
      .query<
        FileRow,
        [number, string]
      >('SELECT id, remuxId, name, kind, seq, duration, meta, size FROM remux_file WHERE remuxId = ? AND name = ?')
      .get(remuxId, name);
    return row ? this.toFile(row) : null;
  }

  files(remuxId: number): RemuxFile[] {
    return this.db
      .query<FileRow, [number]>(
        `SELECT id, remuxId, name, kind, seq, duration, meta, size FROM remux_file
         WHERE remuxId = ? ORDER BY kind, seq, id`
      )
      .all(remuxId)
      .map(row => this.toFile(row));
  }

  /** Forget a remux's files and progress, to build it again from the start. */
  reset(id: number): void {
    this.db.transaction(() => {
      this.db.query('DELETE FROM remux_file WHERE remuxId = ?').run(id);
      this.db
        .query(
          `UPDATE remux SET state = 'queued', readySeconds = 0, bytes = 0, error = NULL,
             completedAt = NULL, updatedAt = ? WHERE id = ?`
        )
        .run(Date.now(), id);
    })();
  }
}
