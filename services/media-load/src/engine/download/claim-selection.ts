import type { ClaimRequest } from '@miauflix/service-contracts';
import type { Torrent } from 'webtorrent';

import { logger } from '../../lib/logger';
import type { StorageService } from '../../storage/storage.service';
import { CLAIM_PRIORITY, type ClaimInput } from '../../storage/types';
import {
  CLAIM_TTL_MS,
  MATROSKA_TAIL_BYTES,
  RESUME_HEADER_BYTES,
  TAIL_INDEXED_FILE,
} from './constants';
import { getTorrentPieceCount, prefixPieces } from './layout';
import type { TorrentAttacher } from './torrent-attacher';

/** A claim request as stored: its range resolved and its lifetime turned into an expiry. */
export const claimInput = (claim: ClaimRequest): ClaimInput => {
  const ttlMs = claim.ttlMs === undefined ? CLAIM_TTL_MS[claim.kind] : claim.ttlMs;
  return {
    kind: claim.kind,
    ownerKey: claim.ownerKey,
    rangeStart: claim.rangeStart ?? 0,
    rangeEnd: claim.rangeEnd ?? null,
    expiresAt: ttlMs === null ? null : new Date(Date.now() + ttlMs),
  };
};

/** File and piece selections are independent in WebTorrent; clear both. */
export const clearSelection = (torrent: Torrent): void => {
  torrent.files?.forEach(file => file.deselect());
  const pieceCount = torrent.pieces?.length ?? 0;
  if (pieceCount > 0) torrent.deselect?.(0, pieceCount - 1);
};

/**
 * Turns a source's live claims into what its attached torrent downloads, one change at a time
 * per source, and holds a source's selection empty while it is paused.
 */
export class ClaimSelection {
  /** Sources whose selection is held empty (warmup pause or yielding to playback). */
  private readonly pausedSources = new Set<number>();
  /** The last queued selection change of each source; see `serializeSelection`. */
  private readonly selectionTails = new Map<number, Promise<void>>();

  constructor(
    private readonly storageService: StorageService,
    private readonly torrents: TorrentAttacher,
    /** Called after every selection pass, applied or failed (torrent priorities follow it). */
    private readonly onSelectionChanged: () => void
  ) {}

  /** Stop holding a source's selection empty; the next pass applies its claims again. */
  unpause(sourceId: number): void {
    this.pausedSources.delete(sourceId);
  }

  /** Run selection changes for one source in order, so the last applied state is the newest. */
  private serializeSelection(sourceId: number, operation: () => Promise<void>): Promise<void> {
    const run = (this.selectionTails.get(sourceId) ?? Promise.resolve()).then(operation);
    const tail = run.catch(() => undefined);
    this.selectionTails.set(sourceId, tail);
    void tail.then(() => {
      if (this.selectionTails.get(sourceId) === tail) this.selectionTails.delete(sourceId);
    });
    return run;
  }

  /**
   * Apply the union of a source's live claims to its attached torrent: whole files at their
   * highest claim priority, range claims as piece ranges, everything else deselected.
   * A paused source keeps nothing selected until it is resumed.
   */
  reconcileSelection(sourceId: number): Promise<void> {
    return this.serializeSelection(sourceId, async () => {
      const storage = await this.storageService.getStorageBySource(sourceId);
      const torrent = storage && this.torrents.torrentAt(storage.location);
      if (!torrent?.files?.length) return;
      clearSelection(torrent);
      if (this.pausedSources.has(sourceId)) return;
      const wanted = new Map<
        string,
        { priority: number; whole: boolean; ranges: Array<[number, number]>; tail: boolean }
      >();
      for (const claim of await this.storageService.getLiveClaims(sourceId)) {
        const entry = wanted.get(claim.path) ?? {
          priority: 0,
          whole: false,
          ranges: [],
          tail: false,
        };
        entry.priority = Math.max(entry.priority, CLAIM_PRIORITY[claim.kind]);
        const rangeStart = claim.rangeStart ?? 0;
        if (claim.rangeEnd === null) entry.whole = true;
        else entry.ranges.push([rangeStart, claim.rangeEnd]);
        if (claim.kind === 'warmup' && rangeStart > 0) entry.ranges.push([0, RESUME_HEADER_BYTES]);
        if (claim.kind === 'warmup' && TAIL_INDEXED_FILE.test(claim.path)) entry.tail = true;
        wanted.set(claim.path, entry);
      }
      const pieceCount = getTorrentPieceCount(torrent);
      for (const [path, want] of wanted) {
        const file = torrent.files.find(candidate => candidate.path === path);
        if (!file) continue;
        if (want.whole) {
          file.select(want.priority);
          continue;
        }
        for (const [rangeStart, rangeEnd] of want.ranges) {
          const start = Math.min(rangeStart, file.length - 1);
          const { firstPiece, lastPiece } = prefixPieces(
            Number(file.offset ?? 0) + start,
            Math.min(rangeEnd, file.length) - start,
            torrent.pieceLength,
            pieceCount
          );
          torrent.select(firstPiece, lastPiece, want.priority);
        }
        if (want.tail) {
          const tailBytes = Math.min(file.length, MATROSKA_TAIL_BYTES);
          const tail = prefixPieces(
            Number(file.offset ?? 0) + file.length - tailBytes,
            tailBytes,
            torrent.pieceLength,
            pieceCount
          );
          torrent.select(tail.firstPiece, tail.lastPiece, want.priority);
        }
      }
    }).finally(() => this.onSelectionChanged());
  }

  /**
   * Pause download for a movie source: clear every selection; claims stay and are reapplied on
   * resume.
   */
  async pauseDownload(sourceId: number): Promise<boolean> {
    try {
      const storage = await this.storageService.getStorageBySource(sourceId);
      if (!storage) {
        logger.warn('DownloadService', `No storage found for movie source ${sourceId}`);
        return false;
      }

      const torrent = this.torrents.torrentAt(storage.location);
      if (!torrent) {
        logger.warn('DownloadService', `No active torrent found for movie source ${sourceId}`);
        return false;
      }

      // Pause by clearing every selection; claims stay and are reapplied on resume.
      if (torrent.files && torrent.files.length > 0) {
        this.pausedSources.add(sourceId);
        clearSelection(torrent);
        logger.info('DownloadService', `Paused download for movie source ${sourceId}`);
        return true;
      }

      return false;
    } catch (error) {
      logger.error('DownloadService', `Failed to pause download for source ${sourceId}:`, error);
      return false;
    }
  }

  /**
   * Resume download for a movie source by reapplying its live claims.
   */
  async resumeDownload(sourceId: number): Promise<boolean> {
    try {
      const storage = await this.storageService.getStorageBySource(sourceId);
      if (!storage) {
        logger.warn('DownloadService', `No storage found for movie source ${sourceId}`);
        return false;
      }

      const torrent = this.torrents.torrentAt(storage.location);
      if (!torrent) {
        logger.warn('DownloadService', `No active torrent found for movie source ${sourceId}`);
        return false;
      }

      // Resume by reapplying the source's live claims.
      if (torrent.files && torrent.files.length > 0) {
        this.pausedSources.delete(sourceId);
        await this.reconcileSelection(sourceId);
        logger.info('DownloadService', `Resumed download for movie source ${sourceId}`);
        return true;
      }

      return false;
    } catch (error) {
      logger.error('DownloadService', `Failed to resume download for source ${sourceId}:`, error);
      return false;
    }
  }
}
