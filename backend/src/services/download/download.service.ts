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
import type { StorageFile } from '@entities/storage-file.entity';
import {
  CLAIM_PRIORITY,
  type ClaimKind,
  SPECULATIVE_CLAIMS,
} from '@entities/storage-file-claim.entity';
import type { ConfigService, ServiceInstanceStatus } from '@mytypes/configuration';
import type { ClaimInput } from '@repositories/storage-file.repository';
import type { PlaybackTarget } from '@services/playback/playback-target';
import { withFile } from '@services/playback/playback-target';
import type { RequestService } from '@services/request/request.service';
import { ErrorWithStatus } from '@services/source/services/error-with-status.util';
import type { PieceRange, StorageService } from '@services/storage/storage.service';
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

/** The encrypted store under WebTorrent's cache and immediate-write wrappers, if there is one. */
const findEncryptedStore = (store: unknown): EncryptedChunkStore | null => {
  for (
    let layer = store;
    layer && typeof layer === 'object';
    layer = (layer as { store?: unknown }).store
  ) {
    if (layer instanceof EncryptedChunkStore) return layer;
  }
  return null;
};

const MAX_SIDECAR_BYTES = 2 * 1024 * 1024;
const MATROSKA_TAIL_BYTES = 2 * 1024 * 1024;
/** File start kept with a mid-file warmup: the player reads the header before it seeks. */
const RESUME_HEADER_BYTES = 4 * 1024 * 1024;
/**
 * A resume offset is position / duration × length, which misses on variable-bitrate files, so a
 * resume warmup starts this much earlier.
 */
const RESUME_LEAD_BYTES = 16 * 1024 * 1024;
/** Containers whose index may sit at the end of the file, so warmups also fetch the tail. */
const TAIL_INDEXED_FILE = /\.(mkv|webm|mp4|m4v|mov)$/i;
/** Pieces, from the one a reader is blocked on, that it selects and marks critical. */
const READER_WINDOW_PIECES = 2;
/** Above every claim priority: a reader is waiting on these bytes right now. */
const READER_PRIORITY = 100;
/**
 * Seconds of video a viewer's stream keeps selected ahead of its read position, so the playhead
 * is fetched from every peer before the reader blocks on it, not two pieces at a time.
 */
const READAHEAD_SECONDS = 90;
const READAHEAD_MIN_BYTES = 32 * 1024 * 1024;
const READAHEAD_MAX_BYTES = 512 * 1024 * 1024;
/** Below a blocked reader, above every claim: the bytes the viewer reaches next. */
const READAHEAD_PRIORITY = READER_PRIORITY - 1;
/** Assumed runtime when the caller does not know it, as PlaybackSessionService assumes. */
const DEFAULT_DURATION_SECONDS = { movie: 7_200, episode: 2_700 } as const;

/**
 * Pieces a stream keeps selected from its read position: READAHEAD_SECONDS at the file's average
 * bitrate, clamped so a short or mislabelled file still reads ahead and a huge one cannot select
 * half the disk.
 */
export const readaheadPieceCount = (
  fileLength: number,
  durationSeconds: number,
  pieceLength: number
): number => {
  const bytes = Math.min(
    READAHEAD_MAX_BYTES,
    Math.max(READAHEAD_MIN_BYTES, (fileLength / durationSeconds) * READAHEAD_SECONDS)
  );
  return Math.max(READER_WINDOW_PIECES, Math.ceil(bytes / pieceLength));
};
/**
 * Pieces WebTorrent keeps decrypted in memory per torrent (its default is 20, i.e. 40-160 MB per
 * torrent with typical piece sizes). Streams read from disk, so this only serves peers.
 */
const TORRENT_STORE_CACHE_SLOTS = 2;
const CLAIM_SWEEP_INTERVAL_MS = 60_000;

/** How long a claim of each kind lasts without renewal; null never expires. */
export const CLAIM_TTL_MS: Record<ClaimKind, number | null> = {
  playback: 2 * 60_000,
  prefetch: 24 * 60 * 60_000,
  warmup: 10 * 60_000,
  watched: null,
  watchlist: 30 * 60_000,
};

/** One owner's request for a file; see StorageFileClaim. */
export interface ClaimRequest {
  kind: ClaimKind;
  ownerKey: string;
  /** Start of the wanted range in bytes; defaults to the file start. */
  rangeStart?: number;
  /** End of the wanted range in bytes; omitted wants the whole file. */
  rangeEnd?: number;
  /** Lifetime override; defaults to CLAIM_TTL_MS, null never expires. */
  ttlMs?: number | null;
}

/** Reads keep their file wanted for a short while; every range request renews it. */
const PLAYBACK_CLAIM: ClaimRequest = { kind: 'playback', ownerKey: 'stream' };
const SIDECAR_SUBTITLE = /\.(srt|vtt|ass|ssa)$/i;

/** WebTorrent's stream selections (what its own file streams use), missing from its typings. */
type StreamSelectingTorrent = Torrent & {
  _select(
    start: number,
    end: number,
    priority: number,
    notify: (() => void) | undefined,
    isStreamSelection: true
  ): void;
  _deselect(start: number, end: number, isStreamSelection: true): void;
};

/** A source's state as its viewers experience it; see DownloadService.getPlaybackHealth. */
export interface PlaybackHealth {
  streaming: boolean;
  local: boolean;
  hasMetadata: boolean;
  peers: number;
  downloadSpeed: number;
  blockedSince: number | null;
  lastDeliveryAt: number | null;
  fileLength: number | null;
  /** Where in the file (0–1) viewers last read past the header and index, if they have. */
  readFraction: number | null;
}

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
  /** Playback reads waiting on a piece, by source, with when each started waiting. */
  private readonly blockedReadsBySource = new Map<number, Map<symbol, number>>();
  /** When bytes last reached a viewer, by source. */
  private readonly lastDeliveryAt = new Map<number, number>();
  /** Where viewers last read in the media, as a fraction of the file, by source and file path. */
  private readonly readFraction = new Map<number, Map<string, number>>();
  private readonly activeSourceFiles = new Map<number, Map<string, number>>();
  private readonly allocationReconcileAt = new Map<number, number>();
  private readonly allocationReconcileInFlight = new Map<number, Promise<void>>();
  private readonly bitfieldTrackedTorrents = new WeakMap<Torrent, Set<number>>();
  private readonly torrentStartPromises = new Map<string, Promise<Torrent>>();
  private readonly pausedForPlayback = new Set<number>();
  private readonly seedTimers = new Map<number, NodeJS.Timeout>();
  /** Sources whose selection is held empty (warmup pause or yielding to playback). */
  private readonly pausedSources = new Set<number>();
  private readonly selectionTails = new Map<number, Promise<void>>();
  private readonly claimSweep: NodeJS.Timeout;
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
    this.claimSweep = setInterval(() => void this.sweepExpiredClaims(), CLAIM_SWEEP_INTERVAL_MS);
    this.claimSweep.unref?.();
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
      this.pausedSources.delete(storage.sourceId);
      this.pausedForPlayback.delete(storage.sourceId);
    };

    // StorageService invokes the strict handler before deleting its database
    // row. Keep the event hook for existing observers and unit-level callers.
    this.storageService.registerDeleteHandler(storage => cleanupStorage(storage, true));
    this.storageService.on('delete', storage => cleanupStorage(storage, false));
    this.storageService.registerReclaimHandler({
      reclaim: (storage, paths, pieces) => this.reclaimStoredFiles(storage, paths, pieces),
      reselect: storage => this.reselectAfterReclaim(storage),
    });
  }

  testable = true;
  hasActivePlayback(): boolean {
    return this.activeStreams > 0;
  }

  isPlaybackActive(sourceId: number): boolean {
    return (this.activeSourceCounts.get(sourceId) ?? 0) > 0;
  }

  /**
   * What a viewer of this source experiences right now, for judging the swarm: whether a stream
   * is open, metadata has arrived, peers and speed, since when a playback read has been blocked,
   * and when bytes last reached a viewer. Null when the source has neither storage nor torrent.
   */
  async getPlaybackHealth(sourceId: number, filePath?: string): Promise<PlaybackHealth | null> {
    const storage = await this.storageService.getStorageBySource(sourceId);
    const torrent = storage
      ? this.client.torrents.find(item => item.path === storage.location)
      : undefined;
    if (!storage && !torrent) return null;
    const blocked = [...(this.blockedReadsBySource.get(sourceId)?.values() ?? [])];
    const layout = storage?.encryptedLayout;
    return {
      streaming: this.isPlaybackActive(sourceId),
      local: Boolean(storage?.localOnly),
      hasMetadata: Boolean(layout || torrent?.ready),
      peers: torrent?.numPeers ?? 0,
      downloadSpeed: torrent?.downloadSpeed ?? 0,
      blockedSince: blocked.length ? Math.min(...blocked) : null,
      lastDeliveryAt: this.lastDeliveryAt.get(sourceId) ?? null,
      fileLength: (filePath && layout?.files.find(file => file.path === filePath)?.length) || null,
      readFraction: (filePath ? this.readFraction.get(sourceId)?.get(filePath) : undefined) ?? null,
    };
  }

  private blockedReads(sourceId: number): Map<symbol, number> {
    let reads = this.blockedReadsBySource.get(sourceId);
    if (!reads) {
      reads = new Map();
      this.blockedReadsBySource.set(sourceId, reads);
    }
    return reads;
  }

  getStorageActivity(
    storage: Pick<Storage, 'localOnly' | 'location' | 'videoCompletedAt'> & {
      contentSource?: { hash: string } | null;
    }
  ): StorageActivitySnapshot {
    const sourceHash = storage.contentSource?.hash;
    const torrent = this.client.torrents.find(item =>
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
        // Nothing is streaming yet; playback claims from a previous run are stale.
        await this.storageService.deleteClaims({ kind: 'playback' });
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
    clearInterval(this.claimSweep);
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

  /**
   * Mark files complete as their pieces verify, then the source once every claimed file is,
   * which starts its seeding window.
   */
  private async recordCompletion(
    torrent: Torrent,
    sourceId: number,
    layout: EncryptedStorageLayout
  ): Promise<void> {
    const bitfield = torrent.bitfield?.buffer;
    const files = await this.storageService.getFiles(sourceId);
    const newlyComplete = files
      .filter(file => !file.completedAt && isFileCompleteInBitfield(layout, file.path, bitfield))
      .map(file => file.path);
    await this.storageService.markFilesComplete(sourceId, newlyComplete);
    const complete = new Set([
      ...files.filter(file => file.completedAt).map(file => file.path),
      ...newlyComplete,
    ]);
    // A claim on a path the source does not contain can never complete; it must not block others.
    const claimed = (await this.storageService.getClaimedPaths(sourceId)).filter(path =>
      layout.files.some(file => file.path === path)
    );
    if (!claimed.length || !claimed.every(path => complete.has(path))) return;
    const storage = await this.storageService.markVideoComplete(sourceId, layout);
    if (storage) this.scheduleSeedExpiry(storage);
  }

  private claimInput(claim: ClaimRequest): ClaimInput {
    const ttlMs = claim.ttlMs === undefined ? CLAIM_TTL_MS[claim.kind] : claim.ttlMs;
    return {
      kind: claim.kind,
      ownerKey: claim.ownerKey,
      rangeStart: claim.rangeStart ?? 0,
      rangeEnd: claim.rangeEnd ?? null,
      expiresAt: ttlMs === null ? null : new Date(Date.now() + ttlMs),
    };
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
  private reconcileSelection(sourceId: number): Promise<void> {
    return this.serializeSelection(sourceId, async () => {
      const storage = await this.storageService.getStorageBySource(sourceId);
      const torrent = storage && this.client.torrents.find(item => item.path === storage.location);
      if (!torrent?.files?.length) return;
      this.clearSelection(torrent);
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
      const pieceCount = this.getTorrentPieceCount(torrent);
      for (const [path, want] of wanted) {
        const file = torrent.files.find(candidate => candidate.path === path);
        if (!file) continue;
        if (want.whole) {
          file.select(want.priority);
          continue;
        }
        for (const [rangeStart, rangeEnd] of want.ranges) {
          const start = Math.min(rangeStart, file.length - 1);
          const { firstPiece, lastPiece } = this.prefixPieces(
            Number(file.offset ?? 0) + start,
            Math.min(rangeEnd, file.length) - start,
            torrent.pieceLength,
            pieceCount
          );
          torrent.select(firstPiece, lastPiece, want.priority);
        }
        if (want.tail) {
          const tailBytes = Math.min(file.length, MATROSKA_TAIL_BYTES);
          const tail = this.prefixPieces(
            Number(file.offset ?? 0) + file.length - tailBytes,
            tailBytes,
            torrent.pieceLength,
            pieceCount
          );
          torrent.select(tail.firstPiece, tail.lastPiece, want.priority);
        }
      }
    });
  }

  /** File and piece selections are independent in WebTorrent; clear both. */
  private clearSelection(torrent: Torrent): void {
    torrent.files?.forEach(file => file.deselect());
    const pieceCount = torrent.pieces?.length ?? 0;
    if (pieceCount > 0) torrent.deselect?.(0, pieceCount - 1);
  }

  /** Smallest piece range covering `bytes` from the start of a file at `offset`. */
  private prefixPieces(
    offset: number,
    bytes: number,
    pieceLength: number,
    pieceCount: number
  ): { firstPiece: number; lastPiece: number } {
    const firstPiece = Math.max(0, Math.floor(offset / pieceLength));
    const lastPiece = Math.min(
      pieceCount - 1,
      Math.max(firstPiece, Math.ceil((offset + Math.max(1, bytes)) / pieceLength) - 1)
    );
    return { firstPiece, lastPiece };
  }

  /** Re-apply selection after claims changed outside a download request, then check completion. */
  private async refreshClaims(sourceId: number): Promise<void> {
    await this.reconcileSelection(sourceId);
    const storage = await this.storageService.getStorageBySource(sourceId);
    const torrent = storage && this.client.torrents.find(item => item.path === storage.location);
    if (torrent?.ready && storage?.encryptedLayout)
      await this.recordCompletion(torrent, sourceId, storage.encryptedLayout);
  }

  /** Drop expired claims and stop downloading what nobody wants any more. */
  async sweepExpiredClaims(): Promise<void> {
    try {
      await this.renewActivePlaybackClaims();
      const sourceIds = await this.storageService.deleteClaims({ expiredAt: new Date() });
      for (const sourceId of sourceIds) await this.refreshClaims(sourceId);
    } catch (error) {
      logger.warn('DownloadService', 'Failed to sweep expired storage claims', error);
    }
  }

  /**
   * A stream claims its file once, when it starts. Renew the claim of every file still being
   * read (sweeps run well inside the claim lifetime) so a long playback is not deselected.
   */
  private async renewActivePlaybackClaims(): Promise<void> {
    for (const [sourceId, paths] of this.activeSourceFiles) {
      for (const path of paths.keys()) {
        try {
          await this.storageService.claimFile(
            sourceId,
            path,
            this.claimInput(PLAYBACK_CLAIM),
            true
          );
        } catch (error) {
          logger.warn('DownloadService', 'Failed to renew playback claim', sourceId, error);
        }
      }
    }
  }

  /** Withdraw one owner's claims on a source (for example a removed watchlist entry). */
  async releaseClaims(sourceId: number, ownerKey: string, kind?: ClaimKind): Promise<void> {
    await this.storageService.releaseClaims(sourceId, { ownerKey, kind });
    await this.refreshClaims(sourceId);
  }

  /**
   * Delete the encrypted files of `paths` and clear every piece overlapping them, boundary pieces
   * shared with a neighbor included, from the attached torrent (WebTorrent forgets the piece and
   * fetches it again if a claimed file still selects it). Runs under the source lock, inside
   * StorageService.reclaimFiles, so it cannot interleave with torrent startup, detach or removal.
   *
   * @returns The attached torrent's bitfield after clearing, or nothing when none is attached.
   */
  private async reclaimStoredFiles(
    storage: Storage,
    paths: string[],
    pieces: PieceRange[]
  ): Promise<Uint8Array | void> {
    const layout = storage.encryptedLayout;
    if (!layout) throw new Error(`Storage ${storage.id} has no file layout to reclaim from`);
    // The claims on these files are already gone; this drops their selections before the data.
    await this.reconcileSelection(storage.sourceId);

    const torrent = this.client.torrents.find(item => item.path === storage.location);
    const live = torrent && !torrent.destroyed && torrent.bitfield ? torrent : null;
    if (live) {
      for (const { first, last } of pieces) {
        for (let piece = first; piece <= last; piece++) {
          if (live.bitfield.get(piece)) this.unverifyPiece(live, piece);
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
        filenameSalt: layout.filenameSalt,
      });
    await store.removeFiles(paths);
    logger.info(
      'DownloadService',
      `Reclaimed ${paths.length} file(s) of source ${storage.sourceId}`
    );
    return live ? new Uint8Array(live.bitfield.buffer) : undefined;
  }

  /** Make WebTorrent treat a verified piece as missing again. */
  private unverifyPiece(torrent: Torrent, index: number): void {
    const internals = torrent as unknown as {
      _markUnverified?: (piece: number) => void;
      _reservations?: unknown[];
    };
    if (internals._markUnverified) internals._markUnverified(index);
    else torrent.bitfield.set(index, false);
    // A verified piece has no reservation list; request bookkeeping needs one to fetch it again.
    if (internals._reservations) internals._reservations[index] = [];
  }

  /**
   * After a reclaim: bring the torrent back if a claimed file lost pieces (a boundary piece
   * shared with a reclaimed neighbor), then reapply selection so those pieces are fetched.
   */
  private async reselectAfterReclaim(storage: Storage): Promise<void> {
    const { sourceId, contentSource: source, encryptedLayout: layout } = storage;
    if (source && layout) {
      const files = await this.storageService.getFiles(sourceId);
      const claimed = (await this.storageService.getClaimedPaths(sourceId)).filter(path =>
        layout.files.some(file => file.path === path)
      );
      const missing = claimed.some(path => !this.isFileStored(storage, layout, path, files));
      const attached = this.client.torrents.some(item => item.path === storage.location);
      if (missing && !attached) {
        await this.storageService.withSourceLock(sourceId, async () => {
          const current = await this.storageService.getStorageBySource(sourceId);
          if (!current) return;
          const timer = this.seedTimers.get(sourceId);
          if (timer) clearTimeout(timer);
          this.seedTimers.delete(sourceId);
          const torrent = await this.addTorrentWithLock(source, current);
          this.trackTorrent(torrent, sourceId, this.createEncryptedLayout(torrent, source.hash));
        });
      }
    }
    await this.reconcileSelection(sourceId);
    const current = await this.storageService.getStorageBySource(sourceId);
    const torrent = current && this.client.torrents.find(item => item.path === current.location);
    if (torrent?.ready && current?.encryptedLayout)
      await this.recordCompletion(torrent, sourceId, current.encryptedLayout);
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
          await this.storageService.recordFiles(current.sourceId, layout);
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
      await this.reconcileSelection(storage.sourceId).catch(error =>
        logger.warn('DownloadService', `Could not reselect source ${storage.sourceId}`, error)
      );
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
    signal: AbortSignal,
    playback = false
  ): Promise<Buffer> {
    const waitStart = Date.now();
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
      // Fetch what this reader needs now, even outside claimed ranges (an index at the end of
      // the file): a stream selection survives selection rebuilds, and critical pieces let
      // faster peers take over slow requests.
      const lastPiece = Math.min(pieceIndex + READER_WINDOW_PIECES - 1, torrent.pieces.length - 1);
      const streamTorrent = torrent as StreamSelectingTorrent;
      streamTorrent._select(pieceIndex, lastPiece, READER_PRIORITY, undefined, true);
      torrent.critical(pieceIndex, lastPiece);
      // A viewer waiting on bytes is what source health judges (see getPlaybackHealth).
      const blocked = Symbol('blocked read');
      if (playback) this.blockedReads(storage.sourceId).set(blocked, waitStart);
      await new Promise<void>((resolve, reject) => {
        const cleanup = () => {
          if (playback) this.blockedReads(storage.sourceId).delete(blocked);
          torrent.removeListener('verified', onVerified);
          torrent.removeListener('close', onClose);
          signal.removeEventListener('abort', onAbort);
          if (!torrent.destroyed) streamTorrent._deselect(pieceIndex, lastPiece, true);
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
    claim: ClaimRequest,
    options: {
      /** Admission charge used only while the source's file list is still unknown. */
      reservedBytes?: number;
    } = {}
  ): Promise<GreedyDownload> {
    const { source, filePath } = target;
    const speculative = SPECULATIVE_CLAIMS.includes(claim.kind);
    try {
      logger.info('DownloadService', `Starting download for source ${source.id}`);

      const existingStorage = await this.storageService.getStorageBySource(source.id);
      // Reject a path the source does not contain before it is claimed, when the files are known.
      const knownLayout =
        existingStorage?.encryptedLayout ??
        (await this.recoverEncryptedLayout(source).catch(() => null));
      if (knownLayout) this.assertFileInLayout(knownLayout, filePath);
      const claimedPaths = await this.storageService.getClaimedPaths(source.id);
      const reservation = await this.getSelectedFilesReservation(
        source,
        [...new Set([...claimedPaths, filePath])],
        existingStorage?.encryptedLayout ?? undefined
      );

      await this.storageService.createStorage({
        sourceId: source.id,
        location: this.generateStoragePath(source.hash),
        size: source.size || 0,
        downloadedPieces: new Uint8Array(0),
        totalPieces: 0,
        speculative,
        reservedBytes: reservation.known
          ? reservation.bytes
          : (options.reservedBytes ?? (speculative ? 0 : source.size)),
        partialReservation: reservation.known,
        claim: { path: filePath, input: this.claimInput(claim) },
      });

      const start = await this.storageService.withSourceLock(source.id, async () => {
        let current = await this.storageService.getStorageBySource(source.id);
        if (!current) {
          throw new ErrorWithStatus('Storage record is unavailable', 'local_media_unavailable');
        }
        const savedLayout = current.encryptedLayout ?? (await this.recoverEncryptedLayout(source));
        if (savedLayout) this.assertFileInLayout(savedLayout, filePath);
        const stored = Boolean(
          savedLayout &&
            this.isFileStored(
              current,
              savedLayout,
              filePath,
              await this.storageService.getFiles(source.id)
            )
        );
        current =
          (await this.storageService.claimFile(
            source.id,
            filePath,
            this.claimInput(claim),
            stored
          )) ?? current;

        // A fully stored file is read from disk; the torrent stays as it is.
        if (stored && savedLayout) {
          const layout = this.withSourceFilenameSalt(savedLayout, source.hash);
          if (layout.filenameSalt !== current.encryptedLayout?.filenameSalt) {
            await this.storageService.updateEncryptedLayout(source.id, layout);
          }
          await this.storageService.recordFiles(source.id, layout);
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

        // Claiming an incomplete file reopened the source; its seed window no longer applies.
        const timer = this.seedTimers.get(source.id);
        if (timer) clearTimeout(timer);
        this.seedTimers.delete(source.id);

        // Serialize torrent startup against expiry detachment and storage deletion.
        const torrent = await this.addTorrentWithLock(source, current);
        const layout = this.createEncryptedLayout(torrent, source.hash);
        if (!layout.files.some(file => file.path === filePath)) {
          // The files were unknown at admission; drop the claim on a path that does not exist.
          await this.storageService.releaseClaims(source.id, {
            kind: claim.kind,
            ownerKey: claim.ownerKey,
            path: filePath,
          });
          this.assertFileInLayout(layout, filePath);
        }
        await this.storageService.updateEncryptedLayout(source.id, layout);
        await this.storageService.recordFiles(source.id, layout);
        const required = await this.getSelectedFilesReservation(
          source,
          await this.storageService.getClaimedPaths(source.id),
          layout
        );
        if (required.known)
          await this.storageService.reserveStorage(source.id, required.bytes, speculative);
        return {
          sourceId: source.id,
          torrent,
          storage: current,
          layout,
          shouldDetach: false,
          startTime: new Date(),
        };
      });

      // An explicit request resumes a paused source; background callers pause again if needed.
      this.pausedSources.delete(source.id);
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
        this.getSelectedBytes(layout, await this.storageService.getClaimedPaths(source.id))
      );
      await this.storageService.reconcileAllocation(source.id);

      // Set up bitfield tracking
      this.trackTorrent(torrent, source.id, layout);
      await this.reconcileSelection(source.id);
      await this.recordCompletion(torrent, source.id, layout);

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

  /** A file is stored when its pieces are verified or it was recorded complete. */
  private isFileStored(
    storage: Pick<Storage, 'downloadedPieces'>,
    layout: EncryptedStorageLayout,
    filePath: string,
    files: StorageFile[]
  ): boolean {
    return (
      isFileCompleteInBitfield(layout, filePath, storage.downloadedPieces) ||
      Boolean(files.find(file => file.path === filePath)?.completedAt)
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
      speculative: true,
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
      await this.storageService.recordFiles(source.id, layout);
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
   * Claim the smallest piece-aligned range of the target file that covers the byte target,
   * capped at the file end, for one warmup lease. The range starts at the file start, or near
   * `startFraction` of the file for a resume (the header is then kept too). A whole-file claim
   * by anyone else on the same file keeps the full file selected.
   *
   * @returns Inclusive piece indices and their actual byte length, which can exceed the target.
   * @throws Propagates download failures, including a target file missing from the source.
   */
  async warmSource(
    target: PlaybackTarget,
    targetBytes: number,
    leaseKey: string,
    startFraction = 0
  ): Promise<WarmupResult> {
    const { source, filePath } = target;
    const requested = Math.max(1, Math.min(Math.floor(targetBytes), source.size || targetBytes));
    const resuming = startFraction > 0 && Number.isFinite(startFraction);
    // A resume claims only the header until the file length places the window.
    const claim: ClaimRequest = {
      kind: 'warmup',
      ownerKey: leaseKey,
      rangeEnd: resuming ? Math.min(requested, RESUME_HEADER_BYTES) : requested,
    };
    const download = await this.startDownload(target, claim, {
      reservedBytes: Math.min(
        source.size || Infinity,
        requested +
          (resuming ? RESUME_HEADER_BYTES : 0) +
          (/\.(mkv|webm)$/i.test(filePath) ? MATROSKA_TAIL_BYTES : 0)
      ),
    });
    const file = download.layout.files.find(candidate => candidate.path === filePath)!;
    const rangeStart = this.resumeRangeStart(file.length, requested, startFraction);
    if (resuming) {
      // Completion was settled by the first claim, so this one must not reopen the source.
      await this.storageService.claimFile(
        source.id,
        filePath,
        this.claimInput({ ...claim, rangeStart, rangeEnd: rangeStart + requested }),
        true
      );
      await this.reconcileSelection(source.id);
    }
    const pieceLength = download.layout.pieceLength;
    const pieceCount = download.torrent
      ? this.getTorrentPieceCount(download.torrent)
      : Math.ceil(
          download.layout.files.reduce((total, item) => total + item.length, 0) / pieceLength
        );
    const { firstPiece, lastPiece } = this.prefixPieces(
      file.offset + rangeStart,
      Math.min(requested, file.length - rangeStart),
      pieceLength,
      pieceCount
    );
    return {
      sourceId: source.id,
      filePath,
      targetBytes: download.torrent
        ? this.getRangeByteLength(download.torrent, firstPiece, lastPiece)
        : requested,
      firstPiece,
      lastPiece,
    };
  }

  /** Start of a resume warmup window: early enough to absorb bitrate variation, within the file. */
  private resumeRangeStart(fileLength: number, bytes: number, startFraction: number): number {
    if (!(startFraction > 0) || !Number.isFinite(startFraction)) return 0;
    const estimate = Math.floor(Math.min(1, startFraction) * fileLength);
    const start = Math.min(estimate - RESUME_LEAD_BYTES, fileLength - bytes);
    // Too close to the start to be worth a separate window: warm the prefix instead.
    return start > RESUME_HEADER_BYTES ? start : 0;
  }

  /** Stop warming a source: its warmup claims are released; other owners' claims continue. */
  async pauseSource(sourceId: number): Promise<boolean> {
    const storage = await this.storageService.getStorageBySource(sourceId);
    if (!storage) return false;
    await this.storageService.releaseClaims(sourceId, { kind: 'warmup' });
    await this.reconcileSelection(sourceId);
    return true;
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

  /** Keep the target file for a viewer; no source ranking or replacement occurs. */
  async promoteSource(target: PlaybackTarget, ownerKey: string): Promise<boolean> {
    await this.startDownload(target, { kind: 'watched', ownerKey });
    await this.storageService.markAsAccessed(target.source.id);
    return true;
  }

  /**
   * Download one file in the background for a claim owner while preserving the playback reserve.
   * Within a shared source the playing file keeps higher piece priority; another source waits
   * only until active playback has fully buffered its file.
   */
  async predownload(target: PlaybackTarget, claim: ClaimRequest): Promise<boolean> {
    const { source } = target;
    const download = await this.startDownload(target, claim);
    if (!download.torrent) return true;
    await this.storageService.withSourceLock(source.id, async () => {
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
    if (!storage?.encryptedLayout) return false;
    return this.isFileStored(
      storage,
      storage.encryptedLayout,
      filePath,
      await this.storageService.getFiles(sourceId)
    );
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
          storeCacheSlots: TORRENT_STORE_CACHE_SLOTS,
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
        ? this.getSelectedBytes(
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

      // Pause by clearing every selection; claims stay and are reapplied on resume.
      if (torrent.files && torrent.files.length > 0) {
        this.pausedSources.add(sourceId);
        this.clearSelection(torrent);
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
      this.pausedSources.delete(sourceId);
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
    // Verifies arrive in bursts; one pending write covers them all. The bitfield is read once the
    // write holds the source lock, so a write queued before a reclaim cannot restore its bits.
    let pendingWrite: Promise<void> | null = null;
    const persistBitfield = (): Promise<void> => {
      if (pendingWrite) return pendingWrite;
      const write = this.storageService.withSourceLock(sourceId, async () => {
        pendingWrite = null;
        const bitfieldBuffer = torrent.bitfield?.buffer
          ? Buffer.from(torrent.bitfield.buffer)
          : new Uint8Array(0);
        await this.storageService.updateDownloadProgress({
          sourceId,
          downloadedPieces: new Uint8Array(bitfieldBuffer),
          totalPieces: this.getTorrentPieceCount(torrent),
          size: torrent.length,
        });
      });
      pendingWrite = write;
      return write;
    };

    torrent.on('verified', async () => {
      try {
        await persistBitfield();
        await this.reconcileAllocationIfDue(sourceId);
        await this.recordCompletion(torrent, sourceId, layout);
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

    void this.recordCompletion(torrent, sourceId, layout).catch(error => {
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

  /** The target's file table; attaches the torrent only when the source's files are unknown. */
  async getMediaFiles(target: PlaybackTarget): Promise<EncryptedStorageLayout> {
    return this.resolveLayout(target.source);
  }

  /**
   * Request small subtitle sidecars of the target video. Sidecars take the video's live claims,
   * so they are kept, downloaded, and evicted together with it.
   */
  async prepareSubtitleFiles(target: PlaybackTarget, paths: string[]): Promise<void> {
    if (!paths.length) return;
    const existing = await this.storageService.getStorageBySource(target.source.id);
    const layout = existing?.encryptedLayout;
    if (!existing || !layout) return;
    const sidecars = paths.filter(path => {
      const file = layout.files.find(candidate => candidate.path === path);
      return file && file.length <= MAX_SIDECAR_BYTES && SIDECAR_SUBTITLE.test(path);
    });
    if (!sidecars.length) return;
    await this.storageService.copyClaims(target.source.id, target.filePath, sidecars);
    const files = await this.storageService.getFiles(target.source.id);
    for (const path of sidecars) {
      if (this.isFileStored(existing, layout, path, files)) continue;
      await this.startDownload(withFile(target, path), PLAYBACK_CLAIM);
    }
  }

  /**
   * Stream a file from a torrent with range request support
   * Based on WebTorrent server implementation
   */
  @traced('DownloadService')
  async streamFile(
    target: PlaybackTarget,
    rangeHeader?: string,
    speculative = false
  ): Promise<Response> {
    const contentSource = target.source;
    return new Promise((resolve, reject) => {
      const handleRequest = async () => {
        // Inspection reads an already-warming source without promoting it to active playback.
        const existing = speculative
          ? await this.storageService.getStorageBySource(contentSource.id)
          : null;
        const download = speculative
          ? existing?.encryptedLayout && {
              storage: existing,
              layout: existing.encryptedLayout,
              torrent: this.client.torrents.find(item => item.path === existing.location) ?? null,
            }
          : await this.startDownload(target, PLAYBACK_CLAIM);
        if (!download) throw new Error('Speculative media source is no longer available');
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
        if (!speculative)
          await this.storageService.withSourceLock(contentSource.id, async () => {
            if (!(await this.storageService.setPlaybackActive(contentSource.id, true))) {
              throw new Error(`Storage not found for movie source ${contentSource.id}`);
            }
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
          if (speculative) return Promise.resolve();
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

        // Viewers keep the next READAHEAD_SECONDS selected; inspection reads only want headers.
        const streamTorrent = torrent as StreamSelectingTorrent | null;
        const readaheadPieces = speculative
          ? 0
          : readaheadPieceCount(
              file.length,
              target.durationSeconds ??
                (target.matchKind === 'movie'
                  ? DEFAULT_DURATION_SECONDS.movie
                  : DEFAULT_DURATION_SECONDS.episode),
              layout.pieceLength
            );
        const fileLastPiece = Math.floor((file.offset + file.length - 1) / layout.pieceLength);
        let readahead: [number, number] | null = null;
        const clearReadahead = () => {
          if (readahead && streamTorrent && !streamTorrent.destroyed)
            streamTorrent._deselect(readahead[0], readahead[1], true);
          readahead = null;
        };
        const moveReadahead = (pieceIndex: number) => {
          if (!readaheadPieces || !streamTorrent || streamTorrent.destroyed) return;
          if (readahead?.[0] === pieceIndex) return;
          clearReadahead();
          readahead = [pieceIndex, Math.min(pieceIndex + readaheadPieces - 1, fileLastPiece)];
          streamTorrent._select(readahead[0], readahead[1], READAHEAD_PRIORITY, undefined, true);
        };
        // Reads are 256 KiB slices of one piece; decrypt each piece once, not once per slice.
        let current: { index: number; piece: Buffer } | null = null;

        const webReadableStream = new ReadableStream<Uint8Array>({
          start: async controller => {
            try {
              let cursor = firstByte;
              while (!cancelled && cursor <= lastByte) {
                // Header and index reads say nothing about where the viewer is.
                if (
                  !speculative &&
                  cursor >= RESUME_HEADER_BYTES &&
                  cursor < file.length - MATROSKA_TAIL_BYTES
                ) {
                  this.setReadFraction(contentSource.id, file.path, cursor / file.length);
                }
                const torrentOffset = file.offset + cursor;
                const pieceIndex = Math.floor(torrentOffset / layout.pieceLength);
                const pieceOffset = torrentOffset % layout.pieceLength;
                if (current?.index !== pieceIndex) {
                  current = null;
                  moveReadahead(pieceIndex);
                  current = {
                    index: pieceIndex,
                    piece: await this.readVerifiedPiece(
                      reader,
                      torrent,
                      storage,
                      pieceIndex,
                      abortController.signal,
                      // Inspection reads are not playback; only viewers count toward source health.
                      !speculative
                    ),
                  };
                }
                const { piece } = current;
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
                if (!speculative) this.lastDeliveryAt.set(contentSource.id, Date.now());
                cursor += bytes.length;
              }
              if (!cancelled) controller.close();
            } catch (error) {
              if (!cancelled) controller.error(error);
            } finally {
              clearReadahead();
              current = null;
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
    const sourceIds = (await this.storageService.getSpeculativeSourceIds()) ?? [];
    await Promise.all(
      sourceIds
        .filter(sourceId => sourceId !== excludeSourceId && !this.isPlaybackActive(sourceId))
        .map(async sourceId => {
          if (await this.pauseDownload(sourceId)) this.pausedForPlayback.add(sourceId);
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
    else {
      paths.delete(path);
      const fractions = this.readFraction.get(sourceId);
      fractions?.delete(path);
      if (fractions && !fractions.size) this.readFraction.delete(sourceId);
    }
    if (paths.size) this.activeSourceFiles.set(sourceId, paths);
    else this.activeSourceFiles.delete(sourceId);
  }

  private setReadFraction(sourceId: number, path: string, fraction: number): void {
    const fractions = this.readFraction.get(sourceId) ?? new Map<string, number>();
    fractions.set(path, fraction);
    this.readFraction.set(sourceId, fractions);
  }
}
