import { rm } from 'fs/promises';
import type { Torrent } from 'webtorrent';

import EncryptedChunkStore from '../../chunk-stores/encrypted-chunk-store/encrypted-chunk-store';
import { logger } from '../../lib/logger';
import type { PieceRange, StorageService } from '../../storage/storage.service';
import type { Storage } from '../../storage/types';
import type { EngineConfig } from '../engine-config';
import type { ClaimSelection } from './claim-selection';
import type { CompletionTracker } from './completion-tracker';
import { createEncryptedLayout, findEncryptedStore, isFileStored } from './layout';
import type { PlaybackBandwidth } from './playback-bandwidth';
import type { SeedScheduler } from './seed-scheduler';
import type { TorrentAttacher } from './torrent-attacher';

/** Make WebTorrent treat a verified piece as missing again. */
const unverifyPiece = (torrent: Torrent, index: number): void => {
  const internals = torrent as unknown as {
    _markUnverified?: (piece: number) => void;
    _reservations?: unknown[];
  };
  if (internals._markUnverified) internals._markUnverified(index);
  else torrent.bitfield.set(index, false);
  // A verified piece has no reservation list; request bookkeeping needs one to fetch it again.
  if (internals._reservations) internals._reservations[index] = [];
};

/**
 * What StorageService calls back into when it deletes a storage or reclaims some of its files:
 * the torrent and the encrypted data on disk go with the record.
 */
export class StorageHooks {
  constructor(
    private readonly storageService: StorageService,
    private readonly config: EngineConfig,
    private readonly torrents: TorrentAttacher,
    private readonly selection: ClaimSelection,
    private readonly bandwidth: PlaybackBandwidth,
    private readonly seeding: SeedScheduler,
    private readonly tracker: CompletionTracker
  ) {}

  /** Register the delete and reclaim handlers with StorageService. */
  register(): void {
    // StorageService invokes the strict handler before deleting its database
    // row. Keep the event hook for existing observers and unit-level callers.
    this.storageService.registerDeleteHandler(storage => this.cleanupStorage(storage, true));
    this.storageService.on('delete', storage => this.cleanupStorage(storage, false));
    this.storageService.registerReclaimHandler({
      reclaim: (storage, paths, pieces) => this.reclaimStoredFiles(storage, paths, pieces),
      reselect: storage => this.reselectAfterReclaim(storage),
    });
  }

  /**
   * Remove a deleted storage's torrent (and its store) and directory, once per storage object.
   * Strict: a storage without a source hash is an error rather than a warning.
   */
  private async cleanupStorage(storage: Storage, strict: boolean): Promise<void> {
    this.seeding.cancel(storage.sourceId);
    const marker = storage as Storage & { physicalCleanupDone?: boolean };
    if (marker.physicalCleanupDone) return;
    // Get the hash from the associated ContentSource
    const hash = storage.contentSource?.hash;
    if (!hash) {
      logger.warn(
        'DownloadService',
        `No hash found for storage ${storage.id}, cannot remove torrent`
      );
      if (strict) throw new Error(`No hash found for storage ${storage.id}`);
      return;
    }

    const torrent = await this.torrents.client.get(hash);
    if (torrent) {
      await Promise.resolve(this.torrents.client.remove(torrent, { destroyStore: true }));
      logger.info('DownloadService', `Removed torrent for deleted storage: ${storage.location}`);
    }
    await rm(storage.location, { recursive: true, force: true });
    marker.physicalCleanupDone = true;
    this.selection.unpause(storage.sourceId);
    this.bandwidth.forget(storage.sourceId);
  }

  /**
   * Delete the encrypted files of `paths` and clear every piece overlapping them, boundary pieces
   * shared with a neighbor included, from the attached torrent (WebTorrent forgets the piece and
   * fetches it again if a claimed file still selects it). Runs under the source lock, inside
   * StorageService.reclaimFiles, so it cannot interleave with torrent startup, detach or removal.
   *
   * @returns The attached torrent's bitfield after clearing, or nothing when none is attached.
   */
  async reclaimStoredFiles(
    storage: Storage,
    paths: string[],
    pieces: PieceRange[]
  ): Promise<Uint8Array | void> {
    const layout = storage.encryptedLayout;
    if (!layout) throw new Error(`Storage ${storage.id} has no file layout to reclaim from`);
    // The claims on these files are already gone; this drops their selections before the data.
    await this.selection.reconcileSelection(storage.sourceId);

    const torrent = this.torrents.torrentAt(storage.location);
    const live = torrent && !torrent.destroyed && torrent.bitfield ? torrent : null;
    if (live) {
      for (const { first, last } of pieces) {
        for (let piece = first; piece <= last; piece++) {
          if (live.bitfield.get(piece)) unverifyPiece(live, piece);
        }
      }
      (live as unknown as { done: boolean }).done = false;
    }

    const store =
      (live && findEncryptedStore((live as unknown as { store?: unknown }).store)) ??
      new EncryptedChunkStore(layout.pieceLength, {
        path: storage.location,
        name: layout.storeName,
        files: layout.files.map(file => ({ ...file })),
        encryptionKey: this.config.getOrThrow('SOURCE_SECURITY_KEY'),
        encryptionVersion: layout.encryptionVersion ?? 1,
        filenameSalt: layout.filenameSalt,
        contentSalt: layout.contentSalt,
      });
    await store.removeFiles(paths);
    logger.info(
      'DownloadService',
      `Reclaimed ${paths.length} file(s) of source ${storage.sourceId}`
    );
    return live ? new Uint8Array(live.bitfield.buffer) : undefined;
  }

  /**
   * After a reclaim: bring the torrent back if a claimed file lost pieces (a boundary piece
   * shared with a reclaimed neighbor), then reapply selection so those pieces are fetched.
   */
  async reselectAfterReclaim(storage: Storage): Promise<void> {
    const { sourceId, contentSource: source, encryptedLayout: layout } = storage;
    if (source && layout) {
      const files = await this.storageService.getFiles(sourceId);
      const claimed = (await this.storageService.getClaimedPaths(sourceId)).filter(path =>
        layout.files.some(file => file.path === path)
      );
      const missing = claimed.some(path => !isFileStored(storage, layout, path, files));
      const attached = Boolean(this.torrents.torrentAt(storage.location));
      if (missing && !attached) {
        await this.storageService.withSourceLock(sourceId, async () => {
          const current = await this.storageService.getStorageBySource(sourceId);
          if (!current) return;
          this.seeding.cancel(sourceId);
          const torrent = await this.torrents.addTorrentWithLock(source, current);
          this.tracker.trackTorrent(torrent, sourceId, createEncryptedLayout(torrent, source.hash));
        });
      }
    }
    await this.selection.reconcileSelection(sourceId);
    const current = await this.storageService.getStorageBySource(sourceId);
    const torrent = current && this.torrents.torrentAt(current.location);
    if (torrent?.ready && current?.encryptedLayout)
      await this.tracker.recordCompletion(torrent, sourceId, current.encryptedLayout);
  }
}
