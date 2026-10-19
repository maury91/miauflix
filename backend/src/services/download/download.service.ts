import { createHash } from 'node:crypto';

import { logger } from '@logger';
import type { ScrapeData } from 'bittorrent-tracker';
import { Client as BTClient } from 'bittorrent-tracker';
import { access, constants, mkdir, rm } from 'fs/promises';
import MemoryChunkStore from 'memory-chunk-store';
import parseTorrent from 'parse-torrent';
import type { Torrent, TorrentOptions, WebTorrentOptions } from 'webtorrent';
import WebTorrent from 'webtorrent';

import type { MovieSource } from '@entities/movie-source.entity';
import type { EncryptedStorageLayout, Storage } from '@entities/storage.entity';
import type { ConfigService, ServiceInstanceStatus } from '@mytypes/configuration';
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
  getVideoFile,
  isVideoFile,
  parseRangeHeader,
} from './download.utils';
import { EncryptedFileReader } from './encrypted-file-reader';
import { TorrentDiagnostics } from './torrent-diagnostics';

// Types for greedy streaming
// export type DownloadPriority = 'full' | 'partial';

export interface GreedyDownload {
  movieSourceId: number;
  torrent: Torrent | null;
  storage: Storage;
  layout?: EncryptedStorageLayout;
  // priority: DownloadPriority;
  startTime: Date;
}

export interface DownloadProgress {
  movieSourceId: number;
  progress: number; // Percentage (0-100)
  downloadedBytes: number;
  totalBytes: number;
  downloadSpeed: number; // bytes/second
  isComplete: boolean;
}

export interface WarmupResult {
  sourceId: number;
  targetBytes: number;
  firstPiece: number;
  lastPiece: number;
}

export type StorageActivity = 'active' | 'available_offline' | 'inactive' | 'local_only';

function isStoredPieceVerified(pieces: Uint8Array, pieceIndex: number): boolean {
  const byte = pieces[Math.floor(pieceIndex / 8)] ?? 0;
  return (byte & (1 << (7 - (pieceIndex % 8)))) !== 0;
}

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
      const seedTimer = this.seedTimers.get(storage.movieSourceId);
      if (seedTimer) clearTimeout(seedTimer);
      this.seedTimers.delete(storage.movieSourceId);
      const marker = storage as Storage & { physicalCleanupDone?: boolean };
      if (marker.physicalCleanupDone) return;
      // Get the hash from the associated MovieSource
      const hash = storage.movieSource?.hash;
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
      this.warmupSelections.delete(storage.movieSourceId);
      this.pausedForPlayback.delete(storage.movieSourceId);
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
      movieSource?: { hash: string } | null;
    }
  ): StorageActivitySnapshot {
    const sourceHash = storage.movieSource?.hash;
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
        const selected = storage.selectedFiles?.length ? storage.selectedFiles : null;
        videoComplete = selected
          ? selected.every(path =>
              this.isFileCompleteInBitfield(layout, path, torrent.bitfield?.buffer)
            )
          : this.isLayoutVideoCompleteInBitfield(layout, torrent.bitfield?.buffer);
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
    sourceHash = torrent.infoHash,
    video = getVideoFile(torrent)
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
      video: {
        name: video.name,
        path: video.path,
        offset: Number(video.offset ?? 0),
        length: video.length,
      },
    };
  }

  private async maybeMarkVideoComplete(
    torrent: Torrent,
    movieSourceId: number,
    layout: EncryptedStorageLayout
  ): Promise<void> {
    const current = await this.storageService.getStorageByMovieSource(movieSourceId);
    if (!current) return;
    const selected = current.selectedFiles ?? [];
    if (
      selected.length
        ? !selected.every(path =>
            this.isFileCompleteInBitfield(layout, path, torrent.bitfield?.buffer)
          )
        : !this.isLayoutVideoCompleteInBitfield(layout, torrent.bitfield?.buffer)
    )
      return;
    const finalPath = [...selected].reverse().find(path => isVideoFile(path));
    const completedLayout = finalPath ? this.selectLayoutVideo(layout, finalPath) : layout;
    const storage = await this.storageService.markVideoComplete(movieSourceId, completedLayout);
    if (storage) this.scheduleSeedExpiry(storage);
  }

  private selectLayoutVideo(layout: EncryptedStorageLayout, path?: string): EncryptedStorageLayout {
    if (!path) return layout;
    const file = layout.files.find(candidate => candidate.path === path);
    if (!file || !isVideoFile(file.path))
      throw new ErrorWithStatus('Episode video file is unavailable', 'episode_file_unavailable');
    return { ...layout, video: { ...file, name: file.path } };
  }

  private isFileCompleteInBitfield(
    layout: EncryptedStorageLayout,
    path: string,
    bitfield?: Uint8Array | null
  ): boolean {
    const file = layout.files.find(candidate => candidate.path === path);
    return file
      ? this.isByteRangeCompleteInBitfield(layout, file.offset, file.length, bitfield)
      : false;
  }

  private isLayoutVideoCompleteInBitfield(
    layout: EncryptedStorageLayout,
    bitfield?: Uint8Array | null
  ): boolean {
    return this.isByteRangeCompleteInBitfield(
      layout,
      layout.video.offset,
      layout.video.length,
      bitfield
    );
  }

  private isByteRangeCompleteInBitfield(
    layout: EncryptedStorageLayout,
    offset: number,
    length: number,
    bitfield?: Uint8Array | null
  ): boolean {
    if (length <= 0 || !bitfield?.length || layout.pieceLength <= 0) return false;
    const firstPiece = Math.floor(offset / layout.pieceLength);
    const lastPiece = Math.floor((offset + length - 1) / layout.pieceLength);
    for (let piece = firstPiece; piece <= lastPiece; piece++) {
      const byte = bitfield[Math.floor(piece / 8)] ?? 0;
      if ((byte & (1 << (7 - (piece % 8)))) === 0) return false;
    }
    return true;
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
      if (!storage.movieSource) continue;
      const deadline = storage.videoCompletedAt!.getTime() + this.getSeedDurationMs();
      if (deadline <= Date.now()) {
        try {
          await this.detachCompletedTorrent(storage.movieSourceId);
        } catch (error) {
          logger.warn(
            'DownloadService',
            `Could not detach expired source ${storage.movieSourceId}`,
            error
          );
          this.scheduleDetachRetry(storage.movieSourceId);
        }
        continue;
      }
      try {
        await this.storageService.withSourceLock(storage.movieSourceId, async () => {
          const current = await this.storageService.getStorageByMovieSource(storage.movieSourceId);
          if (
            !current ||
            current.localOnly ||
            !current.videoCompletedAt ||
            !current.movieSource ||
            current.videoCompletedAt.getTime() + this.getSeedDurationMs() <= Date.now()
          ) {
            return;
          }
          const torrent = await this.addTorrentWithLock(current.movieSource, current);
          const savedLayout =
            current.encryptedLayout ??
            this.createEncryptedLayout(torrent, current.movieSource.hash);
          const layout = this.withSourceFilenameSalt(savedLayout, current.movieSource.hash);
          await this.storageService.updateEncryptedLayout(current.movieSourceId, layout);
          const selected = current.selectedFiles?.length
            ? current.selectedFiles
            : [layout.video.path];
          for (const path of selected) torrent.files.find(file => file.path === path)?.select();
          this.trackTorrent(torrent, current.movieSourceId, layout);
          this.scheduleSeedExpiry(current);
        });
      } catch (error) {
        logger.warn(
          'DownloadService',
          `Could not restore seeding for completed source ${storage.movieSourceId}`,
          error
        );
      }
    }
  }

  private getSeedDurationMs(): number {
    return Number(this.config.getOrThrow('CONTENT_SEED_DURATION_SECONDS')) * 1_000;
  }

  private scheduleSeedExpiry(storage: Storage): void {
    const previous = this.seedTimers.get(storage.movieSourceId);
    if (previous) clearTimeout(previous);
    this.seedTimers.delete(storage.movieSourceId);
    if (!storage.videoCompletedAt || storage.localOnly) return;
    const deadline = storage.videoCompletedAt.getTime() + this.getSeedDurationMs();
    const timer = setTimeout(
      () => {
        this.seedTimers.delete(storage.movieSourceId);
        void this.expireCompletedTorrent(storage.movieSourceId);
      },
      Math.max(0, Math.min(deadline - Date.now(), 2_147_000_000))
    );
    timer.unref?.();
    this.seedTimers.set(storage.movieSourceId, timer);
  }

  private async expireCompletedTorrent(movieSourceId: number): Promise<void> {
    try {
      const storage = await this.storageService.getStorageByMovieSource(movieSourceId);
      if (!storage?.videoCompletedAt || storage.localOnly) return;
      if (Date.now() < storage.videoCompletedAt.getTime() + this.getSeedDurationMs()) {
        this.scheduleSeedExpiry(storage);
        return;
      }
      await this.detachCompletedTorrent(movieSourceId);
    } catch (error) {
      logger.warn(
        'DownloadService',
        `Failed to stop seeding source ${movieSourceId}; retrying`,
        error
      );
      this.scheduleDetachRetry(movieSourceId);
    }
  }

  private scheduleDetachRetry(movieSourceId: number): void {
    const timer = setTimeout(() => {
      this.seedTimers.delete(movieSourceId);
      void this.detachCompletedTorrent(movieSourceId).catch(error => {
        logger.warn(
          'DownloadService',
          `Retry failed to stop seeding source ${movieSourceId}`,
          error
        );
        this.scheduleDetachRetry(movieSourceId);
      });
    }, 15_000);
    timer.unref?.();
    this.seedTimers.set(movieSourceId, timer);
  }

  private async detachCompletedTorrent(movieSourceId: number): Promise<void> {
    await this.storageService.detachCompletedStorage(movieSourceId, async () => {
      const storage = await this.storageService.getStorageByMovieSource(movieSourceId);
      const torrent = this.client.torrents.find(item => item.path === storage?.location);
      if (torrent) await this.client.remove(torrent, { destroyStore: false });
    });
    const timer = this.seedTimers.get(movieSourceId);
    if (timer) clearTimeout(timer);
    this.seedTimers.delete(movieSourceId);
    logger.info(
      'DownloadService',
      `Stopped seeding source ${movieSourceId}; encrypted files retained`
    );
  }

  private trackTorrent(
    torrent: Torrent,
    movieSourceId: number,
    layout: EncryptedStorageLayout
  ): void {
    const trackedSourceIds = this.bitfieldTrackedTorrents.get(torrent) ?? new Set<number>();
    if (trackedSourceIds.has(movieSourceId)) return;
    trackedSourceIds.add(movieSourceId);
    this.bitfieldTrackedTorrents.set(torrent, trackedSourceIds);
    this.setupBitfieldTracking(torrent, movieSourceId, layout);
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
        isStoredPieceVerified(storage.downloadedPieces, pieceIndex)
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
    source: MovieSource,
    options: {
      retentionClass?: 'speculative' | 'watched';
      reservedBytes?: number;
      speculativeExpiresAt?: Date | null;
      videoFilePath?: string;
      forceAttach?: boolean;
    } = {}
  ): Promise<GreedyDownload> {
    try {
      logger.info('DownloadService', `Starting download for source ${source.id}`);

      const existingStorage = await this.storageService.getStorageByMovieSource(source.id);
      const selectedPaths = new Set(existingStorage?.selectedFiles ?? []);
      if (options.videoFilePath) selectedPaths.add(options.videoFilePath);
      const reservation = options.videoFilePath
        ? await this.getSelectedFilesReservation(
            source,
            [...selectedPaths],
            existingStorage?.encryptedLayout ?? undefined
          )
        : null;
      const reservedBytes = options.videoFilePath
        ? reservation?.known
          ? reservation.bytes
          : (existingStorage?.reservedBytes ?? 0)
        : (options.reservedBytes ?? (options.retentionClass === 'speculative' ? 0 : source.size));

      // FixMe: Create or get storage
      // If storage already exists use the bitfield for the torrent
      // Create storage record first
      await this.storageService.createStorage({
        movieSourceId: source.id,
        location: this.generateStoragePath(source.hash),
        size: source.size || 0,
        downloadedPieces: new Uint8Array(0),
        totalPieces: 0,
        retentionClass: options.retentionClass,
        reservedBytes,
        partialReservation: Boolean(options.videoFilePath),
        speculativeExpiresAt: options.speculativeExpiresAt,
      });

      const start = await this.storageService.withSourceLock(source.id, async () => {
        let current = await this.storageService.getStorageByMovieSource(source.id);
        if (!current) {
          throw new ErrorWithStatus('Storage record is unavailable', 'local_media_unavailable');
        }
        if (options.videoFilePath) {
          const savedLayout =
            current.encryptedLayout ?? (await this.recoverEncryptedLayout(source));
          if (
            !options.forceAttach &&
            savedLayout &&
            this.isFileCompleteInBitfield(
              savedLayout,
              options.videoFilePath,
              current.downloadedPieces
            )
          ) {
            const layout = this.selectLayoutVideo(
              this.withSourceFilenameSalt(savedLayout, source.hash),
              options.videoFilePath
            );
            await this.storageService.selectTorrentFile(source.id, options.videoFilePath, true);
            return {
              movieSourceId: source.id,
              torrent: null,
              storage: current,
              layout,
              shouldDetach: false,
              startTime: new Date(),
            };
          }
          await this.storageService.selectTorrentFile(
            source.id,
            options.videoFilePath,
            Boolean(
              savedLayout &&
                this.isFileCompleteInBitfield(
                  savedLayout,
                  options.videoFilePath,
                  current.downloadedPieces
                )
            )
          );
          const timer = this.seedTimers.get(source.id);
          if (timer) clearTimeout(timer);
          this.seedTimers.delete(source.id);
          current = (await this.storageService.reactivateTorrent(source.id)) ?? current;
        }
        if (
          !options.forceAttach &&
          !options.videoFilePath &&
          (current.localOnly || current.videoCompletedAt)
        ) {
          const expired = Boolean(
            current.videoCompletedAt &&
              Date.now() >= current.videoCompletedAt.getTime() + this.getSeedDurationMs()
          );
          if (current.localOnly || expired) {
            const savedLayout =
              current.encryptedLayout ?? (await this.recoverEncryptedLayout(source));
            const layout = savedLayout
              ? this.withSourceFilenameSalt(savedLayout, source.hash)
              : null;
            if (layout && layout.filenameSalt !== current.encryptedLayout?.filenameSalt) {
              await this.storageService.updateEncryptedLayout(source.id, layout);
            }
            return {
              movieSourceId: source.id,
              torrent: null,
              storage: current,
              layout: layout ?? undefined,
              shouldDetach: expired && !current.localOnly,
              startTime: new Date(),
            };
          }
        }

        // Serialize torrent startup against expiry detachment and storage deletion.
        const torrent = await this.addTorrentWithLock(source, current);
        const layout = this.selectLayoutVideo(
          this.createEncryptedLayout(torrent, source.hash),
          options.videoFilePath
        );
        await this.storageService.updateEncryptedLayout(source.id, layout);
        if (options.videoFilePath)
          await this.storageService.selectTorrentFile(
            source.id,
            options.videoFilePath,
            this.isFileCompleteInBitfield(layout, options.videoFilePath, current.downloadedPieces)
          );
        if (options.videoFilePath) {
          const selectedStorage = await this.storageService.getStorageByMovieSource(source.id);
          const required = await this.getSelectedFilesReservation(
            source,
            selectedStorage?.selectedFiles ?? [options.videoFilePath],
            layout
          );
          if (required.known) {
            if (options.retentionClass === 'speculative')
              await this.storageService.reserveSpeculativeStorage(source.id, required.bytes);
            else await this.storageService.reserveStorage(source.id, required.bytes);
          }
        }
        return {
          movieSourceId: source.id,
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
        if (!start.layout) {
          throw new ErrorWithStatus(
            'Completed encrypted media layout is unavailable',
            'local_media_unavailable'
          );
        }
        return start;
      }

      const { torrent, layout } = start;
      const totalPieces = this.getTorrentPieceCount(torrent);
      const latestStorage = await this.storageService.getStorageByMovieSource(source.id);

      // Patch storage with correct totalPieces and size after torrent is ready
      await this.storageService.updateDownloadProgress({
        movieSourceId: source.id,
        downloadedPieces: torrent.bitfield?.buffer || new Uint8Array(0),
        totalPieces,
        size: torrent.length,
      });
      await this.storageService.updateTorrentLayout(
        source.id,
        totalPieces,
        torrent.pieceLength,
        torrent.length,
        ...(options.videoFilePath
          ? [
              layout.files
                .filter(file => latestStorage?.selectedFiles.includes(file.path))
                .reduce((total, file) => total + file.length, 0),
            ]
          : [])
      );
      if (!options.videoFilePath) {
        if (options.retentionClass === 'speculative') {
          await this.storageService.reserveSpeculativeStorage(source.id, torrent.length);
        } else {
          await this.storageService.reserveStorage(source.id, torrent.length);
        }
      }
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

  private async recoverEncryptedLayout(
    source: MovieSource
  ): Promise<EncryptedStorageLayout | null> {
    if (!source.file) return null;
    const parsed = await parseTorrent(source.file);
    const files = parsed.files ?? [];
    const video = files
      .filter(file => isVideoFile(file.path))
      .sort((a, b) => b.length - a.length)[0];
    if (!video || !parsed.pieceLength || !parsed.name) return null;
    const recoveredFiles = files.map((file, index) => ({
      path: file.path,
      length: file.length,
      offset:
        file.offset ??
        files.slice(0, index).reduce((offset, previous) => offset + previous.length, 0),
    }));
    const videoOffset = recoveredFiles.find(file => file.path === video.path)?.offset ?? 0;
    return {
      storeName: `${parsed.name} - ${source.hash.slice(0, 8)}`,
      filenameSalt: `download-${source.hash}`,
      pieceLength: parsed.pieceLength,
      files: recoveredFiles,
      video: { name: video.name, path: video.path, offset: videoOffset, length: video.length },
    };
  }

  /** Estimate pack storage from selected files plus two boundary pieces per file. */
  private async getSelectedFilesReservation(
    source: MovieSource,
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
   * prefix of the largest video file that covers the byte target, capped at the file end.
   * A source already retained as watched keeps the full video selected.
   *
   * @param speculativeExpiresAt Expiry for speculative retention, or null for no supplied expiry.
   * @returns Inclusive piece indices and their actual byte length, which can exceed the target.
   * @throws Propagates download failures; rejects with TypeError if no video file is found.
   */
  async warmSource(
    source: MovieSource,
    targetBytes: number,
    speculativeExpiresAt: Date | null = null,
    videoFilePath?: string
  ): Promise<WarmupResult> {
    const target = Math.max(1, Math.min(Math.floor(targetBytes), source.size || targetBytes));
    const download = await this.startDownload(source, {
      retentionClass: 'speculative',
      reservedBytes: target,
      speculativeExpiresAt,
      videoFilePath,
    });
    if (!download.torrent) {
      const layout = download.layout!;
      const firstPiece = Math.floor(layout.video.offset / layout.pieceLength);
      const lastPiece = Math.floor(
        (layout.video.offset + Math.min(target, layout.video.length) - 1) / layout.pieceLength
      );
      return { sourceId: source.id, targetBytes: target, firstPiece, lastPiece };
    }
    const file = videoFilePath
      ? download.torrent.files.find(candidate => candidate.path === videoFilePath)
      : getVideoFile(download.torrent);
    if (!file)
      throw new ErrorWithStatus('Episode video file is unavailable', 'episode_file_unavailable');
    const pieceLength = download.torrent.pieceLength;
    const fileOffset = Number(file.offset ?? 0);
    const firstPiece = Math.max(0, Math.floor(fileOffset / pieceLength));
    const lastPiece = Math.min(
      this.getTorrentPieceCount(download.torrent) - 1,
      Math.max(
        firstPiece,
        Math.ceil((fileOffset + Math.min(target, file.length)) / pieceLength) - 1
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
    return { sourceId: source.id, targetBytes: selectedTargetBytes, firstPiece, lastPiece };
  }

  async pauseSource(sourceId: number): Promise<boolean> {
    return this.pauseDownload(sourceId);
  }

  /**
   * Return whether every byte in an inclusive, zero-based piece range is verified.
   * Invalid or unavailable ranges return false; storage lookup failures propagate.
   */
  async isRangeVerified(sourceId: number, firstPiece: number, lastPiece: number): Promise<boolean> {
    const progress = await this.getRangeProgress(sourceId, firstPiece, lastPiece);
    return progress.isComplete;
  }

  /**
   * Measure verified bytes and completion percentage (0–100) for an inclusive, zero-based piece range.
   * Invalid ranges or unavailable torrent data return zero counts and an incomplete result.
   * Storage lookup failures propagate.
   */
  async getRangeProgress(
    sourceId: number,
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
    const storage = await this.storageService.getStorageByMovieSource(sourceId);
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
        const targetBytes = this.getVideoRangeByteLength(layout, firstPiece, lastPiece);
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
      ? this.getVideoRangeByteLength(layout, firstPiece, lastPiece)
      : this.getRangeByteLength(torrent, firstPiece, lastPiece);
    if (targetBytes <= 0) {
      return { verifiedBytes: 0, targetBytes: 0, progress: 0, isComplete: false };
    }
    let verifiedBytes = 0;
    for (let piece = firstPiece; piece <= lastPiece; piece += 1) {
      if (torrent.bitfield.get(piece)) {
        verifiedBytes += layout
          ? this.getVideoRangeByteLength(layout, piece, piece)
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

  /** Count only video bytes covered by an inclusive piece range. */
  private getVideoRangeByteLength(
    layout: EncryptedStorageLayout,
    firstPiece: number,
    lastPiece: number
  ): number {
    const pieceLength = Number(layout.pieceLength);
    const videoStart = Number(layout.video?.offset);
    const videoLength = Number(layout.video?.length);
    if (
      !Number.isFinite(pieceLength) ||
      pieceLength <= 0 ||
      !Number.isFinite(videoStart) ||
      videoStart < 0 ||
      !Number.isFinite(videoLength) ||
      videoLength <= 0
    ) {
      return 0;
    }
    const rangeStart = firstPiece * pieceLength;
    const rangeEnd = (lastPiece + 1) * pieceLength;
    const videoEnd = videoStart + videoLength;
    return Math.max(0, Math.min(rangeEnd, videoEnd) - Math.max(rangeStart, videoStart));
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
  async promoteSource(source: MovieSource, videoFilePath?: string): Promise<boolean> {
    const download = await this.startDownload(source, {
      retentionClass: 'watched',
      reservedBytes: source.size,
      videoFilePath,
    });
    if (!download.torrent) {
      await this.storageService.markAsAccessed(source.id);
      return true;
    }
    const file = videoFilePath
      ? download.torrent.files.find(candidate => candidate.path === videoFilePath)
      : getVideoFile(download.torrent);
    if (!file) return false;
    this.warmupSelections.delete(source.id);
    file.select();
    await this.storageService.markAsAccessed(source.id);
    return true;
  }

  /** Download a watchlisted movie in the background while preserving the playback reserve. */
  async predownloadSource(source: MovieSource): Promise<boolean> {
    const download = await this.startDownload(source, {
      retentionClass: 'speculative',
      reservedBytes: source.size,
    });
    if (!download.torrent) return true;
    const torrent = download.torrent;
    await this.storageService.withSourceLock(source.id, async () => {
      this.warmupSelections.delete(source.id);
      getVideoFile(torrent).select();
      if (this.activeStreams <= 0) return;
      if (await this.pauseDownload(source.id)) this.pausedForPlayback.add(source.id);
    });
    return true;
  }

  /** Download only the selected video from a shared TV pack. */
  async predownloadEpisode(source: MovieSource, videoFilePath: string): Promise<boolean> {
    if (await this.isEpisodeFileComplete(source.id, videoFilePath)) return true;
    const download = await this.startDownload(source, {
      retentionClass: 'speculative',
      videoFilePath,
    });
    if (!download.torrent) return true;
    const file = download.torrent.files.find(candidate => candidate.path === videoFilePath);
    if (!file)
      throw new ErrorWithStatus('Episode video file is unavailable', 'episode_file_unavailable');

    await this.storageService.withSourceLock(source.id, async () => {
      this.warmupSelections.delete(source.id);
      file.select(1);
      // In a shared pack, the current file has higher piece priority. A separate
      // torrent waits only until active playback has fully buffered its file.
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

  async isEpisodeFileComplete(movieSourceId: number, videoFilePath: string): Promise<boolean> {
    const storage = await this.storageService.getStorageByMovieSource(movieSourceId);
    if (
      !storage ||
      (!storage.videoCompletedAt && !storage.localOnly) ||
      !storage.selectedFiles?.includes(videoFilePath)
    )
      return false;
    return storage.encryptedLayout
      ? this.isFileCompleteInBitfield(
          storage.encryptedLayout,
          videoFilePath,
          storage.downloadedPieces
        )
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
    { magnetLink, hash, file }: Pick<MovieSource, 'file' | 'hash' | 'magnetLink'>,
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
    source: Pick<MovieSource, 'file' | 'hash' | 'magnetLink'>,
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
  async getDownloadProgress(movieSourceId: number): Promise<DownloadProgress | null> {
    try {
      const storage = await this.storageService.getStorageByMovieSource(movieSourceId);
      if (!storage) {
        return null;
      }

      if (storage.videoCompletedAt || storage.localOnly) {
        const bytes = storage.encryptedLayout?.video.length ?? storage.size;
        return {
          movieSourceId,
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
          movieSourceId,
          progress: storage.videoCompletedAt ? 100 : storage.downloaded / 100, // Convert from basis points
          downloadedBytes: storage.videoCompletedAt
            ? (storage.encryptedLayout?.video.length ?? storage.size)
            : 0,
          totalBytes: storage.encryptedLayout?.video.length ?? storage.size,
          downloadSpeed: 0,
          isComplete: Boolean(storage.videoCompletedAt) || storage.downloaded >= 10000,
        };
      }

      return {
        movieSourceId,
        progress: torrent.progress * 100, // Convert to percentage
        downloadedBytes: torrent.downloaded,
        totalBytes: torrent.length,
        downloadSpeed: torrent.downloadSpeed,
        isComplete: this.getStorageActivity(storage).videoComplete,
      };
    } catch (error) {
      logger.warn(
        'DownloadService',
        `Failed to get download progress for source ${movieSourceId}:`,
        error
      );
      return null;
    }
  }

  /**
   * Pause download for a movie source
   */
  @traced('DownloadService')
  async pauseDownload(movieSourceId: number): Promise<boolean> {
    try {
      const storage = await this.storageService.getStorageByMovieSource(movieSourceId);
      if (!storage) {
        logger.warn('DownloadService', `No storage found for movie source ${movieSourceId}`);
        return false;
      }

      const torrent = this.client.torrents.find(t => t.path === storage.location);
      if (!torrent) {
        logger.warn('DownloadService', `No active torrent found for movie source ${movieSourceId}`);
        return false;
      }

      // Pause by deselecting all files
      if (torrent.files && torrent.files.length > 0) {
        torrent.files.forEach(file => file.deselect());
        // File selection and explicit piece selection are independent in WebTorrent.
        // Clear both so a paused warmup cannot continue downloading its range.
        torrent.deselect(0, Math.max(0, this.getTorrentPieceCount(torrent) - 1));
        logger.info('DownloadService', `Paused download for movie source ${movieSourceId}`);
        return true;
      }

      return false;
    } catch (error) {
      logger.error(
        'DownloadService',
        `Failed to pause download for source ${movieSourceId}:`,
        error
      );
      return false;
    }
  }

  /**
   * Resume download for a movie source
   */
  @traced('DownloadService')
  async resumeDownload(movieSourceId: number): Promise<boolean> {
    try {
      const storage = await this.storageService.getStorageByMovieSource(movieSourceId);
      if (!storage) {
        logger.warn('DownloadService', `No storage found for movie source ${movieSourceId}`);
        return false;
      }

      const torrent = this.client.torrents.find(t => t.path === storage.location);
      if (!torrent) {
        logger.warn('DownloadService', `No active torrent found for movie source ${movieSourceId}`);
        return false;
      }

      const warmup = this.warmupSelections.get(movieSourceId);
      if (warmup) {
        torrent.files?.forEach(file => file.deselect());
        torrent.select(warmup.firstPiece, warmup.lastPiece, 1);
        logger.info('DownloadService', `Resumed warmup for movie source ${movieSourceId}`);
        return true;
      }

      // Resume by selecting files
      if (torrent.files && torrent.files.length > 0) {
        const selectedPaths = storage.selectedFiles?.length ? new Set(storage.selectedFiles) : null;
        torrent.files.forEach(file => {
          if (!selectedPaths || selectedPaths.has(file.path)) file.select(1);
        });
        logger.info('DownloadService', `Resumed download for movie source ${movieSourceId}`);
        return true;
      }

      return false;
    } catch (error) {
      logger.error(
        'DownloadService',
        `Failed to resume download for source ${movieSourceId}:`,
        error
      );
      return false;
    }
  }

  /**
   * Remove/cancel download for a movie source
   */
  @traced('DownloadService')
  async cancelDownload(movieSourceId: number): Promise<boolean> {
    try {
      const storage = await this.storageService.getStorageByMovieSource(movieSourceId);
      if (!storage) {
        logger.warn('DownloadService', `No storage found for movie source ${movieSourceId}`);
        return false;
      }

      // StorageService serializes deletion with lifecycle detachment and removes both the
      // torrent and encrypted files through the registered cleanup handler.
      await this.storageService.removeStorage(movieSourceId);
      this.warmupSelections.delete(movieSourceId);
      this.pausedForPlayback.delete(movieSourceId);
      logger.info(
        'DownloadService',
        `Cancelled download and cleaned up storage for movie source ${movieSourceId}`
      );

      return true;
    } catch (error) {
      logger.error(
        'DownloadService',
        `Failed to cancel download for source ${movieSourceId}:`,
        error
      );
      return false;
    }
  }

  /**
   * Set up bitfield tracking for storage service integration
   */
  private setupBitfieldTracking(
    torrent: Torrent,
    movieSourceId: number,
    layout: EncryptedStorageLayout
  ): void {
    torrent.on('verified', async () => {
      try {
        // Convert BitField to Uint8Array for storage service
        const bitfieldBuffer = torrent.bitfield?.buffer
          ? Buffer.from(torrent.bitfield.buffer)
          : new Uint8Array(0);

        await this.storageService.updateDownloadProgress({
          movieSourceId,
          downloadedPieces: new Uint8Array(bitfieldBuffer),
          totalPieces: this.getTorrentPieceCount(torrent),
          size: torrent.length,
        });
        await this.reconcileAllocationIfDue(movieSourceId);
        await this.maybeMarkVideoComplete(torrent, movieSourceId, layout);
        await this.resumeSpeculativeDownloadsWhenPlaybackReady();
      } catch (error) {
        logger.warn(
          'DownloadService',
          `Failed to update download progress for source ${movieSourceId}:`,
          error
        );
      }
    });

    torrent.on('done', async () => {
      try {
        await this.reconcileAllocationIfDue(movieSourceId, true);
        await this.storageService.markAsAccessed(movieSourceId);
        logger.info('DownloadService', `Download completed for movie source ${movieSourceId}`);
      } catch (error) {
        logger.warn(
          'DownloadService',
          `Failed to mark download as complete for source ${movieSourceId}:`,
          error
        );
      }
    });

    void this.maybeMarkVideoComplete(torrent, movieSourceId, layout).catch(error => {
      logger.warn(
        'DownloadService',
        `Failed to record video completion for source ${movieSourceId}`,
        error
      );
    });
  }

  private async reconcileAllocationIfDue(movieSourceId: number, force = false): Promise<void> {
    const inFlight = this.allocationReconcileInFlight.get(movieSourceId);
    if (inFlight) {
      if (!force) return inFlight;
      await inFlight.catch(() => undefined);
      return this.reconcileAllocationIfDue(movieSourceId, true);
    }
    const now = Date.now();
    if (!force && now - (this.allocationReconcileAt.get(movieSourceId) ?? 0) < 1_000) return;
    const reconcile = this.storageService
      .reconcileAllocation(movieSourceId)
      .then(() => {
        this.allocationReconcileAt.set(movieSourceId, Date.now());
      })
      .finally(() => {
        if (this.allocationReconcileInFlight.get(movieSourceId) === reconcile) {
          this.allocationReconcileInFlight.delete(movieSourceId);
        }
      });
    this.allocationReconcileInFlight.set(movieSourceId, reconcile);
    return reconcile;
  }

  /** Use the same persisted file selection as playback, including detached local media. */
  async getMediaFiles(
    movieSource: MovieSource,
    videoFilePath?: string
  ): Promise<EncryptedStorageLayout> {
    const download = await this.startDownload(movieSource, {
      retentionClass: 'watched',
      reservedBytes: movieSource.size,
      videoFilePath,
    });
    const layout = download.layout ?? download.storage.encryptedLayout;
    if (!layout) throw new Error('Encrypted media layout is unavailable');
    return layout;
  }

  /** Preserve small subtitle companions while the watched torrent is still attached. */
  async prepareSubtitleFiles(
    movieSource: MovieSource,
    paths: string[],
    videoFilePath?: string
  ): Promise<void> {
    if (!paths.length) return;
    const existing = await this.storageService.getStorageByMovieSource(movieSource.id);
    const knownLayout = existing?.encryptedLayout;
    const storedBitfield = existing?.downloadedPieces;
    if (
      existing &&
      knownLayout &&
      paths.every(
        path =>
          existing.selectedFiles?.includes(path) &&
          this.isFileCompleteInBitfield(knownLayout, path, storedBitfield)
      )
    )
      return;
    const download = await this.startDownload(movieSource, {
      retentionClass: 'watched',
      reservedBytes: movieSource.size,
      videoFilePath,
      forceAttach: true,
    });
    const subtitles = (download.torrent?.files ?? []).filter(
      file =>
        paths.includes(file.path) &&
        file.length <= 2 * 1024 * 1024 &&
        /\.(srt|vtt|ass|ssa)$/i.test(file.path)
    );
    if (!subtitles.length || !download.torrent) return;
    const current = await this.storageService.getStorageByMovieSource(movieSource.id);
    const layout = download.layout ?? download.storage.encryptedLayout;
    const selected = new Set([
      ...(current?.selectedFiles ?? []),
      ...subtitles.map(file => file.path),
    ]);
    const reservation = layout
      ? await this.getSelectedFilesReservation(movieSource, [...selected], layout)
      : { bytes: movieSource.size, known: false };
    if (reservation.known)
      await this.storageService.reserveStorage(movieSource.id, reservation.bytes);
    const seedTimer = this.seedTimers.get(movieSource.id);
    if (seedTimer) clearTimeout(seedTimer);
    this.seedTimers.delete(movieSource.id);
    for (const file of subtitles) {
      file.select();
      await this.storageService.selectTorrentFile(
        movieSource.id,
        file.path,
        Boolean(
          layout &&
            this.isFileCompleteInBitfield(
              layout,
              file.path,
              download.torrent.bitfield?.buffer ?? download.storage.downloadedPieces
            )
        )
      );
    }
    if (layout) await this.maybeMarkVideoComplete(download.torrent, movieSource.id, layout);
  }

  /**
   * Stream a file from a torrent with range request support
   * Based on WebTorrent server implementation
   */
  @traced('DownloadService')
  async streamFile(
    movieSource: MovieSource,
    rangeHeader?: string,
    torrentFilePath?: string
  ): Promise<Response> {
    return new Promise((resolve, reject) => {
      const handleRequest = async () => {
        const download = await this.startDownload(movieSource, {
          retentionClass: 'watched',
          reservedBytes: movieSource.size,
          videoFilePath: torrentFilePath,
        });
        const { torrent, storage } = download;
        const layout = download.layout ?? storage.encryptedLayout;
        if (!layout)
          throw new ErrorWithStatus(
            'Encrypted media layout is unavailable',
            'local_media_unavailable'
          );
        const selected = torrentFilePath
          ? layout.files.find(file => file.path === torrentFilePath)
          : layout.video;
        if (!selected) throw new Error('Requested torrent file is unavailable');
        const file = { ...selected, name: torrentFilePath ?? layout.video.name };
        const reader = new EncryptedFileReader(
          storage.location,
          layout,
          this.config.getOrThrow('SOURCE_SECURITY_KEY')
        );
        await this.storageService.withSourceLock(movieSource.id, async () => {
          if (!(await this.storageService.setPlaybackActive(movieSource.id, true))) {
            throw new Error(`Storage not found for movie source ${movieSource.id}`);
          }
          torrent?.files.find(item => item.path === file.path)?.select(10);
          this.activeStreams += 1;
          this.activeSourceCounts.set(
            movieSource.id,
            (this.activeSourceCounts.get(movieSource.id) ?? 0) + 1
          );
          this.changeActiveFileCount(movieSource.id, file.path, 1);
          if (this.activeStreams === 1) {
            try {
              await this.pauseSpeculativeDownloads(movieSource.id);
            } catch (error) {
              // Undo admission before propagating startup failure. The stream has
              // no release callback yet, so leaving these counts set would wedge
              // future playback and prevent another pause sweep.
              this.activeStreams = Math.max(0, this.activeStreams - 1);
              const remaining = (this.activeSourceCounts.get(movieSource.id) ?? 1) - 1;
              if (remaining > 0) this.activeSourceCounts.set(movieSource.id, remaining);
              else this.activeSourceCounts.delete(movieSource.id);
              this.changeActiveFileCount(movieSource.id, file.path, -1);
              await this.storageService.setPlaybackActive(movieSource.id, false);
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
          const remaining = (this.activeSourceCounts.get(movieSource.id) ?? 1) - 1;
          if (remaining > 0) this.activeSourceCounts.set(movieSource.id, remaining);
          else this.activeSourceCounts.delete(movieSource.id);
          this.changeActiveFileCount(movieSource.id, file.path, -1);
          releasePromise = this.storageService.withSourceLock(movieSource.id, async () => {
            await this.storageService.setPlaybackActive(movieSource.id, false);
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
        .filter(record => record.movieSourceId !== excludeSourceId && record.activeStreams === 0)
        .map(async record => {
          if (await this.pauseDownload(record.movieSourceId))
            this.pausedForPlayback.add(record.movieSourceId);
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
      const storage = await this.storageService.getStorageByMovieSource(sourceId);
      if (!storage) return true;
      if (storage.videoCompletedAt || storage.localOnly) continue;
      const layout = storage.encryptedLayout;
      if (!layout) return true;
      const torrent = this.client.torrents.find(item => item.path === storage.location);
      const bitfield = torrent?.bitfield?.buffer ?? storage.downloadedPieces;
      const paths = this.activeSourceFiles.get(sourceId);
      if (!paths?.size) return true;
      for (const path of paths.keys()) {
        if (!this.isFileCompleteInBitfield(layout, path, bitfield)) return true;
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
