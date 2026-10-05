import { createHash } from 'node:crypto';

import { logger } from '@logger';
import type { ScrapeData } from 'bittorrent-tracker';
import { Client as BTClient } from 'bittorrent-tracker';
import { access, constants, mkdir, rm } from 'fs/promises';
import MemoryChunkStore from 'memory-chunk-store';
import type { Torrent, TorrentOptions, WebTorrentOptions } from 'webtorrent';
import WebTorrent from 'webtorrent';

import type { MovieSource } from '@entities/movie-source.entity';
import type { Storage } from '@entities/storage.entity';
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
  parseRangeHeader,
} from './download.utils';

// Types for greedy streaming
// export type DownloadPriority = 'full' | 'partial';

export interface GreedyDownload {
  movieSourceId: number;
  torrent: Torrent;
  storage: Storage;
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

export interface WarmupRangeProgress {
  verifiedBytes: number;
  targetBytes: number;
  progress: number;
  isComplete: boolean;
}

export class DownloadService {
  public readonly client: WebTorrent;
  private activeStreams = 0;
  private readonly activeSourceCounts = new Map<number, number>();
  private readonly allocationReconcileAt = new Map<number, number>();
  private readonly allocationReconcileInFlight = new Map<number, Promise<void>>();
  private readonly bitfieldTrackedTorrents = new WeakMap<Torrent, Set<number>>();
  private readonly torrentStartPromises = new Map<string, Promise<Torrent>>();
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
    this.client.on('error', (error: Error) => {
      logger.error('DownloadService', 'Error:', error.message, error);
    });
    config.registerService('DOWNLOAD', this);
    void this.init();

    const cleanupStorage = async (storage: Storage, strict: boolean): Promise<void> => {
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
    return new Promise((resolve, reject) => {
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
    });
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
    } = {}
  ): Promise<GreedyDownload> {
    try {
      logger.info('DownloadService', `Starting download for source ${source.id}`);

      // FixMe: Create or get storage
      // If storage already exists use the bitfield for the torrent
      // Create storage record first
      const storage = await this.storageService.createStorage({
        movieSourceId: source.id,
        location: this.generateStoragePath(source.hash),
        size: source.size || 0,
        downloadedPieces: new Uint8Array(0),
        totalPieces: 0,
        retentionClass: options.retentionClass,
        reservedBytes:
          options.reservedBytes ?? (options.retentionClass === 'speculative' ? 0 : source.size),
        speculativeExpiresAt: options.speculativeExpiresAt,
      });

      // Add torrent with priority-specific configuration
      const torrent = await this.addTorrentWithLock(source, storage);
      const totalPieces = this.getTorrentPieceCount(torrent);

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
        torrent.length
      );
      if (options.retentionClass !== 'speculative') {
        await this.storageService.reserveStorage(source.id, torrent.length);
      }
      await this.storageService.reconcileAllocation(source.id);

      // Set up bitfield tracking
      const trackedSourceIds = this.bitfieldTrackedTorrents.get(torrent) ?? new Set<number>();
      if (!trackedSourceIds.has(source.id)) {
        trackedSourceIds.add(source.id);
        this.bitfieldTrackedTorrents.set(torrent, trackedSourceIds);
        this.setupBitfieldTracking(torrent, source.id);
      }

      const greedyDownload: GreedyDownload = {
        movieSourceId: source.id,
        torrent,
        storage,
        startTime: new Date(),
      };

      logger.info(
        'DownloadService',
        `Successfully started greedy download for source ${source.id}`
      );
      return greedyDownload;
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
    speculativeExpiresAt: Date | null = null
  ): Promise<WarmupResult> {
    const target = Math.max(1, Math.min(Math.floor(targetBytes), source.size || targetBytes));
    const download = await this.startDownload(source, {
      retentionClass: 'speculative',
      reservedBytes: target,
      speculativeExpiresAt,
    });
    const file = getVideoFile(download.torrent);
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
      file.select();
    } else {
      file.deselect();
      download.torrent.select(firstPiece, lastPiece, 1);
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
    if (!torrent?.bitfield)
      return { verifiedBytes: 0, targetBytes: 0, progress: 0, isComplete: false };
    const totalPieces = torrent.pieces?.length;
    if (
      !Number.isInteger(totalPieces) ||
      totalPieces <= 0 ||
      firstPiece >= totalPieces ||
      lastPiece >= totalPieces
    ) {
      return { verifiedBytes: 0, targetBytes: 0, progress: 0, isComplete: false };
    }
    const targetBytes = this.getRangeByteLength(torrent, firstPiece, lastPiece);
    if (targetBytes <= 0) {
      return { verifiedBytes: 0, targetBytes: 0, progress: 0, isComplete: false };
    }
    let verifiedBytes = 0;
    for (let piece = firstPiece; piece <= lastPiece; piece += 1) {
      if (torrent.bitfield.get(piece)) verifiedBytes += this.getPieceByteLength(torrent, piece);
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

  /** Sum byte lengths across an inclusive, zero-based piece range, including a short final piece. */
  private getRangeByteLength(torrent: Torrent, firstPiece: number, lastPiece: number): number {
    let total = 0;
    for (let piece = firstPiece; piece <= lastPiece; piece += 1) {
      total += this.getPieceByteLength(torrent, piece);
    }
    return total;
  }

  /** Promote the already-added source; no source ranking or replacement occurs. */
  async promoteSource(source: MovieSource): Promise<boolean> {
    const download = await this.startDownload(source, {
      retentionClass: 'watched',
      reservedBytes: source.size,
    });
    const file = getVideoFile(download.torrent);
    file.select();
    await this.storageService.markAsAccessed(source.id);
    return true;
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

      // Find the associated torrent
      const torrent = this.client.torrents.find(t => t.path === storage.location);
      if (!torrent) {
        return {
          movieSourceId,
          progress: storage.downloaded / 100, // Convert from basis points
          downloadedBytes: 0,
          totalBytes: storage.size,
          downloadSpeed: 0,
          isComplete: storage.downloaded >= 10000,
        };
      }

      return {
        movieSourceId,
        progress: torrent.progress * 100, // Convert to percentage
        downloadedBytes: torrent.downloaded,
        totalBytes: torrent.length,
        downloadSpeed: torrent.downloadSpeed,
        isComplete: torrent.done,
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

      // Resume by selecting files
      if (torrent.files && torrent.files.length > 0) {
        torrent.files.forEach(file => file.select());
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

      const torrent = this.client.torrents.find(t => t.path === storage.location);
      if (torrent) {
        this.client.remove(torrent);
        logger.info('DownloadService', `Removed torrent for movie source ${movieSourceId}`);
      }

      // Remove storage record
      await this.storageService.removeStorage(movieSourceId);
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
  private setupBitfieldTracking(torrent: Torrent, movieSourceId: number): void {
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

  /**
   * Stream a file from a torrent with range request support
   * Based on WebTorrent server implementation
   */
  @traced('DownloadService')
  async streamFile(movieSource: MovieSource, rangeHeader?: string): Promise<Response> {
    return new Promise((resolve, reject) => {
      const handleRequest = async () => {
        const { torrent } = await this.startDownload(movieSource, {
          retentionClass: 'watched',
          reservedBytes: movieSource.size,
        });
        const file = getVideoFile(torrent);
        await this.storageService.withSourceLock(movieSource.id, async () => {
          if (!(await this.storageService.setPlaybackActive(movieSource.id, true))) {
            throw new Error(`Storage not found for movie source ${movieSource.id}`);
          }
          file.select();
          this.activeStreams += 1;
          this.activeSourceCounts.set(
            movieSource.id,
            (this.activeSourceCounts.get(movieSource.id) ?? 0) + 1
          );
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
        if (range) {
          status = 206;
          headers['Content-Range'] = `bytes ${range.start}-${range.end}/${file.length}`;
          headers['Content-Length'] = String(range.end - range.start + 1);
        } else {
          headers['Content-Length'] = String(file.length);
        }

        let iterator: AsyncIterator<Uint8Array> | undefined;
        let iteratorReturned = false;
        let cancelled = false;
        let resolveCancellation!: () => void;
        const cancellation = new Promise<void>(
          resolveCancel => (resolveCancellation = resolveCancel)
        );
        const returnIterator = () => {
          if (iteratorReturned) return;
          iteratorReturned = true;
          void iterator?.return?.().catch(() => undefined);
        };
        let releasePromise: Promise<void> | undefined;
        const release = (): Promise<void> => {
          if (releasePromise) return releasePromise;
          this.activeStreams = Math.max(0, this.activeStreams - 1);
          const remaining = (this.activeSourceCounts.get(movieSource.id) ?? 1) - 1;
          if (remaining > 0) this.activeSourceCounts.set(movieSource.id, remaining);
          else this.activeSourceCounts.delete(movieSource.id);
          releasePromise = this.storageService.withSourceLock(movieSource.id, async () => {
            await this.storageService.setPlaybackActive(movieSource.id, false);
          });
          return releasePromise;
        };

        const webReadableStream = new ReadableStream<Uint8Array>({
          start: async controller => {
            try {
              iterator = file[Symbol.asyncIterator](range || {});

              while (!cancelled) {
                const next = await Promise.race([
                  iterator.next().then(result => ({ type: 'read' as const, result })),
                  cancellation.then(() => ({ type: 'cancel' as const })),
                ]);
                if (next.type === 'cancel' || cancelled) break;
                const { result } = next;

                if (result.done) {
                  controller.close();
                  break;
                }

                // Wait for backpressure to clear if needed
                while (
                  !cancelled &&
                  controller.desiredSize !== null &&
                  controller.desiredSize <= 0
                ) {
                  await Promise.race([
                    new Promise<void>(resolveWait => setTimeout(resolveWait, 10)),
                    cancellation,
                  ]);
                }
                if (cancelled) break;
                controller.enqueue(result.value);
              }
            } catch (error) {
              if (!cancelled) controller.error(error);
            } finally {
              if (cancelled) returnIterator();
              if (!releasePromise) await release();
            }
          },

          async cancel() {
            cancelled = true;
            resolveCancellation();
            returnIterator();
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
}
