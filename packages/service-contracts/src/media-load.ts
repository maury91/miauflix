import { bytes, call, contract, event } from '@miauflix/contract';

/** Swarm size reported by trackers; each value is the highest any tracker gave. */
export interface SwarmCounts {
  /** Seeders */
  complete: number;
  /** Leechers */
  incomplete: number;
}

export type SwarmStatsError = 'invalid_hash' | 'scrape_timeout' | 'scrape_unavailable';

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
  | 'unknown_source';

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
export const mediaLoad = contract('media-load', '1.0', {
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
