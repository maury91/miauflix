import type {
  ClaimKind,
  EncryptedStorageLayout,
  PlaybackMatchKind,
} from '@miauflix/service-contracts';

export type { ClaimKind, EncryptedStorageLayout };

/** A source as the backend described it (`putSource`); the engine fetches it by hash. */
export interface ContentSource {
  id: number;
  hash: string;
  magnetLink: string;
  size: number;
  file?: Buffer;
}

/** One stored source: what is downloaded, where, and what it is charged. */
export interface Storage {
  id: number;
  sourceId: number;
  /** The source, on lookups that join it (`...WithRelation`, completed storage). */
  contentSource?: ContentSource | null;
  downloadedPieces: Uint8Array;
  size: number;
  /** Logical bytes belong to the selected playable file, not physical usage. */
  logicalBytes: number;
  /** Bytes verified from the torrent bitfield. */
  verifiedBytes: number;
  /** Physical filesystem blocks charged to this storage. */
  allocatedBytes: number;
  /** Admission charge while physical allocation has not been measured. */
  reservedBytes: number;
  /** Room for a TV remux being written, charged on top of the rest; 0 when none is. */
  remuxReservedBytes: number;
  totalPieces: number;
  pieceLength: number;
  lastInterestAt: Date | null;
  /**
   * When every currently claimed file became complete; starts the seeding window.
   * Cleared whenever an incomplete file is claimed.
   */
  videoCompletedAt: Date | null;
  localOnly: boolean;
  encryptedLayout: EncryptedStorageLayout | null;
  activeStreams: number;
  /** Progress in hundredths of a percent. */
  downloaded: number;
  location: string;
  lastAccessAt: Date | null;
  lastWriteAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** One file of a stored source, with its own completion state. */
export interface StorageFile {
  id: number;
  storageId: number;
  path: string;
  offset: number;
  length: number;
  /** Set once every piece overlapping the file is verified. */
  completedAt: Date | null;
}

/**
 * A request, by one owner, for one file of a stored source. Live claims decide which files are
 * downloaded and which storage may be evicted; a file stays wanted while any claim on it is live.
 */
export interface StorageFileClaim {
  id: number;
  storageId: number;
  path: string;
  kind: ClaimKind;
  ownerKey: string;
  /** Range claims (warmup) want bytes [rangeStart, rangeEnd) of the file. */
  rangeStart: number;
  /** End of a range claim; null wants the whole file. */
  rangeEnd: number | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClaimInput {
  kind: ClaimKind;
  ownerKey: string;
  /** Start of the wanted range in bytes; defaults to the file start. */
  rangeStart?: number;
  /** End of the wanted range in bytes; null or omitted wants the whole file. */
  rangeEnd?: number | null;
  expiresAt?: Date | null;
}

/** WebTorrent piece priority requested by each claim kind. */
export const CLAIM_PRIORITY: Record<ClaimKind, number> = {
  playback: 10,
  prefetch: 1,
  watched: 1,
  warmup: 1,
  watchlist: 0,
};

/**
 * Eviction protection, lowest first: storage whose strongest live claim ranks at or below an
 * admission's limit may be evicted for it. Playback is never evictable.
 */
export const CLAIM_RANK: Record<ClaimKind, number> = {
  warmup: 1,
  watchlist: 2,
  watched: 3,
  prefetch: 4,
  playback: 5,
};

/** Claims that only prepare content nobody has asked to watch yet. */
export const SPECULATIVE_CLAIMS: readonly ClaimKind[] = ['prefetch', 'warmup', 'watchlist'];

/**
 * One file inside a content source. Every read, warmup, and download names its file through
 * a target, so concurrent viewers of different files in one source never share state.
 */
export interface PlaybackTarget {
  source: ContentSource;
  filePath: string;
  matchKind: PlaybackMatchKind;
  /** Runtime of the file when known (probed); sizes the stream's readahead. */
  durationSeconds?: number;
}

/** The same source, addressing another file (for example a subtitle sidecar). */
export const withFile = (target: PlaybackTarget, filePath: string): PlaybackTarget => ({
  ...target,
  filePath,
});
