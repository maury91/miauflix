import { bytes, call, contract, event } from '@miauflix/contract';

/** Swarm size reported by trackers; each value is the highest any tracker gave. */
export interface SwarmCounts {
  /** Seeders */
  complete: number;
  /** Leechers */
  incomplete: number;
}

/** `vpn_required`: the service's VPN check is on and its connection is not protected. */
export type SwarmStatsError =
  | 'invalid_hash'
  | 'scrape_timeout'
  | 'scrape_unavailable'
  | 'vpn_required';

/**
 * Engine failures, as the backend's `ErrorWithStatus` codes. `unknown_source` means the service
 * has no descriptor for the source (the host sends it with `putSource` and retries).
 */
export type MediaLoadError =
  | 'add_error'
  | 'add_torrent_timeout'
  | 'added_but_no_file'
  | 'greedy_download_failed'
  | 'invalid_torrent_metadata'
  | 'local_media_incomplete'
  | 'local_media_unavailable'
  | 'source_file_unavailable'
  | 'timeout'
  | 'torrent_closed'
  | 'torrent_not_ready'
  | 'unknown_source'
  | 'vpn_required';

/** What the engine needs to fetch a source. Encrypted at rest by the service. */
export interface SourceDescriptor {
  id: number;
  hash: string;
  magnetLink: string;
  /** Total bytes the provider reported; 0 when unknown. */
  size: number;
  /** The `.torrent` file, base64, when the backend has it. */
  file?: string;
}

/** How a target file was chosen inside its source. */
export type PlaybackMatchKind = 'combined' | 'movie' | 'single';

/** One file inside a source, as the backend's `PlaybackTarget` with the source by id. */
export interface TargetRef {
  sourceId: number;
  filePath: string;
  matchKind: PlaybackMatchKind;
  /** Runtime of the file when known (probed); sizes the stream's readahead. */
  durationSeconds?: number;
}

/** Why a file of a stored source is wanted. */
export type ClaimKind = 'playback' | 'prefetch' | 'warmup' | 'watched' | 'watchlist';

/** One owner's request for a file. */
export interface ClaimRequest {
  kind: ClaimKind;
  ownerKey: string;
  /** Start of the wanted range in bytes; defaults to the file start. */
  rangeStart?: number;
  /** End of the wanted range in bytes; omitted wants the whole file. */
  rangeEnd?: number;
  /** Lifetime override; defaults to the kind's lifetime, null never expires. */
  ttlMs?: number | null;
}

/** A source's file table and how its encrypted files are named. */
export interface EncryptedStorageLayout {
  storeName: string;
  filenameSalt: string;
  pieceLength: number;
  files: Array<{ path: string; length: number; offset: number }>;
  /** How the stored chunks are encrypted; absent means 1, the scheme before versions existed. */
  encryptionVersion?: 1 | 2;
  /**
   * Version 2: the random value the content key is derived from (`filenameSalt` is random too).
   * Without both, the files cannot be read: they exist only here.
   */
  contentSalt?: string;
}

/** A source's state as its viewers experience it, for judging the swarm. */
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

export interface WarmupResult {
  sourceId: number;
  filePath: string;
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

/** Download state of one stored source. */
export interface StorageState {
  sourceId: number;
  verifiedBytes: number;
  allocatedBytes: number;
  /** Progress in hundredths of a percent (10000 = complete). */
  downloaded: number;
  videoComplete: boolean;
  localOnly: boolean;
}

/** Transfer of one stored source: the last 5-second averages and the lifetime totals. */
export interface TransferState {
  /** Bytes per second received, averaged over the last 5 seconds (0 when not loaded). */
  downloadSpeed: number;
  /** Bytes per second sent, averaged over the last 5 seconds (0 when not loaded). */
  uploadSpeed: number;
  /** Connected peers, averaged over the last 5 seconds (0 when not loaded). */
  peers: number;
  /** Bytes received from peers over the source's lifetime (wasted and duplicate included). */
  totalDownloaded: number;
  /** Bytes sent to peers over the source's lifetime. */
  totalUploaded: number;
}

/** One 5-second transfer sample of a source. Samples where nothing moved and no peer was connected are not stored. */
export interface TransferSample {
  /** End of the 5-second window, epoch milliseconds. */
  at: number;
  downloadSpeed: number;
  uploadSpeed: number;
  peers: number;
}

/**
 * Which pieces of a source are verified. Either `added` (pieces verified since the previous
 * update, when that is the smaller message) or `bitfield` (the whole bitfield, base64, most
 * significant bit first, as BitTorrent's). A whole bitfield also follows pieces being lost
 * (reclaims) and the storage being removed (`totalPieces` 0, empty bitfield).
 */
export interface PiecesUpdate {
  sourceId: number;
  totalPieces: number;
  added?: number[];
  bitfield?: string;
}

export interface StorageBitfield {
  sourceId: number;
  totalPieces: number;
  /** Base64, most significant bit first. */
  bitfield: string;
}

export type StorageActivity = 'active' | 'available_offline' | 'inactive' | 'local_only';

export interface StorageItem {
  sourceId: number;
  requestedFiles: string[];
  allocatedBytes: number;
  reservedBytes: number;
  downloaded: number;
  activeStreams: number;
  activity: StorageActivity;
  videoComplete: boolean;
  torrentLoaded: boolean;
  seedEndsAt: string | null;
  /** Since 1.1. */
  transfer?: TransferState;
}

export interface StorageInventory {
  items: StorageItem[];
  physicalBytes: number | null;
  storageBudgetBytes: number;
  reservedBytes: number;
  chargedBytes: number;
  filesystem: { totalBytes: number; freeBytes: number } | null;
}

export type StorageRemovalResult =
  | { status: 'active_playback' | 'cleanup_failed' | 'not_found' }
  | { status: 'removed'; bytes: number };

type SourceInput = { sourceId: number };
type PieceRangeInput = SourceInput & { filePath: string; firstPiece: number; lastPiece: number };

/**
 * The torrent engine: tracker scrapes, downloads with their claims and priorities, encrypted
 * storage and verified byte ranges. The backend keeps playback sessions, ffmpeg and subtitles,
 * and names sources by id after sending their descriptor once per connection (`putSource`).
 */
/** A storage row recorded by the backend before media-load ran the engine. Dates are ISO strings. */
export interface ImportedStorage {
  downloadedPieces: string;
  size: number;
  logicalBytes: number;
  verifiedBytes: number;
  allocatedBytes: number;
  reservedBytes: number;
  totalPieces: number;
  pieceLength: number;
  lastInterestAt: string | null;
  videoCompletedAt: string | null;
  localOnly: boolean;
  encryptedLayout: EncryptedStorageLayout | null;
  downloaded: number;
  location: string;
  lastAccessAt: string | null;
  lastWriteAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ImportedStorageFile {
  path: string;
  offset: number;
  length: number;
  completedAt: string | null;
}

export interface ImportedClaim {
  path: string;
  kind: ClaimKind;
  ownerKey: string;
  rangeStart: number;
  rangeEnd: number | null;
  expiresAt: string | null;
}

/** One stored source, with what the backend knew about it, imported in one transaction. */
export interface ImportedSource {
  source: SourceDescriptor;
  storage: ImportedStorage;
  files: ImportedStorageFile[];
  claims: ImportedClaim[];
}

/** A sealed import or a location outside the service's downloads directories. */
export type StorageImportError = 'import_closed' | 'invalid_storage_location';

export const mediaLoad = contract('media-load', '1.1', {
  /**
   * The key that encrypts media and the service's records (the backend's `SOURCE_SECURITY_KEY`).
   * The host sends it on every connection, before the configuration; engine calls wait for it.
   */
  attach: call<{ securityKey: string }, void>({ ungated: true }),

  /**
   * Seeders and leechers for a v1 (40-hex) or v2 (64-hex) info hash. Requests within a short
   * window share one multi-hash scrape per tracker, and results are reused for a minute.
   */
  swarmStats: call<{ hash: string }, SwarmCounts, SwarmStatsError>({ dedupe: true }),

  /** Store or refresh a source descriptor; later calls name the source by id. */
  putSource: call<{ source: SourceDescriptor }, void>(),
  /** Fetch a source's `.torrent` file from the swarm (base64). */
  sourceMetadataFile: call<
    { link: string; hash: string; timeoutMs: number },
    { file: string },
    MediaLoadError
  >({ dedupe: true }),

  /** Start or keep downloading a target for a background claim. */
  predownload: call<{ target: TargetRef; claim: ClaimRequest }, boolean, MediaLoadError>(),
  isFileComplete: call<{ sourceId: number; filePath: string }, boolean>(),
  /** The source's file table, from storage, the torrent file, or the swarm. */
  resolveLayout: call<SourceInput, EncryptedStorageLayout, MediaLoadError>(),
  /** The file table of a target's source, attaching the torrent if needed. */
  mediaFiles: call<{ target: TargetRef }, EncryptedStorageLayout, MediaLoadError>(),
  /** Download subtitle sidecars beside a target, kept as long as the target. */
  prepareSubtitleFiles: call<{ target: TargetRef; paths: string[] }, void, MediaLoadError>(),
  playbackHealth: call<SourceInput & { filePath?: string }, PlaybackHealth | null>(),
  releaseClaims: call<SourceInput & { ownerKey: string; kind?: ClaimKind }, void>(),

  warmSource: call<
    { target: TargetRef; targetBytes: number; leaseKey: string; startFraction?: number },
    WarmupResult,
    MediaLoadError
  >(),
  pauseSource: call<SourceInput, boolean>(),
  promoteSource: call<{ target: TargetRef; ownerKey: string }, boolean, MediaLoadError>(),
  isRangeVerified: call<PieceRangeInput, boolean>(),
  rangeProgress: call<PieceRangeInput, WarmupRangeProgress>(),

  /** Sources with an open stream; `playbackChanged` reports every change after this. */
  playbackActivity: call<void, { activeSourceIds: number[] }>(),
  playbackChanged: event<{ activeSourceIds: number[] }>(),
  /** A source's file table became known for the first time. */
  layoutKnown: event<{ sourceId: number; layout: EncryptedStorageLayout }>(),

  storageStates: call<{ sourceIds: number[] }, StorageState[]>(),
  storageInventory: call<void, StorageInventory>(),
  removeStorage: call<SourceInput, StorageRemovalResult>(),

  /** The verified pieces of stored sources; `piecesChanged` reports every change after this. */
  storageBitfields: call<{ sourceIds: number[] }, StorageBitfield[]>({ since: 1 }),
  /** Verified pieces changed (batched, at most once a second per source); filter by `sourceIds`. */
  piecesChanged: event<PiecesUpdate, { sourceIds?: number[] }>({ since: 1 }),
  /** A source's 5-second transfer samples of the last day, oldest first, after `since` (epoch ms). */
  transferHistory: call<SourceInput & { since?: number }, TransferSample[]>({ since: 1 }),

  /**
   * The one-time handoff of the storage the backend recorded before media-load ran the engine.
   * `importStatus` distinguishes a finished import from one sealed for adoption.
   * `importStorage` adds sources (each in one
   * transaction, skipping a source the service already stores, so a retried batch is safe);
   * `completeImport` closes it and makes the engine adopt the imported downloads.
   *
   * Until then the service reports `configuring` and refuses engine calls, so nothing creates
   * storage the import would then skip; these calls are ungated for that window.
   */
  importStatus: call<void, { imported: boolean; sealed?: boolean }>({ ungated: true }),
  importStorage: call<
    { items: ImportedSource[] },
    { imported: number; skipped: number },
    StorageImportError
  >({ ungated: true }),
  completeImport: call<void, { imported: number }>({ ungated: true }),

  /**
   * Verified bytes of a target, honouring `Range`. Playback reads claim the file and count as an
   * open stream; speculative reads (probes) do neither.
   */
  read: bytes<{ target: TargetRef; speculative?: boolean }, MediaLoadError>({
    status: {
      source_file_unavailable: 404,
      unknown_source: 409,
      local_media_unavailable: 410,
      local_media_incomplete: 503,
      torrent_closed: 503,
      torrent_not_ready: 503,
      timeout: 504,
      add_torrent_timeout: 504,
    },
  }),
});
export type MediaLoad = typeof mediaLoad;
