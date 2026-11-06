import type IPSet from 'ip-set';
import loadIPSet from 'load-ip-set';

import { logger } from '../lib/logger';

// From https://developer.mozilla.org/en/docs/Web/JavaScript/Reference/Global_Objects/encodeURIComponent
export function encodeRFC5987(str: string) {
  return (
    encodeURIComponent(str)
      // Note that although RFC3986 reserves "!", RFC5987 does not,
      // so we do not need to escape it
      .replace(/['()]/g, escape) // i.e., %27 %28 %29
      .replace(/\*/g, '%2A')
      // The following are not required for percent-encoding per RFC5987,
      // so we can allow for a little better readability over the wire: |`^
      .replace(/%(?:7C|60|5E)/g, unescape)
  );
}

export const getIpSet = async (url: string): Promise<IPSet | null> => {
  return new Promise(resolve => {
    loadIPSet(
      url,
      {
        'user-agent': 'Miauflix/1.0.0',
      },
      (err, ipSet) => {
        if (err) {
          logger.error('DownloadService', 'Error loading IP set:', err);
          return resolve(null);
        }
        resolve(ipSet);
      }
    );
  });
};

/** Tracker announce URLs from a list with one per line (`#` starts a comment). */
export const getTrackers = async (url: string): Promise<string[]> => {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (response.ok) {
      return (await response.text())
        .split('\n')
        .map(line => line.split('#')[0].trim())
        .filter(Boolean);
    }
  } catch (error) {
    logger.error('DownloadService', 'Error fetching trackers:', error);
  }
  return [];
};

/** Read one piece's bit from a BitTorrent bitfield (most significant bit first). */
export const isPieceInBitfield = (
  bitfield: Uint8Array | null | undefined,
  pieceIndex: number
): boolean => {
  const byte = bitfield?.[Math.floor(pieceIndex / 8)] ?? 0;
  return (byte & (1 << (7 - (pieceIndex % 8)))) !== 0;
};

/** True when every piece overlapping the byte range is present in the bitfield. */
export const isByteRangeCompleteInBitfield = (
  pieceLength: number,
  offset: number,
  length: number,
  bitfield: Uint8Array | null | undefined
): boolean => {
  if (length <= 0 || !bitfield?.length || pieceLength <= 0) return false;
  const firstPiece = Math.floor(offset / pieceLength);
  const lastPiece = Math.floor((offset + length - 1) / pieceLength);
  for (let piece = firstPiece; piece <= lastPiece; piece++) {
    if (!isPieceInBitfield(bitfield, piece)) return false;
  }
  return true;
};

/** True when the named file exists in the layout and all of its pieces are verified. */
export const isFileCompleteInBitfield = (
  layout: { pieceLength: number; files: ReadonlyArray<LayoutFile> },
  path: string,
  bitfield: Uint8Array | null | undefined
): boolean => {
  const file = layout.files.find(candidate => candidate.path === path);
  return file
    ? isByteRangeCompleteInBitfield(layout.pieceLength, file.offset, file.length, bitfield)
    : false;
};

interface LayoutFile {
  path: string;
  offset: number;
  length: number;
}

/** Inclusive piece indices overlapping a byte range, or null for an empty range. */
export const pieceRangeOf = (
  pieceLength: number,
  offset: number,
  length: number
): { first: number; last: number } | null =>
  length <= 0 || pieceLength <= 0
    ? null
    : {
        first: Math.floor(offset / pieceLength),
        last: Math.floor((offset + length - 1) / pieceLength),
      };

/** A copy of the bitfield with every piece in the inclusive ranges cleared. */
export const clearPiecesInBitfield = (
  bitfield: Uint8Array,
  ranges: ReadonlyArray<{ first: number; last: number }>
): Uint8Array => {
  const next = new Uint8Array(bitfield);
  for (const { first, last } of ranges) {
    for (let piece = first; piece <= last; piece++) {
      const index = Math.floor(piece / 8);
      if (index < next.length) next[index] &= ~(1 << (7 - (piece % 8)));
    }
  }
  return next;
};
export const getContentType = (filename: string): string => {
  const ext = filename.toLowerCase().split('.').pop();

  switch (ext) {
    case 'mp4':
      return 'video/mp4';
    case 'mkv':
      return 'video/x-matroska';
    case 'avi':
      return 'video/x-msvideo';
    case 'mov':
      return 'video/quicktime';
    case 'wmv':
      return 'video/x-ms-wmv';
    case 'flv':
      return 'video/x-flv';
    case 'webm':
      return 'video/webm';
    case 'm4v':
      return 'video/x-m4v';
    default:
      return 'video/mp4'; // Default to mp4
  }
};

export const parseRangeHeader = (
  fileSize: number,
  rangeHeader: string
): { start: number; end: number } | null => {
  const ranges = rangeHeader.replace(/bytes=/, '').split(',');
  const result: { start: number; end: number }[] = [];

  for (const range of ranges) {
    const [startStr, endStr] = range.split('-');

    let start = parseInt(startStr, 10);
    let end = parseInt(endStr, 10);

    if (isNaN(start) && !isNaN(end)) {
      // Suffix-byte-range-spec
      start = fileSize - end;
      end = fileSize - 1;
    } else if (!isNaN(start) && isNaN(end)) {
      // Byte-range-spec without end
      end = fileSize - 1;
    } else if (!isNaN(start) && !isNaN(end)) {
      // Complete byte-range-spec
      if (start > end || start < 0 || end >= fileSize) {
        return null; // Invalid range
      }
    } else {
      return null; // Invalid range
    }

    if (start < 0) start = 0;
    if (end >= fileSize) end = fileSize - 1;

    result.push({ start, end });
  }

  return result.length > 0 ? result[0] : null;
};
