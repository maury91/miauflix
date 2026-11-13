/**
 * Pure helpers over a source's file layout and piece geometry: how its encrypted store is opened,
 * which files are stored, and how byte ranges map to pieces. No client or storage state.
 */
import { randomBytes } from 'node:crypto';

import parseTorrent from 'parse-torrent';
import type { Torrent } from 'webtorrent';

import EncryptedChunkStore, {
  CURRENT_ENCRYPTION_VERSION,
  type EncryptedStorageOptions,
  type EncryptionVersion,
  randomStoreSalt,
} from '../../chunk-stores/encrypted-chunk-store/encrypted-chunk-store';
import { ErrorWithStatus } from '../../lib/errors';
import type {
  ContentSource,
  EncryptedStorageLayout,
  Storage,
  StorageFile,
} from '../../storage/types';
import { isFileCompleteInBitfield } from '../download.utils';

/**
 * Directory of a new storage under `storageDir`: random, so nothing on disk can be matched to a
 * torrent. It was once hashed from the info hash with `DOWNLOAD_SALT` (public by default), which
 * let anyone holding the disk check for a given torrent. A storage keeps the location recorded
 * when it was created, so older directories stay where they are.
 */
export const randomStorageLocation = (storageDir: string): string =>
  // 16 hex characters, the format storage import accepts
  `${storageDir}/${randomBytes(8).toString('hex')}`;

/** The encrypted store under WebTorrent's cache and immediate-write wrappers, if there is one. */
export const findEncryptedStore = (store: unknown): EncryptedChunkStore | null => {
  for (
    let layer = store;
    layer && typeof layer === 'object';
    layer = (layer as { store?: unknown }).store
  ) {
    if (layer instanceof EncryptedChunkStore) return layer;
  }
  return null;
};

/**
 * The encryption version a source's chunks are (or will be) written with. A saved layout knows;
 * without one, verified pieces predate layouts and so versions (v1), and nothing stored means a
 * fresh start with the current version.
 */
export const storageEncryptionVersion = (
  storage: Pick<Storage, 'downloadedPieces' | 'encryptedLayout'>
): EncryptionVersion => {
  if (storage.encryptedLayout) return storage.encryptedLayout.encryptionVersion ?? 1;
  return storage.downloadedPieces?.some(byte => byte !== 0) ? 1 : CURRENT_ENCRYPTION_VERSION;
};

/**
 * How a source's store is opened: its version and salts. A saved layout keeps them; a version 1
 * store derives its name salt from the source hash; a new version 2 store gets random salts,
 * which reach its layout through the live store (`createEncryptedLayout`).
 */
export const storeEncryptionOptions = (
  storage: Pick<Storage, 'downloadedPieces' | 'encryptedLayout'>,
  sourceHash: string
): Pick<EncryptedStorageOptions, 'contentSalt' | 'encryptionVersion' | 'filenameSalt'> => {
  const version = storageEncryptionVersion(storage);
  if (version === 1) return { encryptionVersion: 1, filenameSalt: `download-${sourceHash}` };
  const layout = storage.encryptedLayout;
  if (layout) {
    if (!layout.contentSalt) throw new Error('Encrypted layout is missing its content salt');
    return {
      encryptionVersion: version,
      filenameSalt: layout.filenameSalt,
      contentSalt: layout.contentSalt,
    };
  }
  return {
    encryptionVersion: version,
    filenameSalt: randomStoreSalt(),
    contentSalt: randomStoreSalt(),
  };
};

/** The layout of an attached torrent, with the salts its live store was opened with. */
export const createEncryptedLayout = (
  torrent: Torrent,
  sourceHash = torrent.infoHash
): EncryptedStorageLayout => {
  // The live store knows how its chunks are encrypted; v1 is left implicit (absent means 1).
  const store = findEncryptedStore((torrent as unknown as { store?: unknown }).store);
  const v2 = store && store.encryptionVersion !== 1 ? store : null;
  return {
    ...(v2 ? { encryptionVersion: v2.encryptionVersion, contentSalt: v2.contentSalt } : {}),
    storeName: `${torrent.name} - ${torrent.infoHash.slice(0, 8)}`,
    // Version 1 stores were opened with the provider's source hash. Keep that exact value
    // because filename derivation is case-sensitive. Version 2 salts are random.
    filenameSalt: v2?.filenameSalt ?? `download-${sourceHash}`,
    pieceLength: torrent.pieceLength,
    files: torrent.files.map(file => ({
      path: file.path,
      length: file.length,
      offset: Number(file.offset ?? 0),
    })),
  };
};

/** The layout a source's torrent file describes, without attaching the torrent. */
export const recoverEncryptedLayout = async (
  source: ContentSource
): Promise<EncryptedStorageLayout | null> => {
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
};

export const withSourceFilenameSalt = (
  layout: EncryptedStorageLayout,
  sourceHash: string
): EncryptedStorageLayout => {
  // Only version 1 names derive from the source hash; version 2 salts are random and fixed.
  if ((layout.encryptionVersion ?? 1) !== 1) return layout;
  const filenameSalt = `download-${sourceHash}`;
  return layout.filenameSalt === filenameSalt ? layout : { ...layout, filenameSalt };
};

/** A file is stored when its pieces are verified or it was recorded complete. */
export const isFileStored = (
  storage: Pick<Storage, 'downloadedPieces'>,
  layout: EncryptedStorageLayout,
  filePath: string,
  files: StorageFile[]
): boolean =>
  isFileCompleteInBitfield(layout, filePath, storage.downloadedPieces) ||
  Boolean(files.find(file => file.path === filePath)?.completedAt);

export const assertFileInLayout = (layout: EncryptedStorageLayout, filePath: string): void => {
  if (!layout.files.some(file => file.path === filePath))
    throw new ErrorWithStatus(
      'Requested file is not part of this source',
      'source_file_unavailable'
    );
};

/** Logical bytes of the requested files within the source. */
export const getSelectedBytes = (layout: EncryptedStorageLayout, paths: string[]): number =>
  layout.files
    .filter(file => paths.includes(file.path))
    .reduce((total, file) => total + file.length, 0);

/** Smallest piece range covering `bytes` from the start of a file at `offset`. */
export const prefixPieces = (
  offset: number,
  bytes: number,
  pieceLength: number,
  pieceCount: number
): { firstPiece: number; lastPiece: number } => {
  const firstPiece = Math.max(0, Math.floor(offset / pieceLength));
  const lastPiece = Math.min(
    pieceCount - 1,
    Math.max(firstPiece, Math.ceil((offset + Math.max(1, bytes)) / pieceLength) - 1)
  );
  return { firstPiece, lastPiece };
};

export const getTorrentPieceCount = (torrent: Torrent): number => {
  const pieces = torrent.pieces;
  const totalPieces = pieces?.length;
  if (typeof totalPieces !== 'number' || !Number.isInteger(totalPieces) || totalPieces <= 0) {
    throw new ErrorWithStatus(
      'Torrent metadata did not include a valid piece count',
      'invalid_torrent_metadata'
    );
  }
  return totalPieces;
};

/** Return a piece’s byte length, capped at the torrent end, or zero for unusable layout data. */
export const getPieceByteLength = (torrent: Torrent, piece: number): number => {
  const pieceLength = Number(torrent.pieceLength);
  const torrentLength = Number(torrent.length);
  if (!Number.isFinite(pieceLength) || pieceLength <= 0 || !Number.isFinite(torrentLength)) {
    return 0;
  }
  const start = piece * pieceLength;
  return Math.max(0, Math.min(pieceLength, torrentLength - start));
};

/** Count only the named file's bytes covered by an inclusive piece range. */
export const getFileRangeByteLength = (
  layout: EncryptedStorageLayout,
  filePath: string,
  firstPiece: number,
  lastPiece: number
): number => {
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
};

/** Sum byte lengths across an inclusive, zero-based piece range, including a short final piece. */
export const getRangeByteLength = (
  torrent: Torrent,
  firstPiece: number,
  lastPiece: number
): number => {
  let total = 0;
  for (let piece = firstPiece; piece <= lastPiece; piece += 1) {
    total += getPieceByteLength(torrent, piece);
  }
  return total;
};
