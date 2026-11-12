import type {
  PlaybackHealth,
  StorageActivity,
  WarmupRangeProgress,
} from '@miauflix/service-contracts';

import { logger } from '../../lib/logger';
import type { StorageService } from '../../storage/storage.service';
import type { Storage } from '../../storage/types';
import {
  createEncryptedLayout,
  getFileRangeByteLength,
  getPieceByteLength,
  getRangeByteLength,
  getSelectedBytes,
  isFileStored,
} from './layout';
import type { PlaybackState } from './playback-state';
import type { SeedScheduler } from './seed-scheduler';
import type { TorrentAttacher } from './torrent-attacher';
import type { DownloadProgress, StorageActivitySnapshot } from './types';

const NO_RANGE_PROGRESS: WarmupRangeProgress = {
  verifiedBytes: 0,
  targetBytes: 0,
  progress: 0,
  isComplete: false,
};

/** Read-only views of a source's download: activity, progress, warmup ranges and health. */
export class DownloadStatus {
  constructor(
    private readonly storageService: StorageService,
    private readonly torrents: TorrentAttacher,
    private readonly playback: PlaybackState,
    private readonly seeding: SeedScheduler
  ) {}

  /**
   * What a viewer of this source experiences right now, for judging the swarm: whether a stream
   * is open, metadata has arrived, peers and speed, since when a playback read has been blocked,
   * and when bytes last reached a viewer. Null when the source has neither storage nor torrent.
   */
  async getPlaybackHealth(sourceId: number, filePath?: string): Promise<PlaybackHealth | null> {
    const storage = await this.storageService.getStorageBySource(sourceId);
    const torrent = storage ? this.torrents.torrentAt(storage.location) : undefined;
    if (!storage && !torrent) return null;
    const layout = storage?.encryptedLayout;
    return {
      streaming: this.playback.isPlaybackActive(sourceId),
      local: Boolean(storage?.localOnly),
      hasMetadata: Boolean(layout || torrent?.ready),
      peers: torrent?.numPeers ?? 0,
      downloadSpeed: torrent?.downloadSpeed ?? 0,
      blockedSince: this.playback.blockedSince(sourceId),
      lastDeliveryAt: this.playback.lastDelivery(sourceId),
      fileLength: (filePath && layout?.files.find(file => file.path === filePath)?.length) || null,
      readFraction:
        (filePath ? this.playback.readFractionOf(sourceId, filePath) : undefined) ?? null,
    };
  }

  getStorageActivity(
    storage: Pick<Storage, 'localOnly' | 'location' | 'videoCompletedAt'> & {
      contentSource?: { hash: string } | null;
    }
  ): StorageActivitySnapshot {
    const sourceHash = storage.contentSource?.hash;
    const torrent = this.torrents.client.torrents.find(item =>
      sourceHash
        ? item.infoHash?.toLowerCase() === sourceHash.toLowerCase()
        : item.path === storage.location
    );
    // videoCompletedAt is set as soon as every claimed file verifies (see recordCompletion).
    const videoComplete =
      Boolean(storage.videoCompletedAt) || storage.localOnly || Boolean(torrent?.done);
    const activity: StorageActivity = videoComplete
      ? storage.localOnly
        ? 'local_only'
        : 'available_offline'
      : torrent
        ? 'active'
        : 'inactive';
    const seedEndsAt =
      videoComplete && !storage.localOnly && storage.videoCompletedAt
        ? new Date(this.seeding.seedDeadline(storage.videoCompletedAt))
        : null;
    return {
      activity,
      seedEndsAt,
      videoComplete,
      torrentLoaded: Boolean(torrent),
    };
  }

  async isFileComplete(sourceId: number, filePath: string): Promise<boolean> {
    const storage = await this.storageService.getStorageBySource(sourceId);
    if (!storage?.encryptedLayout) return false;
    return isFileStored(
      storage,
      storage.encryptedLayout,
      filePath,
      await this.storageService.getFiles(sourceId)
    );
  }

  /**
   * Get download progress for a movie source
   */
  async getDownloadProgress(sourceId: number): Promise<DownloadProgress | null> {
    try {
      const storage = await this.storageService.getStorageBySource(sourceId);
      if (!storage) {
        return null;
      }

      const requestedBytes = storage.encryptedLayout
        ? getSelectedBytes(
            storage.encryptedLayout,
            await this.storageService.getClaimedPaths(sourceId)
          )
        : 0;
      const fileBytes = requestedBytes || storage.size;
      if (storage.videoCompletedAt || storage.localOnly) {
        const bytes = fileBytes;
        return {
          sourceId,
          progress: 100,
          downloadedBytes: bytes,
          totalBytes: bytes,
          downloadSpeed: 0,
          isComplete: true,
        };
      }

      // Find the associated torrent
      const torrent = this.torrents.torrentAt(storage.location);
      if (!torrent) {
        return {
          sourceId,
          progress: storage.videoCompletedAt ? 100 : storage.downloaded / 100, // Convert from basis points
          downloadedBytes: storage.videoCompletedAt ? fileBytes : 0,
          totalBytes: fileBytes,
          downloadSpeed: 0,
          isComplete: Boolean(storage.videoCompletedAt) || storage.downloaded >= 10000,
        };
      }

      return {
        sourceId,
        progress: torrent.progress * 100, // Convert to percentage
        downloadedBytes: torrent.downloaded,
        totalBytes: torrent.length,
        downloadSpeed: torrent.downloadSpeed,
        isComplete: this.getStorageActivity(storage).videoComplete,
      };
    } catch (error) {
      logger.warn(
        'DownloadService',
        `Failed to get download progress for source ${sourceId}:`,
        error
      );
      return null;
    }
  }

  /**
   * Return whether every byte in an inclusive, zero-based piece range is verified.
   * Invalid or unavailable ranges return false; storage lookup failures propagate.
   */
  async isRangeVerified(
    sourceId: number,
    filePath: string,
    firstPiece: number,
    lastPiece: number
  ): Promise<boolean> {
    const progress = await this.getRangeProgress(sourceId, filePath, firstPiece, lastPiece);
    return progress.isComplete;
  }

  /**
   * Measure verified bytes of one file and completion percentage (0–100) for an inclusive,
   * zero-based piece range. Invalid ranges or unavailable torrent data return zero counts and an
   * incomplete result. Storage lookup failures propagate.
   */
  async getRangeProgress(
    sourceId: number,
    filePath: string,
    firstPiece: number,
    lastPiece: number
  ): Promise<WarmupRangeProgress> {
    if (
      !Number.isInteger(firstPiece) ||
      !Number.isInteger(lastPiece) ||
      firstPiece < 0 ||
      lastPiece < firstPiece
    ) {
      return { ...NO_RANGE_PROGRESS };
    }
    const storage = await this.storageService.getStorageBySource(sourceId);
    if (!storage) return { ...NO_RANGE_PROGRESS };
    const torrent = this.torrents.torrentAt(storage.location);
    let layout = storage.encryptedLayout;
    if (!layout && torrent?.ready) {
      try {
        layout = createEncryptedLayout(torrent);
      } catch {
        // A ready torrent can still have incomplete or invalid file metadata.
      }
    }
    if (!torrent?.bitfield) {
      if ((storage.videoCompletedAt || storage.localOnly) && layout) {
        const targetBytes = getFileRangeByteLength(layout, filePath, firstPiece, lastPiece);
        if (targetBytes > 0) {
          return { verifiedBytes: targetBytes, targetBytes, progress: 100, isComplete: true };
        }
      }
      return { ...NO_RANGE_PROGRESS };
    }
    const totalPieces = torrent.pieces?.length;
    if (
      !Number.isInteger(totalPieces) ||
      totalPieces <= 0 ||
      firstPiece >= totalPieces ||
      lastPiece >= totalPieces
    ) {
      return { ...NO_RANGE_PROGRESS };
    }
    const targetBytes = layout
      ? getFileRangeByteLength(layout, filePath, firstPiece, lastPiece)
      : getRangeByteLength(torrent, firstPiece, lastPiece);
    if (targetBytes <= 0) {
      return { ...NO_RANGE_PROGRESS };
    }
    let verifiedBytes = 0;
    for (let piece = firstPiece; piece <= lastPiece; piece += 1) {
      if (torrent.bitfield.get(piece)) {
        verifiedBytes += layout
          ? getFileRangeByteLength(layout, filePath, piece, piece)
          : getPieceByteLength(torrent, piece);
      }
    }
    const progress = Math.min(100, Math.max(0, (verifiedBytes / targetBytes) * 100));
    return {
      verifiedBytes,
      targetBytes,
      progress,
      isComplete: verifiedBytes === targetBytes,
    };
  }
}
