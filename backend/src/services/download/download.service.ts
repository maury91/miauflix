import { createHash } from 'node:crypto';

import { logger } from '@logger';
import type { ScrapeData } from 'bittorrent-tracker';
import { Client as BTClient } from 'bittorrent-tracker';
import { access, constants, mkdir, rm } from 'fs/promises';
import MemoryChunkStore from 'memory-chunk-store';
import parseTorrent from 'parse-torrent';
import type { Torrent, TorrentOptions, WebTorrentOptions } from 'webtorrent';
import WebTorrent from 'webtorrent';

import type { ContentSource } from '@entities/content-source.entity';
import type { EncryptedStorageLayout, Storage } from '@entities/storage.entity';
import type { ConfigService, ServiceInstanceStatus } from '@mytypes/configuration';
import type { PlaybackTarget } from '@services/playback/playback-target';
import { withFile } from '@services/playback/playback-target';
import type { RequestService } from '@services/request/request.service';
import { ErrorWithStatus } from '@services/source/services/error-with-status.util';
import type { StorageService } from '@services/storage/storage.service';
import { traced } from '@utils/tracing.util';

import type { EncryptedStorageOptions } from '../../chunk-stores/encrypted-chunk-store/encrypted-chunk-store';
import EncryptedChunkStore from '../../chunk-stores/encrypted-chunk-store/encrypted-chunk-store';
import {
  encodeRFC5987,
  getContentType,
  getIpSet,
  getTrackers,
  isFileCompleteInBitfield,
  isPieceInBitfield,
  parseRangeHeader,
} from './download.utils';
import { EncryptedFileReader } from './encrypted-file-reader';
import { TorrentDiagnostics } from './torrent-diagnostics';

// Types for greedy streaming
// export type DownloadPriority = 'full' | 'partial';

export interface GreedyDownload {
  sourceId: number;
  torrent: Torrent | null;
  storage: Storage;
  layout: EncryptedStorageLayout;
  // priority: DownloadPriority;
  startTime: Date;
}

export interface DownloadProgress {
  sourceId: number;
  progress: number; // Percentage (0-100)
  downloadedBytes: number;
  totalBytes: number;
  downloadSpeed: number; // bytes/second
  isComplete: boolean;
}

export interface WarmupResult {
  sourceId: number;
  filePath: string;
  targetBytes: number;
  firstPiece: number;
  lastPiece: number;
}

const MAX_SIDECAR_BYTES = 2 * 1024 * 1024;
const SIDECAR_SUBTITLE = /\.(srt|vtt|ass|ssa)$/i;

export type StorageActivity = 'active' | 'available_offline' | 'inactive' | 'local_only';

export interface StorageActivitySnapshot {
  activity: StorageActivity;
  seedEndsAt: Date | null;
  videoComplete: boolean;
  torrentLoaded: boolean;
}

export interface WarmupRangeProgress {
  verifiedBytes: number;
  targetBytes: number;
  progress: number;
  isComplete: boolean;
}

export class DownloadService {
  public readonly client: WebTorrent;
  private activeStreams = 0;
  private activeScrapes = 0;
  private completedScrapes = 0;
  private failedScrapes = 0;
  private readonly activeSourceCounts = new Map<number, number>();
  private readonly activeSourceFiles = new Map<number, Map<string, number>>();
  private readonly allocationReconcileAt = new Map<number, number>();
  private readonly allocationReconcileInFlight = new Map<number, Promise<void>>();
  private readonly bitfieldTrackedTorrents = new WeakMap<Torrent, Set<number>>();
  private readonly torrentStartPromises = new Map<string, Promise<Torrent>>();
  private readonly pausedForPlayback = new Set<number>();
  private readonly seedTimers = new Map<number, NodeJS.Timeout>();
  private readonly warmupSelections = new Map<number, { firstPiece: number; lastPiece: number }>();
  private _initStatus: ServiceInstanceStatus = {
    status: 'initializing',
    details: 'Starting up',
    startedAt: Date.now(),
  };
  private bestTrackers: string[] = [];
  private readonly staticTrackers: string[];
  private readonly bestTrackersDownloadUrl: string;
  private readonly blacklistedTrackersDownloadUrl: string;
  private readonly scrapeTrackers: string[];

  constructor(
    private readonly storageService: StorageService,
    private readonly requestService: RequestService,
    private readonly config: ConfigService
  ) {
    this.staticTrackers = config.getOrThrow('STATIC_TRACKERS');
    this.scrapeTrackers = config.getOrThrow('SCRAPE_TRACKERS');
    this.bestTrackers = [...new Set([...this.staticTrackers])];
    this.bestTrackersDownloadUrl = config.getOrThrow('BEST_TRACKERS_DOWNLOAD_URL');
    this.blacklistedTrackersDownloadUrl = config.getOrThrow('BLACKLISTED_TRACKERS_DOWNLOAD_URL');
    const options: WebTorrentOptions = {
      maxConns: config.getOrThrow('CONTENT_CONNECTION_LIMIT'),
      downloadLimit: Number(config.getOrThrow('CONTENT_DOWNLOAD_LIMIT')),
      uploadLimit: Number(config.getOrThrow('CONTENT_UPLOAD_LIMIT')),
      // blocklist: [this.blacklistedTrackersDownloadUrl],
    };
    if (config.getOrThrow('DISABLE_DISCOVERY')) {
      options.dht = false;
    }
    this.client = new WebTorrent(options);
    new TorrentDiagnostics(this.client, () => ({
      activeStreams: this.activeStreams,
      activeSources: this.activeSourceCounts.size,
      pendingTorrentStarts: this.torrentStartPromises.size,
      activeScrapes: this.activeScrapes,
      completedScrapes: this.completedScrapes,
      failedScrapes: this.failedScrapes,
    }));
    this.client.on('error', (error: Error) => {
      logger.error('DownloadService', 'Error:', error.message, error);
    });
    config.registerService('DOWNLOAD', this);
    void this.init();

    const cleanupStorage = async (storage: Storage, strict: boolean): Promise<void> => {
      const seedTimer = this.seedTimers.get(storage.sourceId);
      if (seedTimer) clearTimeout(seedTimer);
      this.seedTimers.delete(storage.sourceId);
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

      const torrent = await this.client.get(hash);
      if (torrent) {
        await Promise.resolve(this.client.remove(torrent, { destroyStore: true }));
        logger.info('DownloadService', `Removed torrent for deleted storage: ${storage.location}`);
      }
      await rm(storage.location, { recursive: true, force: true });
      marker.physicalCleanupDone = true;
      this.warmupSelections.delete(storage.sourceId);
      this.pausedForPlayback.delete(storage.sourceId);
    };

    // StorageService invokes the strict handler before deleting its database
    // row. Keep the event hook for existing observers and unit-level callers.
    this.storageService.registerDeleteHandler(storage => cleanupStorage(storage, true));
    this.storageService.on('delete', storage => cleanupStorage(storage, false));
  }

  testable = true;
  hasActivePlayback(): boolean {
    return this.activeStreams > 0;
  }

  isPlaybackActive(sourceId: number): boolean {
    return (this.activeSourceCounts.get(sourceId) ?? 0) > 0;
  }

  getStorageActivity(
    storage: Pick<Storage, 'encryptedLayout' | 'localOnly' | 'location' | 'videoCompletedAt'> & {
      selectedFiles?: string[];
      contentSource?: { hash: string } | null;
    }
  ): StorageActivitySnapshot {
    const sourceHash = storage.contentSource?.hash;
    const torrent = this.client.torrents.find(item =>
      sourceHash
        ? item.infoHash?.toLowerCase() === sourceHash.toLowerCase()
        : item.path === storage.location
    );
    let videoComplete =
      Boolean(storage.videoCompletedAt) || storage.localOnly || Boolean(torrent?.done);
    if (!videoComplete && torrent?.ready) {
      try {
        const layout = storage.encryptedLayout ?? this.createEncryptedLayout(torrent);
        const selected = storage.selectedFiles ?? [];
        videoComplete =
          selected.length > 0 &&
          selected.every(path => isFileCompleteInBitfield(layout, path, torrent.bitfield?.buffer));
      } catch {
        // Metadata can be incomplete while a torrent is being admitted.
        videoComplete = false;
      }
    }
    const activity: StorageActivity = videoComplete
      ? storage.localOnly
        ? 'local_only'
        : 'available_offline'
      : torrent
        ? 'active'
        : 'inactive';
    const seedEndsAt =
      videoComplete && !storage.localOnly && storage.videoCompletedAt
        ? new Date(storage.videoCompletedAt.getTime() + this.getSeedDurationMs())
        : null;
    return {
      activity,
      seedEndsAt,
      videoComplete,
      torrentLoaded: Boolean(torrent),
    };
  }
  getStatus(): ServiceInstanceStatus {
    return this._initStatus;
  }

  private async init(): Promise<void> {
    const startedAt = Date.now();
    this._initStatus = { status: 'initializing', details: 'Loading trackers', startedAt };
    try {
      await this.loadTrackers();
      this._initStatus = {
        status: 'initializing',
        details: 'Checking download directory',
        startedAt,
      };
    } catch (err) {
      this._initStatus = {
        status: 'error',
        errorMessage: err instanceof Error ? err.message : 'Failed to load trackers',
        error: err,
      };
    }
    if (this._initStatus.status !== 'error') {
      try {
        const downloadPath = this.config.getOrThrow('DOWNLOAD_PATH');
        await mkdir(downloadPath, { recursive: true });
        await access(downloadPath, constants.W_OK);
        this._initStatus = { status: 'ready' };
        await this.restoreCompletedDownloads();
      } catch (err) {
        this._initStatus = {
          status: 'error',
          errorMessage: err instanceof Error ? err.message : 'Failed to access download directory',
          error: err,
        };
      }
    }
  }

  public async reload(): Promise<void> {
    await this.init();
    const completed = (await this.storageService.getStoragesWithCompletion()) ?? [];
    for (const storage of completed) this.scheduleSeedExpiry(storage);
  }

  async close(): Promise<void> {
    for (const timer of this.seedTimers.values()) clearTimeout(timer);
    this.seedTimers.clear();
    await new Promise<void>((resolve, reject) => {
      this.client.destroy(error => (error ? reject(error) : resolve()));
    });
  }

  private async loadTrackers() {
    const [bestTrackers, blacklistedTrackers] = await Promise.all([
      getTrackers(this.bestTrackersDownloadUrl, this.requestService),
      getIpSet(this.blacklistedTrackersDownloadUrl),
    ]);

    if (bestTrackers.length) {
      this.bestTrackers = bestTrackers;
    }
    this.bestTrackers = [...new Set([...this.bestTrackers, ...this.staticTrackers])];

    if (blacklistedTrackers) {
      this.client.blocked = blacklistedTrackers;
    }
  }

  private createEncryptedLayout(
    torrent: Torrent,
    sourceHash = torrent.infoHash
  ): EncryptedStorageLayout {
    return {
      storeName: `${torrent.name} - ${torrent.infoHash.slice(0, 8)}`,
      // EncryptedChunkStore was opened with the provider's source hash. Keep
      // that exact value because filename derivation is case-sensitive.
      filenameSalt: `download-${sourceHash}`,
      pieceLength: torrent.pieceLength,
      files: torrent.files.map(file => ({
        path: file.path,
        length: file.length,
        offset: Number(file.offset ?? 0),
      })),
    };
  }

  /** Record completion once every file requested from the source is verified. */
  private async maybeMarkVideoComplete(
    torrent: Torrent,
    sourceId: number,
    layout: EncryptedStorageLayout
  ): Promise<void> {
    const current = await this.storageService.getStorageBySource(sourceId);
    const selected = current?.selectedFiles ?? [];
    if (
      !selected.length ||
      !selected.every(path => isFileCompleteInBitfield(layout, path, torrent.bitfield?.buffer))
    )
      return;
    const storage = await this.storageService.markVideoComplete(sourceId, layout);
    if (storage) this.scheduleSeedExpiry(storage);
  }

  private withSourceFilenameSalt(
    layout: EncryptedStorageLayout,
    sourceHash: string
  ): EncryptedStorageLayout {
    const filenameSalt = `download-${sourceHash}`;
    return layout.filenameSalt === filenameSalt ? layout : { ...layout, filenameSalt };
  }

  private async restoreCompletedDownloads(): Promise<void> {
    const completed = (await this.storageService.getStoragesWithCompletion()) ?? [];
    for (const storage of completed) {
      if (storage.localOnly) continue;
      if (!storage.contentSource) continue;
      const deadline = storage.videoCompletedAt!.getTime() + this.getSeedDurationMs();
      if (deadline <= Date.now()) {
        try {
          await this.detachCompletedTorrent(storage.sourceId);
        } catch (error) {
          logger.warn(
            'DownloadService',
            `Could not detach expired source ${storage.sourceId}`,
            error
          );
          this.scheduleDetachRetry(storage.sourceId);
        }
        continue;
      }
      try {
        await this.storageService.withSourceLock(storage.sourceId, async () => {
          const current = await this.storageService.getStorageBySource(storage.sourceId);
          if (
            !current ||
            current.localOnly ||
            !current.videoCompletedAt ||
            !current.contentSource ||
            current.videoCompletedAt.getTime() + this.getSeedDurationMs() <= Date.now()
          ) {
            return;
          }
          const torrent = await this.addTorrentWithLock(current.contentSource, current);
          const savedLayout =
            current.encryptedLayout ??
            this.createEncryptedLayout(torrent, current.contentSource.hash);
          const layout = this.withSourceFilenameSalt(savedLayout, current.contentSource.hash);
          await this.storageService.updateEncryptedLayout(current.sourceId, layout);
          for (const path of current.selectedFiles ?? [])
            torrent.files.find(file => file.path === path)?.select();
          this.trackTorrent(torrent, current.sourceId, layout);
          this.scheduleSeedExpiry(current);
        });
      } catch (error) {
        logger.warn(
          'DownloadService',
          `Could not restore seeding for completed source ${storage.sourceId}`,
          error
        );
      }
    }
  }

  private getSeedDurationMs(): number {
    return Number(this.config.getOrThrow('CONTENT_SEED_DURATION_SECONDS')) * 1_000;
  }

  private scheduleSeedExpiry(storage: Storage): void {
    const previous = this.seedTimers.get(storage.sourceId);
    if (previous) clearTimeout(previous);
    this.seedTimers.delete(storage.sourceId);
    if (!storage.videoCompletedAt || storage.localOnly) return;
    const deadline = storage.videoCompletedAt.getTime() + this.getSeedDurationMs();
    const timer = setTimeout(
      () => {
        this.seedTimers.delete(storage.sourceId);
        void this.expireCompletedTorrent(storage.sourceId);
      },
      Math.max(0, Math.min(deadline - Date.now(), 2_147_000_000))
    );
    timer.unref?.();
    this.seedTimers.set(storage.sourceId, timer);
  }

  private async expireCompletedTorrent(sourceId: number): Promise<void> {
    try {
      const storage = await this.storageService.getStorageBySource(sourceId);
      if (!storage?.videoCompletedAt || storage.localOnly) return;
      if (Date.now() < storage.videoCompletedAt.getTime() + this.getSeedDurationMs()) {
        this.scheduleSeedExpiry(storage);
        return;
      }
      await this.detachCompletedTorrent(sourceId);
    } catch (error) {
      logger.warn('DownloadService', `Failed to stop seeding source ${sourceId}; retrying`, error);
      this.scheduleDetachRetry(sourceId);
    }
  }

  private scheduleDetachRetry(sourceId: number): void {
    const timer = setTimeout(() => {
      this.seedTimers.delete(sourceId);
      void this.detachCompletedTorrent(sourceId).catch(error => {
        logger.warn('DownloadService', `Retry failed to stop seeding source ${sourceId}`, error);
        this.scheduleDetachRetry(sourceId);
      });
    }, 15_000);
    timer.unref?.();
    this.seedTimers.set(sourceId, timer);
  }

  private async detachCompletedTorrent(sourceId: number): Promise<void> {
    await this.storageService.detachCompletedStorage(sourceId, async () => {
      const storage = await this.storageService.getStorageBySource(sourceId);
      const torrent = this.client.torrents.find(item => item.path === storage?.location);
      if (torrent) await this.client.remove(torrent, { destroyStore: false });
    });
    const timer = this.seedTimers.get(sourceId);
    if (timer) clearTimeout(timer);
    this.seedTimers.delete(sourceId);
    logger.info('DownloadService', `Stopped seeding source ${sourceId}; encrypted files retained`);
  }

  private trackTorrent(torrent: Torrent, sourceId: number, layout: EncryptedStorageLayout): void {
    const trackedSourceIds = this.bitfieldTrackedTorrents.get(torrent) ?? new Set<number>();
    if (trackedSourceIds.has(sourceId)) return;
    trackedSourceIds.add(sourceId);
    this.bitfieldTrackedTorrents.set(torrent, trackedSourceIds);
    this.setupBitfieldTracking(torrent, sourceId, layout);
  }

  private async readVerifiedPiece(
    reader: EncryptedFileReader,
    torrent: Torrent | null,
    storage: Storage,
    pieceIndex: number,
    signal: AbortSignal
  ): Promise<Buffer> {
    while (!signal.aborted) {
      if (
        storage.localOnly ||
        torrent?.bitfield?.get(pieceIndex) ||
        isPieceInBitfield(storage.downloadedPieces, pieceIndex)
      ) {
        return reader.readPiece(pieceIndex);
      }
      if (!torrent || torrent.destroyed) {
        throw new ErrorWithStatus(
          'Media piece is unavailable after torrent removal',
          'local_media_incomplete'
        );
      }
      await new Promise<void>((resolve, reject) => {
        const cleanup = () => {
          torrent.removeListener('verified', onVerified);
          torrent.removeListener('close', onClose);
          signal.removeEventListener('abort', onAbort);
        };
        const onVerified = () => {
          if (torrent.bitfield?.get(pieceIndex)) {
            cleanup();
            resolve();
          }
        };
        const onClose = () => {
          cleanup();
          reject(
            new ErrorWithStatus('Torrent closed before media was downloaded', 'torrent_closed')
          );
        };
        const onAbort = () => {
          cleanup();
          resolve();
        };
        torrent.on('verified', onVerified);
        torrent.once('close', onClose);
        signal.addEventListener('abort', onAbort, { once: true });
      });
    }
    throw new Error('Playback cancelled');
  }

  generateLink(hash: string, trackers: string[], name = ''): string {
    const allTrackers = [...new Set([...trackers, ...this.bestTrackers])].filter(Boolean);

    const params = new URLSearchParams();

    // Add each tracker as a separate 'tr' parameter for magnet URI compliance
    allTrackers.forEach(tracker => {
      params.append('tr', tracker);
    });

    if (name) {
      params.set('dn', name);
    }

    return `magnet:?xt=urn:btih:${hash}&${params.toString()}`;
  }

  @traced('DownloadService')
  async getSourceMetadataFile(sourceLink: string, hash: string, timeout: number): Promise<Buffer> {
    return new Promise((resolve, rejectRaw) => {
      let settled = false;
      let temporaryTorrent: Torrent | null = null;
      const remove = async () => {
        if (!temporaryTorrent) return;
        try {
          await this.client.remove(temporaryTorrent.infoHash, { destroyStore: true });
        } catch (error) {
          logger.debug('DownloadService', `Failed to remove metadata torrent ${hash}`, error);
        }
      };
      const reject = (error: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        void remove().finally(() => rejectRaw(error));
      };
      const timeoutId = setTimeout(() => {
        reject(new ErrorWithStatus(`Timeout after ${timeout} ms while adding file`, 'timeout'));
      }, timeout);

      try {
        const onSourceMetadata = (sourceMetadata: Torrent) => {
          if (settled) return;
          if (!sourceMetadata.torrentFile) {
            return reject(new ErrorWithStatus(`File not found`, 'added_but_no_file'));
          }
          settled = true;
          clearTimeout(timeoutId);
          void remove().finally(() => resolve(sourceMetadata.torrentFile!));
        };
        const existingSourceFile = this.client.torrents.find(t => t.infoHash === hash);
        if (existingSourceFile) {
          onSourceMetadata(existingSourceFile);
          return;
        }
        temporaryTorrent = this.client.add(
          sourceLink,
          {
            deselect: true,
            destroyStoreOnDestroy: true,
            skipVerify: true,
            store: MemoryChunkStore,
          },
          torrent => {
            temporaryTorrent ??= torrent;
            onSourceMetadata(torrent);
          }
        );
      } catch (error: unknown) {
        console.error(`Error adding data source`, error);
        reject(new ErrorWithStatus(`Error adding file to client`, 'add_error'));
      }
    });
  }

  private async scrape(infoHash: string): Promise<ScrapeData> {
    this.activeScrapes += 1;
    return new Promise<ScrapeData>((resolve, reject) => {
      const client = new BTClient({
        infoHash: infoHash.toLowerCase(),
        announce: this.scrapeTrackers,
        peerId: Buffer.from('01234567890123456789'), // 20-byte dummy peer ID
        port: 6881, // arbitrary port for scrape
      });

      client.once('scrape', data => {
        resolve(data);
        client.destroy();
      });

      client.once('error', err => {
        reject(err);
        client.destroy();
      });

      client.scrape();

      setTimeout(() => {
        reject(new ErrorWithStatus(`Scrape request timed out for ${infoHash}`, 'scrape_timeout'));
        client.destroy();
      }, 5000); // 5 seconds timeout
    }).then(
      result => {
        this.activeScrapes -= 1;
        this.completedScrapes += 1;
        return result;
      },
      error => {
        this.activeScrapes -= 1;
        this.failedScrapes += 1;
        throw error;
      }
    );
  }

  @traced('DownloadService')
  async getStats(infoHash: string): Promise<{ broadcasters: number; watchers: number }> {
    const result = await this.scrape(infoHash);
    return {
      broadcasters: result.complete || 0,
      watchers: result.incomplete || 0,
    };
  }

  /**
   * Start greedy download with storage tracking and priority management
   * Implements storage-conscious downloading for hobbyist constraints (150GB total storage)
   */
  @traced('DownloadService')
  async startDownload(
    target: PlaybackTarget,
    options: {
      retentionClass?: 'speculative' | 'watched';
      /** Admission charge used only while the source's file list is still unknown. */
      reservedBytes?: number;
      speculativeExpiresAt?: Date | null;
    } = {}
  ): Promise<GreedyDownload> {
    const { source, filePath } = target;
    try {
      logger.info('DownloadService', `Starting download for source ${source.id}`);

      const existingStorage = await this.storageService.getStorageBySource(source.id);
      const reservation = await this.getSelectedFilesReservation(
        source,
        [...new Set([...(existingStorage?.selectedFiles ?? []), filePath])],
        existingStorage?.encryptedLayout ?? undefined
      );

      await this.storageService.createStorage({
        sourceId: source.id,
        location: this.generateStoragePath(source.hash),
        size: source.size || 0,
        downloadedPieces: new Uint8Array(0),
        totalPieces: 0,
        retentionClass: options.retentionClass,
        reservedBytes: reservation.known
          ? reservation.bytes
          : (options.reservedBytes ?? (options.retentionClass === 'speculative' ? 0 : source.size)),
        partialReservation: reservation.known,
        speculativeExpiresAt: options.speculativeExpiresAt,
      });

      const start = await this.storageService.withSourceLock(source.id, async () => {
        let current = await this.storageService.getStorageBySource(source.id);
        if (!current) {
          throw new ErrorWithStatus('Storage record is unavailable', 'local_media_unavailable');
        }
        const savedLayout = current.encryptedLayout ?? (await this.recoverEncryptedLayout(source));
        if (savedLayout) this.assertFileInLayout(savedLayout, filePath);

        // A fully stored file is read from disk; the torrent stays as it is.
        if (savedLayout && this.isFileStored(current, savedLayout, filePath)) {
          const layout = this.withSourceFilenameSalt(savedLayout, source.hash);
          if (layout.filenameSalt !== current.encryptedLayout?.filenameSalt) {
            await this.storageService.updateEncryptedLayout(source.id, layout);
          }
          await this.storageService.selectTorrentFile(source.id, filePath, true);
          const expired = Boolean(
            current.videoCompletedAt &&
              Date.now() >= current.videoCompletedAt.getTime() + this.getSeedDurationMs()
          );
          return {
            sourceId: source.id,
            torrent: null,
            storage: current,
            layout,
            shouldDetach: expired && !current.localOnly,
            startTime: new Date(),
          };
        }

        // Requesting an incomplete file reopens a completed source and cancels its seed window.
        await this.storageService.selectTorrentFile(source.id, filePath, false);
        const timer = this.seedTimers.get(source.id);
        if (timer) clearTimeout(timer);
        this.seedTimers.delete(source.id);
        current = (await this.storageService.reactivateTorrent(source.id)) ?? current;

        // Serialize torrent startup against expiry detachment and storage deletion.
        const torrent = await this.addTorrentWithLock(source, current);
        const layout = this.createEncryptedLayout(torrent, source.hash);
        this.assertFileInLayout(layout, filePath);
        await this.storageService.updateEncryptedLayout(source.id, layout);
        const selectedStorage = await this.storageService.getStorageBySource(source.id);
        const required = await this.getSelectedFilesReservation(
          source,
          selectedStorage?.selectedFiles ?? [filePath],
          layout
        );
        if (required.known) {
          if (options.retentionClass === 'speculative')
            await this.storageService.reserveSpeculativeStorage(source.id, required.bytes);
          else await this.storageService.reserveStorage(source.id, required.bytes);
        }
        return {
          sourceId: source.id,
          torrent,
          storage: current,
          layout,
          shouldDetach: false,
          startTime: new Date(),
        };
      });

      if (!start.torrent) {
        if (start.shouldDetach) {
          try {
            await this.detachCompletedTorrent(source.id);
          } catch (error) {
            logger.warn(
              'DownloadService',
              `Seeding stop is pending for source ${source.id}`,
              error
            );
            this.scheduleDetachRetry(source.id);
          }
        }
        return start;
      }

      const { torrent, layout } = start;
      const totalPieces = this.getTorrentPieceCount(torrent);
      const latestStorage = await this.storageService.getStorageBySource(source.id);

      // Patch storage with correct totalPieces and size after torrent is ready
      await this.storageService.updateDownloadProgress({
        sourceId: source.id,
        downloadedPieces: torrent.bitfield?.buffer || new Uint8Array(0),
        totalPieces,
        size: torrent.length,
      });
      await this.storageService.updateTorrentLayout(
        source.id,
        totalPieces,
        torrent.pieceLength,
        torrent.length,
        this.getSelectedBytes(layout, latestStorage?.selectedFiles ?? [filePath])
      );
      await this.storageService.reconcileAllocation(source.id);

      // Set up bitfield tracking
      this.trackTorrent(torrent, source.id, layout);
      await this.maybeMarkVideoComplete(torrent, source.id, layout);

      logger.info(
        'DownloadService',
        `Successfully started greedy download for source ${source.id}`
      );
      return start;
    } catch (error) {
      logger.error(
        'DownloadService',
        `Failed to start greedy download for source ${source.id}:`,
        error
      );
      throw new ErrorWithStatus(
        `Failed to start greedy download: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'greedy_download_failed'
      );
    }
  }

  /**
   * A file is stored when its pieces are verified, or when it was requested from a source that
   * is already marked complete (completion is cleared whenever an incomplete file is requested).
   */
  private isFileStored(
    storage: Pick<Storage, 'downloadedPieces' | 'localOnly' | 'selectedFiles' | 'videoCompletedAt'>,
    layout: EncryptedStorageLayout,
    filePath: string
  ): boolean {
    return (
      isFileCompleteInBitfield(layout, filePath, storage.downloadedPieces) ||
      (Boolean(storage.localOnly || storage.videoCompletedAt) &&
        (storage.selectedFiles ?? []).includes(filePath))
    );
  }

  private assertFileInLayout(layout: EncryptedStorageLayout, filePath: string): void {
    if (!layout.files.some(file => file.path === filePath))
      throw new ErrorWithStatus(
        'Requested file is not part of this source',
        'source_file_unavailable'
      );
  }

  /** Logical bytes of the requested files within the source. */
  private getSelectedBytes(layout: EncryptedStorageLayout, paths: string[]): number {
    return layout.files
      .filter(file => paths.includes(file.path))
      .reduce((total, file) => total + file.length, 0);
  }

  /** File list of a source, from storage or its torrent file, without attaching the torrent. */
  async getKnownLayout(source: ContentSource): Promise<EncryptedStorageLayout | null> {
    const storage = await this.storageService.getStorageBySource(source.id);
    return storage?.encryptedLayout ?? (await this.recoverEncryptedLayout(source));
  }

  /**
   * File list of a source. When neither storage nor a torrent file knows it, the torrent is
   * attached with nothing selected so its metadata arrives through the normal download path.
   */
  async resolveLayout(source: ContentSource): Promise<EncryptedStorageLayout> {
    const known = await this.getKnownLayout(source);
    if (known) return known;
    await this.storageService.createStorage({
      sourceId: source.id,
      location: this.generateStoragePath(source.hash),
      size: source.size || 0,
      downloadedPieces: new Uint8Array(0),
      totalPieces: 0,
      retentionClass: 'speculative',
      reservedBytes: 0,
    });
    return this.storageService.withSourceLock(source.id, async () => {
      const current = await this.storageService.getStorageBySource(source.id);
      if (!current) {
        throw new ErrorWithStatus('Storage record is unavailable', 'local_media_unavailable');
      }
      if (current.encryptedLayout) return current.encryptedLayout;
      const torrent = await this.addTorrentWithLock(source, current);
      const layout = this.createEncryptedLayout(torrent, source.hash);
      await this.storageService.updateEncryptedLayout(source.id, layout);
      return layout;
    });
  }

  private async recoverEncryptedLayout(
    source: ContentSource
  ): Promise<EncryptedStorageLayout | null> {
    if (!source.file) return null;
    const parsed = await parseTorrent(source.file);
    const files = parsed.files ?? [];
    if (!files.length || !parsed.pieceLength || !parsed.name) return null;
    return {
      storeName: `${parsed.name} - ${source.hash.slice(0, 8)}`,
      filenameSalt: `download-${source.hash}`,
      pieceLength: parsed.pieceLength,
      files: files.map((file, index) => ({
        path: file.path,
        length: file.length,
        offset:
          file.offset ??
          files.slice(0, index).reduce((offset, previous) => offset + previous.length, 0),
      })),
    };
  }

  /** Estimate pack storage from selected files plus two boundary pieces per file. */
  private async getSelectedFilesReservation(
    source: ContentSource,
    paths: string[],
    knownLayout?: EncryptedStorageLayout
  ): Promise<{ bytes: number; known: boolean }> {
    let layout: EncryptedStorageLayout | null | undefined = knownLayout;
    try {
      layout ??= await this.recoverEncryptedLayout(source);
    } catch {
      return { bytes: source.size || 0, known: false };
    }
    if (!layout || !paths.length) return { bytes: source.size || 0, known: false };
    const uniquePaths = [...new Set(paths)];
    const files = uniquePaths.map(filePath => layout.files.find(file => file.path === filePath));
    if (files.some(file => !file)) return { bytes: source.size || 0, known: false };
    const contentBytes = files.reduce((total, file) => total + (file?.length ?? 0), 0);
    const boundaryBytes = layout.pieceLength * 2 * uniquePaths.length;
    const packBytes = layout.files.reduce((total, file) => total + file.length, 0);
    return {
      bytes: Math.max(1, Math.min(packBytes, contentBytes + boundaryBytes)),
      known: true,
    };
  }

  /**
   * Start or reuse a speculative download and select the smallest piece-aligned
   * prefix of the target file that covers the byte target, capped at the file end.
   * A source already retained as watched keeps the full file selected.
   *
   * @param speculativeExpiresAt Expiry for speculative retention, or null for no supplied expiry.
   * @returns Inclusive piece indices and their actual byte length, which can exceed the target.
   * @throws Propagates download failures, including a target file missing from the source.
   */
  async warmSource(
    target: PlaybackTarget,
    targetBytes: number,
    speculativeExpiresAt: Date | null = null
  ): Promise<WarmupResult> {
    const { source, filePath } = target;
    const requested = Math.max(1, Math.min(Math.floor(targetBytes), source.size || targetBytes));
    const download = await this.startDownload(target, {
      retentionClass: 'speculative',
      reservedBytes: requested,
      speculativeExpiresAt,
    });
    const layoutFile = download.layout.files.find(file => file.path === filePath)!;
    const pieceLength = download.layout.pieceLength;
    if (!download.torrent) {
      const firstPiece = Math.floor(layoutFile.offset / pieceLength);
      const lastPiece = Math.floor(
        (layoutFile.offset + Math.min(requested, layoutFile.length) - 1) / pieceLength
      );
      return { sourceId: source.id, filePath, targetBytes: requested, firstPiece, lastPiece };
    }
    const file = download.torrent.files.find(candidate => candidate.path === filePath);
    if (!file)
      throw new ErrorWithStatus(
        'Requested file is not part of this source',
        'source_file_unavailable'
      );
    const fileOffset = Number(file.offset ?? 0);
    const firstPiece = Math.max(0, Math.floor(fileOffset / pieceLength));
    const lastPiece = Math.min(
      this.getTorrentPieceCount(download.torrent) - 1,
      Math.max(
        firstPiece,
        Math.ceil((fileOffset + Math.min(requested, file.length)) / pieceLength) - 1
      )
    );
    const selectedTargetBytes = this.getRangeByteLength(download.torrent, firstPiece, lastPiece);

    if (download.storage.retentionClass === 'watched') {
      // A watched row may survive a torrent restart, so restore its full selection.
      this.warmupSelections.delete(source.id);
      file.select();
    } else {
      file.deselect();
      download.torrent.select(firstPiece, lastPiece, 1);
      this.warmupSelections.set(source.id, { firstPiece, lastPiece });
    }
    return {
      sourceId: source.id,
      filePath,
      targetBytes: selectedTargetBytes,
      firstPiece,
      lastPiece,
    };
  }

  async pauseSource(sourceId: number): Promise<boolean> {
    return this.pauseDownload(sourceId);
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
      return { verifiedBytes: 0, targetBytes: 0, progress: 0, isComplete: false };
    }
    const storage = await this.storageService.getStorageBySource(sourceId);
    if (!storage) return { verifiedBytes: 0, targetBytes: 0, progress: 0, isComplete: false };
    const torrent = this.client.torrents.find(item => item.path === storage.location);
    let layout = storage.encryptedLayout;
    if (!layout && torrent?.ready) {
      try {
        layout = this.createEncryptedLayout(torrent);
      } catch {
        // A ready torrent can still have incomplete or invalid file metadata.
      }
    }
    if (!torrent?.bitfield) {
      if ((storage.videoCompletedAt || storage.localOnly) && layout) {
        const targetBytes = this.getFileRangeByteLength(layout, filePath, firstPiece, lastPiece);
        if (targetBytes > 0) {
          return { verifiedBytes: targetBytes, targetBytes, progress: 100, isComplete: true };
        }
      }
      return { verifiedBytes: 0, targetBytes: 0, progress: 0, isComplete: false };
    }
    const totalPieces = torrent.pieces?.length;
    if (
      !Number.isInteger(totalPieces) ||
      totalPieces <= 0 ||
      firstPiece >= totalPieces ||
      lastPiece >= totalPieces
    ) {
      return { verifiedBytes: 0, targetBytes: 0, progress: 0, isComplete: false };
    }
    const targetBytes = layout
      ? this.getFileRangeByteLength(layout, filePath, firstPiece, lastPiece)
      : this.getRangeByteLength(torrent, firstPiece, lastPiece);
    if (targetBytes <= 0) {
      return { verifiedBytes: 0, targetBytes: 0, progress: 0, isComplete: false };
    }
    let verifiedBytes = 0;
    for (let piece = firstPiece; piece <= lastPiece; piece += 1) {
      if (torrent.bitfield.get(piece)) {
        verifiedBytes += layout
          ? this.getFileRangeByteLength(layout, filePath, piece, piece)
          : this.getPieceByteLength(torrent, piece);
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

  /**
   * Return the configured speculative buffer target in bytes.
   * @throws ConfigurationServiceError if PRELOAD_WARM_TARGET has no computed value.
   */
  getWarmupTargetBytes(): number {
    return Number(this.config.getOrThrow('PRELOAD_WARM_TARGET'));
  }

  /** Return a piece’s byte length, capped at the torrent end, or zero for unusable layout data. */
  private getPieceByteLength(torrent: Torrent, piece: number): number {
    const pieceLength = Number(torrent.pieceLength);
    const torrentLength = Number(torrent.length);
    if (!Number.isFinite(pieceLength) || pieceLength <= 0 || !Number.isFinite(torrentLength)) {
      return 0;
    }
    const start = piece * pieceLength;
    return Math.max(0, Math.min(pieceLength, torrentLength - start));
  }

  /** Count only the named file's bytes covered by an inclusive piece range. */
  private getFileRangeByteLength(
    layout: EncryptedStorageLayout,
    filePath: string,
    firstPiece: number,
    lastPiece: number
  ): number {
    const pieceLength = Number(layout.pieceLength);
    const file = layout.files.find(candidate => candidate.path === filePath);
    const fileStart = Number(file?.offset);
    const fileLength = Number(file?.length);
    if (
      !Number.isFinite(pieceLength) ||
      pieceLength <= 0 ||
      !Number.isFinite(fileStart) ||
      fileStart < 0 ||
      !Number.isFinite(fileLength) ||
      fileLength <= 0
    ) {
      return 0;
    }
    const rangeStart = firstPiece * pieceLength;
    const rangeEnd = (lastPiece + 1) * pieceLength;
    const fileEnd = fileStart + fileLength;
    return Math.max(0, Math.min(rangeEnd, fileEnd) - Math.max(rangeStart, fileStart));
  }

  /** Sum byte lengths across an inclusive, zero-based piece range, including a short final piece. */
  private getRangeByteLength(torrent: Torrent, firstPiece: number, lastPiece: number): number {
    let total = 0;
    for (let piece = firstPiece; piece <= lastPiece; piece += 1) {
      total += this.getPieceByteLength(torrent, piece);
    }
    return total;
  }

  /** Promote the already-added source; no source ranking or replacement occurs. */
  async promoteSource(target: PlaybackTarget): Promise<boolean> {
    const { source, filePath } = target;
    const download = await this.startDownload(target, { retentionClass: 'watched' });
    if (!download.torrent) {
      await this.storageService.markAsAccessed(source.id);
      return true;
    }
    const file = download.torrent.files.find(candidate => candidate.path === filePath);
    if (!file) return false;
    this.warmupSelections.delete(source.id);
    file.select();
    await this.storageService.markAsAccessed(source.id);
    return true;
  }

  /**
   * Download one file in the background while preserving the playback reserve. Within a shared
   * source the playing file keeps higher piece priority; another source waits only until active
   * playback has fully buffered its file.
   */
  async predownload(target: PlaybackTarget): Promise<boolean> {
    const { source, filePath } = target;
    if (await this.isFileComplete(source.id, filePath)) return true;
    const download = await this.startDownload(target, { retentionClass: 'speculative' });
    if (!download.torrent) return true;
    const file = download.torrent.files.find(candidate => candidate.path === filePath);
    if (!file)
      throw new ErrorWithStatus(
        'Requested file is not part of this source',
        'source_file_unavailable'
      );

    await this.storageService.withSourceLock(source.id, async () => {
      this.warmupSelections.delete(source.id);
      file.select(1);
      if (
        this.activeStreams > 0 &&
        !this.activeSourceCounts.get(source.id) &&
        (await this.hasIncompleteActivePlayback(source.id))
      ) {
        if (await this.pauseDownload(source.id)) this.pausedForPlayback.add(source.id);
      }
    });
    return true;
  }

  async isFileComplete(sourceId: number, filePath: string): Promise<boolean> {
    const storage = await this.storageService.getStorageBySource(sourceId);
    if (
      !storage ||
      (!storage.videoCompletedAt && !storage.localOnly) ||
      !storage.selectedFiles?.includes(filePath)
    )
      return false;
    return storage.encryptedLayout
      ? isFileCompleteInBitfield(storage.encryptedLayout, filePath, storage.downloadedPieces)
      : true;
  }

  /**
   * Generate secure storage path for a torrent hash
   * Uses salted hash to prevent hash exposure in file paths
   */
  private generateStoragePath(hash: string): string {
    const storageDir = this.config.getOrThrow('DOWNLOAD_PATH');
    const salt = this.config.getOrThrow('DOWNLOAD_SALT');

    // Create a salted hash to prevent hash exposure
    const downloadDir = createHash('sha256')
      .update(hash + salt)
      .digest('hex')
      .substring(0, 16); // Use first 16 characters for shorter paths

    return `${storageDir}/${downloadDir}`;
  }

  /**
   * Add torrent with priority-specific configuration and encrypted chunk store
   */
  private async addTorrent(
    { magnetLink, hash, file }: Pick<ContentSource, 'file' | 'hash' | 'magnetLink'>,
    { location, downloadedPieces }: Pick<Storage, 'downloadedPieces' | 'location'>,
    timeout: number = 30000
  ): Promise<Torrent> {
    return new Promise((resolve, reject) => {
      try {
        const torrentOptions: TorrentOptions<EncryptedStorageOptions> = {
          path: location,
          deselect: true,
          store: EncryptedChunkStore,
          announce: this.bestTrackers,
          storeOpts: {
            encryptionKey: this.config.getOrThrow('SOURCE_SECURITY_KEY'),
            filenameSalt: `download-${hash}`,
          },
        };

        if (downloadedPieces) {
          torrentOptions.bitfield = downloadedPieces;
        }

        const existingTorrent = this.client.torrents.find(
          t => t.infoHash?.toLowerCase() === hash.toLowerCase()
        );
        if (existingTorrent) {
          void this.waitForTorrentReady(existingTorrent, timeout).then(resolve, reject);
          return;
        }

        const timeoutId = setTimeout(() => {
          reject(new ErrorWithStatus('Timeout adding download', 'add_torrent_timeout'));
        }, timeout);

        try {
          const temporaryTorrent = this.client.add(
            file || magnetLink || hash,
            torrentOptions,
            torrent => {
              clearTimeout(timeoutId);
              temporaryTorrent.off('error', onError);
              resolve(torrent);
            }
          );

          const onError = (error: Error) => {
            // Torrent always gets destroyed on error, no need to listen further
            temporaryTorrent.off('error', onError);
            clearTimeout(timeoutId);
            if (
              'message' in error &&
              error.message.toLowerCase() === `cannot add duplicate torrent ${hash}`.toLowerCase()
            ) {
              // Search again, maybe some race condition happened
              const existingTorrent = this.client.torrents.find(
                t => t.infoHash?.toLowerCase() === hash.toLowerCase()
              );
              if (existingTorrent) {
                void this.waitForTorrentReady(existingTorrent, timeout).then(resolve, reject);
                return;
              }
            }
            logger.error('DownloadService', `Error adding torrent ${hash}:`, error);
            reject(error);
          };

          temporaryTorrent.on('error', onError);
        } catch (error) {
          // The only case I could find where it throws here is when the client is destroyed
          logger.error('DownloadService', `Error adding torrent ${hash}:`, error);
          reject(error);
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  private async addTorrentWithLock(
    source: Pick<ContentSource, 'file' | 'hash' | 'magnetLink'>,
    storage: Pick<Storage, 'downloadedPieces' | 'location'>
  ): Promise<Torrent> {
    const key = source.hash.toLowerCase();
    const inFlight = this.torrentStartPromises.get(key);
    if (inFlight) return inFlight;

    const start = this.addTorrent(source, storage).finally(() => {
      if (this.torrentStartPromises.get(key) === start) {
        this.torrentStartPromises.delete(key);
      }
    });
    this.torrentStartPromises.set(key, start);
    return start;
  }

  private waitForTorrentReady(torrent: Torrent, timeout: number): Promise<Torrent> {
    if (torrent.ready) return Promise.resolve(torrent);

    return new Promise((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        if (timeoutId) clearTimeout(timeoutId);
        torrent.removeListener('ready', onReady);
        torrent.removeListener('error', onError);
        torrent.removeListener('close', onClose);
      };
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        cleanup();
        callback();
      };
      const onReady = () => {
        finish(() => resolve(torrent));
      };
      const onError = (error: Error) => {
        finish(() => reject(error));
      };
      const onClose = () => {
        finish(() =>
          reject(new ErrorWithStatus('Torrent closed before metadata was ready', 'torrent_closed'))
        );
      };
      const timeoutId = setTimeout(() => {
        finish(() =>
          reject(new ErrorWithStatus('Timeout waiting for torrent metadata', 'torrent_not_ready'))
        );
      }, timeout);
      torrent.once('ready', onReady);
      torrent.once('error', onError);
      torrent.once('close', onClose);
    });
  }

  private getTorrentPieceCount(torrent: Torrent): number {
    const pieces = torrent.pieces;
    const totalPieces = pieces?.length;
    if (typeof totalPieces !== 'number' || !Number.isInteger(totalPieces) || totalPieces <= 0) {
      throw new ErrorWithStatus(
        'Torrent metadata did not include a valid piece count',
        'invalid_torrent_metadata'
      );
    }
    return totalPieces;
  }

  /**
   * Get download progress for a movie source
   */
  @traced('DownloadService')
  async getDownloadProgress(sourceId: number): Promise<DownloadProgress | null> {
    try {
      const storage = await this.storageService.getStorageBySource(sourceId);
      if (!storage) {
        return null;
      }

      const requestedBytes = storage.encryptedLayout
        ? this.getSelectedBytes(storage.encryptedLayout, storage.selectedFiles ?? [])
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
      const torrent = this.client.torrents.find(t => t.path === storage.location);
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
   * Pause download for a movie source
   */
  @traced('DownloadService')
  async pauseDownload(sourceId: number): Promise<boolean> {
    try {
      const storage = await this.storageService.getStorageBySource(sourceId);
      if (!storage) {
        logger.warn('DownloadService', `No storage found for movie source ${sourceId}`);
        return false;
      }

      const torrent = this.client.torrents.find(t => t.path === storage.location);
      if (!torrent) {
        logger.warn('DownloadService', `No active torrent found for movie source ${sourceId}`);
        return false;
      }

      // Pause by deselecting all files
      if (torrent.files && torrent.files.length > 0) {
        torrent.files.forEach(file => file.deselect());
        // File selection and explicit piece selection are independent in WebTorrent.
        // Clear both so a paused warmup cannot continue downloading its range.
        torrent.deselect(0, Math.max(0, this.getTorrentPieceCount(torrent) - 1));
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
   * Resume download for a movie source
   */
  @traced('DownloadService')
  async resumeDownload(sourceId: number): Promise<boolean> {
    try {
      const storage = await this.storageService.getStorageBySource(sourceId);
      if (!storage) {
        logger.warn('DownloadService', `No storage found for movie source ${sourceId}`);
        return false;
      }

      const torrent = this.client.torrents.find(t => t.path === storage.location);
      if (!torrent) {
        logger.warn('DownloadService', `No active torrent found for movie source ${sourceId}`);
        return false;
      }

      const warmup = this.warmupSelections.get(sourceId);
      if (warmup) {
        torrent.files?.forEach(file => file.deselect());
        torrent.select(warmup.firstPiece, warmup.lastPiece, 1);
        logger.info('DownloadService', `Resumed warmup for movie source ${sourceId}`);
        return true;
      }

      // Resume by selecting files
      if (torrent.files && torrent.files.length > 0) {
        const selectedPaths = new Set(storage.selectedFiles ?? []);
        torrent.files.forEach(file => {
          if (selectedPaths.has(file.path)) file.select(1);
        });
        logger.info('DownloadService', `Resumed download for movie source ${sourceId}`);
        return true;
      }

      return false;
    } catch (error) {
      logger.error('DownloadService', `Failed to resume download for source ${sourceId}:`, error);
      return false;
    }
  }

  /**
   * Remove/cancel download for a movie source
   */
  @traced('DownloadService')
  async cancelDownload(sourceId: number): Promise<boolean> {
    try {
      const storage = await this.storageService.getStorageBySource(sourceId);
      if (!storage) {
        logger.warn('DownloadService', `No storage found for movie source ${sourceId}`);
        return false;
      }

      // StorageService serializes deletion with lifecycle detachment and removes both the
      // torrent and encrypted files through the registered cleanup handler.
      await this.storageService.removeStorage(sourceId);
      this.warmupSelections.delete(sourceId);
      this.pausedForPlayback.delete(sourceId);
      logger.info(
        'DownloadService',
        `Cancelled download and cleaned up storage for movie source ${sourceId}`
      );

      return true;
    } catch (error) {
      logger.error('DownloadService', `Failed to cancel download for source ${sourceId}:`, error);
      return false;
    }
  }

  /**
   * Set up bitfield tracking for storage service integration
   */
  private setupBitfieldTracking(
    torrent: Torrent,
    sourceId: number,
    layout: EncryptedStorageLayout
  ): void {
    torrent.on('verified', async () => {
      try {
        // Convert BitField to Uint8Array for storage service
        const bitfieldBuffer = torrent.bitfield?.buffer
          ? Buffer.from(torrent.bitfield.buffer)
          : new Uint8Array(0);

        await this.storageService.updateDownloadProgress({
          sourceId,
          downloadedPieces: new Uint8Array(bitfieldBuffer),
          totalPieces: this.getTorrentPieceCount(torrent),
          size: torrent.length,
        });
        await this.reconcileAllocationIfDue(sourceId);
        await this.maybeMarkVideoComplete(torrent, sourceId, layout);
        await this.resumeSpeculativeDownloadsWhenPlaybackReady();
      } catch (error) {
        logger.warn(
          'DownloadService',
          `Failed to update download progress for source ${sourceId}:`,
          error
        );
      }
    });

    torrent.on('done', async () => {
      try {
        await this.reconcileAllocationIfDue(sourceId, true);
        await this.storageService.markAsAccessed(sourceId);
        logger.info('DownloadService', `Download completed for movie source ${sourceId}`);
      } catch (error) {
        logger.warn(
          'DownloadService',
          `Failed to mark download as complete for source ${sourceId}:`,
          error
        );
      }
    });

    void this.maybeMarkVideoComplete(torrent, sourceId, layout).catch(error => {
      logger.warn(
        'DownloadService',
        `Failed to record video completion for source ${sourceId}`,
        error
      );
    });
  }

  private async reconcileAllocationIfDue(sourceId: number, force = false): Promise<void> {
    const inFlight = this.allocationReconcileInFlight.get(sourceId);
    if (inFlight) {
      if (!force) return inFlight;
      await inFlight.catch(() => undefined);
      return this.reconcileAllocationIfDue(sourceId, true);
    }
    const now = Date.now();
    if (!force && now - (this.allocationReconcileAt.get(sourceId) ?? 0) < 1_000) return;
    const reconcile = this.storageService
      .reconcileAllocation(sourceId)
      .then(() => {
        this.allocationReconcileAt.set(sourceId, Date.now());
      })
      .finally(() => {
        if (this.allocationReconcileInFlight.get(sourceId) === reconcile) {
          this.allocationReconcileInFlight.delete(sourceId);
        }
      });
    this.allocationReconcileInFlight.set(sourceId, reconcile);
    return reconcile;
  }

  /** Use the same persisted file selection as playback, including detached local media. */
  async getMediaFiles(target: PlaybackTarget): Promise<EncryptedStorageLayout> {
    const download = await this.startDownload(target, { retentionClass: 'watched' });
    return download.layout;
  }

  /** Request small subtitle sidecars of the target's source; already verified ones are skipped. */
  async prepareSubtitleFiles(target: PlaybackTarget, paths: string[]): Promise<void> {
    if (!paths.length) return;
    const existing = await this.storageService.getStorageBySource(target.source.id);
    const layout = existing?.encryptedLayout;
    if (!existing || !layout) return;
    const missing = paths.filter(path => {
      const file = layout.files.find(candidate => candidate.path === path);
      return (
        file &&
        file.length <= MAX_SIDECAR_BYTES &&
        SIDECAR_SUBTITLE.test(path) &&
        !(existing.selectedFiles?.includes(path) && this.isFileStored(existing, layout, path))
      );
    });
    for (const path of missing) {
      const download = await this.startDownload(withFile(target, path), {
        retentionClass: 'watched',
      });
      download.torrent?.files.find(file => file.path === path)?.select();
    }
  }

  /**
   * Stream a file from a torrent with range request support
   * Based on WebTorrent server implementation
   */
  @traced('DownloadService')
  async streamFile(target: PlaybackTarget, rangeHeader?: string): Promise<Response> {
    const contentSource = target.source;
    return new Promise((resolve, reject) => {
      const handleRequest = async () => {
        const download = await this.startDownload(target, { retentionClass: 'watched' });
        const { torrent, storage, layout } = download;
        const selected = layout.files.find(file => file.path === target.filePath);
        if (!selected) throw new Error('Requested torrent file is unavailable');
        const file = { ...selected, name: selected.path.split('/').pop() || selected.path };
        const reader = new EncryptedFileReader(
          storage.location,
          layout,
          selected.path,
          this.config.getOrThrow('SOURCE_SECURITY_KEY')
        );
        await this.storageService.withSourceLock(contentSource.id, async () => {
          if (!(await this.storageService.setPlaybackActive(contentSource.id, true))) {
            throw new Error(`Storage not found for movie source ${contentSource.id}`);
          }
          torrent?.files.find(item => item.path === file.path)?.select(10);
          this.activeStreams += 1;
          this.activeSourceCounts.set(
            contentSource.id,
            (this.activeSourceCounts.get(contentSource.id) ?? 0) + 1
          );
          this.changeActiveFileCount(contentSource.id, file.path, 1);
          if (this.activeStreams === 1) {
            try {
              await this.pauseSpeculativeDownloads(contentSource.id);
            } catch (error) {
              // Undo admission before propagating startup failure. The stream has
              // no release callback yet, so leaving these counts set would wedge
              // future playback and prevent another pause sweep.
              this.activeStreams = Math.max(0, this.activeStreams - 1);
              const remaining = (this.activeSourceCounts.get(contentSource.id) ?? 1) - 1;
              if (remaining > 0) this.activeSourceCounts.set(contentSource.id, remaining);
              else this.activeSourceCounts.delete(contentSource.id);
              this.changeActiveFileCount(contentSource.id, file.path, -1);
              await this.storageService.setPlaybackActive(contentSource.id, false);
              throw error;
            }
          }
        });

        const headers: Record<string, string> = {
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
          'Content-Disposition': `inline; filename*=UTF-8''${encodeRFC5987(file.name)}`,
          'Content-Type': getContentType(file.name),
          Expires: '0',
          'transferMode.dlna.org': 'Streaming',
          'contentFeatures.dlna.org':
            'DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01700000000000000000000000000000',
          // CORS headers
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Access-Control-Allow-Headers': 'Range',
        };
        let status = 200;
        const range = parseRangeHeader(file.length, rangeHeader || '');
        const firstByte = range?.start ?? 0;
        const lastByte = range?.end ?? file.length - 1;
        if (range) {
          status = 206;
          headers['Content-Range'] = `bytes ${range.start}-${range.end}/${file.length}`;
          headers['Content-Length'] = String(range.end - range.start + 1);
        } else {
          headers['Content-Length'] = String(file.length);
        }

        let cancelled = false;
        const abortController = new AbortController();
        let releasePromise: Promise<void> | undefined;
        const release = (): Promise<void> => {
          if (releasePromise) return releasePromise;
          this.activeStreams = Math.max(0, this.activeStreams - 1);
          const remaining = (this.activeSourceCounts.get(contentSource.id) ?? 1) - 1;
          if (remaining > 0) this.activeSourceCounts.set(contentSource.id, remaining);
          else this.activeSourceCounts.delete(contentSource.id);
          this.changeActiveFileCount(contentSource.id, file.path, -1);
          releasePromise = this.storageService.withSourceLock(contentSource.id, async () => {
            await this.storageService.setPlaybackActive(contentSource.id, false);
            if (this.activeStreams === 0) await this.resumeSpeculativeDownloads();
          });
          return releasePromise;
        };

        const webReadableStream = new ReadableStream<Uint8Array>({
          start: async controller => {
            try {
              let cursor = firstByte;
              while (!cancelled && cursor <= lastByte) {
                const torrentOffset = file.offset + cursor;
                const pieceIndex = Math.floor(torrentOffset / layout.pieceLength);
                const pieceOffset = torrentOffset % layout.pieceLength;
                const piece = await this.readVerifiedPiece(
                  reader,
                  torrent,
                  storage,
                  pieceIndex,
                  abortController.signal
                );
                const bytes = piece.subarray(
                  pieceOffset,
                  Math.min(
                    piece.length,
                    layout.pieceLength,
                    pieceOffset + 256 * 1024,
                    pieceOffset + lastByte - cursor + 1
                  )
                );
                if (!bytes.length)
                  throw new ErrorWithStatus(
                    'Encrypted media ended before the requested range',
                    'local_media_incomplete'
                  );
                while (
                  !cancelled &&
                  controller.desiredSize !== null &&
                  controller.desiredSize <= 0
                ) {
                  await new Promise<void>(resolveWait => {
                    const finish = () => {
                      clearTimeout(timer);
                      abortController.signal.removeEventListener('abort', finish);
                      resolveWait();
                    };
                    const timer = setTimeout(finish, 10);
                    abortController.signal.addEventListener('abort', finish, { once: true });
                  });
                }
                if (cancelled) break;
                controller.enqueue(bytes);
                cursor += bytes.length;
              }
              if (!cancelled) controller.close();
            } catch (error) {
              if (!cancelled) controller.error(error);
            } finally {
              await reader
                .close()
                .catch(error =>
                  logger.warn('DownloadService', 'Failed to close encrypted file reader', error)
                );
              if (!releasePromise) await release();
            }
          },

          async cancel() {
            cancelled = true;
            abortController.abort();
            logger.debug('DownloadService', 'Stream cancelled by client');
            await release();
          },
        });

        // Create Response with the Web ReadableStream and headers
        const response = new Response(webReadableStream, {
          status,
          headers,
        });

        resolve(response);
      };

      if (this.client.ready) {
        handleRequest().catch(reject);
      } else {
        this.client.once('ready', () => handleRequest().catch(reject));
      }
    });
  }

  /** Pause only speculative torrents while the first active stream is consuming bandwidth. */
  private async pauseSpeculativeDownloads(excludeSourceId: number): Promise<void> {
    if (!(await this.hasIncompleteActivePlayback())) return;
    const records = (await this.storageService.getSpeculativeStorage()) ?? [];
    await Promise.all(
      records
        .filter(record => record.sourceId !== excludeSourceId && record.activeStreams === 0)
        .map(async record => {
          if (await this.pauseDownload(record.sourceId))
            this.pausedForPlayback.add(record.sourceId);
        })
    );
  }

  /** Resume only torrents paused by playback admission; unrelated pauses remain untouched. */
  private async resumeSpeculativeDownloads(): Promise<void> {
    const sourceIds = [...this.pausedForPlayback];
    this.pausedForPlayback.clear();
    await Promise.all(sourceIds.map(sourceId => this.resumeDownload(sourceId)));
  }

  private async resumeSpeculativeDownloadsWhenPlaybackReady(): Promise<void> {
    if (!this.pausedForPlayback.size || (await this.hasIncompleteActivePlayback())) return;
    await this.resumeSpeculativeDownloads();
  }

  private async hasIncompleteActivePlayback(excludeSourceId?: number): Promise<boolean> {
    for (const [sourceId, streamCount] of this.activeSourceCounts) {
      if (!streamCount || sourceId === excludeSourceId) continue;
      const storage = await this.storageService.getStorageBySource(sourceId);
      if (!storage) return true;
      if (storage.videoCompletedAt || storage.localOnly) continue;
      const layout = storage.encryptedLayout;
      if (!layout) return true;
      const torrent = this.client.torrents.find(item => item.path === storage.location);
      const bitfield = torrent?.bitfield?.buffer ?? storage.downloadedPieces;
      const paths = this.activeSourceFiles.get(sourceId);
      if (!paths?.size) return true;
      for (const path of paths.keys()) {
        if (!isFileCompleteInBitfield(layout, path, bitfield)) return true;
      }
    }
    return false;
  }

  private changeActiveFileCount(sourceId: number, path: string, delta: -1 | 1): void {
    const paths = this.activeSourceFiles.get(sourceId) ?? new Map<string, number>();
    const count = (paths.get(path) ?? 0) + delta;
    if (count > 0) paths.set(path, count);
    else paths.delete(path);
    if (paths.size) this.activeSourceFiles.set(sourceId, paths);
    else this.activeSourceFiles.delete(sourceId);
  }
}
