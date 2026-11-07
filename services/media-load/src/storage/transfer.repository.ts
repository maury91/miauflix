import type { TransferSample } from '@miauflix/service-contracts';
import type { Database } from 'bun:sqlite';

/** One source's 5-second window: the sample, and the bytes to add to its totals. */
export interface TransferWindow extends TransferSample {
  storageId: number;
  downloaded: number;
  uploaded: number;
}

export interface TransferTotals {
  totalDownloaded: number;
  totalUploaded: number;
}

/** Lifetime transfer totals (storage columns) and the 5-second samples. */
export class TransferRepository {
  constructor(private readonly db: Database) {}

  /** Where each storage downloads to, to match it with its loaded torrent. */
  locations(): Array<{ id: number; sourceId: number; location: string }> {
    return this.db
      .query<
        { id: number; sourceId: number; location: string },
        []
      >('SELECT id, sourceId, location FROM storage')
      .all();
  }

  /**
   * Add each window's bytes to its storage's totals and store its sample, in one transaction.
   * A sample where nothing moved and no peer was connected is not stored.
   */
  record(windows: TransferWindow[]): void {
    if (!windows.length) return;
    const totals = this.db.query(
      'UPDATE storage SET totalDownloaded = totalDownloaded + ?, totalUploaded = totalUploaded + ? WHERE id = ?'
    );
    const sample = this.db.query(
      `INSERT OR REPLACE INTO transfer_sample (storageId, at, downloadSpeed, uploadSpeed, peers)
       SELECT ?1, ?2, ?3, ?4, ?5 WHERE EXISTS (SELECT 1 FROM storage WHERE id = ?1)`
    );
    this.db.transaction(() => {
      for (const window of windows) {
        if (window.downloaded || window.uploaded)
          totals.run(window.downloaded, window.uploaded, window.storageId);
        if (window.downloadSpeed || window.uploadSpeed || window.peers)
          sample.run(
            window.storageId,
            window.at,
            window.downloadSpeed,
            window.uploadSpeed,
            window.peers
          );
      }
    })();
  }

  totals(): Map<number, TransferTotals> {
    return new Map(
      this.db
        .query<TransferTotals & { sourceId: number }, []>(
          'SELECT sourceId, totalDownloaded, totalUploaded FROM storage'
        )
        .all()
        .map(({ sourceId, ...totals }) => [sourceId, totals])
    );
  }

  /** A source's samples after `since`, oldest first. */
  history(sourceId: number, since = 0): TransferSample[] {
    return this.db
      .query<TransferSample, [number, number]>(
        `SELECT s.at, s.downloadSpeed, s.uploadSpeed, s.peers FROM transfer_sample s
         JOIN storage ON storage.id = s.storageId
         WHERE storage.sourceId = ? AND s.at > ? ORDER BY s.at`
      )
      .all(sourceId, since);
  }

  /** Delete samples taken before `before` (epoch ms); returns how many. */
  prune(before: number): number {
    return this.db.query('DELETE FROM transfer_sample WHERE at < ?').run(before).changes;
  }
}
