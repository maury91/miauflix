import type { Torrent } from 'webtorrent';

import {
  assertFileInLayout,
  getFileRangeByteLength,
  getRangeByteLength,
  getSelectedBytes,
  getTorrentPieceCount,
  isFileStored,
  prefixPieces,
  withSourceFilenameSalt,
} from '../../../src/engine/download/layout';
import type { EncryptedStorageLayout } from '../../../src/storage/types';

// Two files in 4-byte pieces: a.mkv covers pieces 0-2 (bytes 0-9), b.srt pieces 2-3 (10-13).
const layout: EncryptedStorageLayout = {
  storeName: 'pack - abcdef12',
  filenameSalt: 'download-abc',
  pieceLength: 4,
  files: [
    { path: 'a.mkv', offset: 0, length: 10 },
    { path: 'b.srt', offset: 10, length: 4 },
  ],
};

const torrent = (length: number, pieceLength: number, pieces?: unknown[]) =>
  ({ length, pieceLength, pieces }) as unknown as Torrent;

describe('download layout helpers', () => {
  it('covers a byte span with the smallest piece range, capped at the last piece', () => {
    expect(prefixPieces(0, 4, 4, 10)).toEqual({ firstPiece: 0, lastPiece: 0 });
    expect(prefixPieces(3, 2, 4, 10)).toEqual({ firstPiece: 0, lastPiece: 1 });
    // An empty span still covers the piece it starts in.
    expect(prefixPieces(8, 0, 4, 10)).toEqual({ firstPiece: 2, lastPiece: 2 });
    expect(prefixPieces(0, 1_000, 4, 3)).toEqual({ firstPiece: 0, lastPiece: 2 });
  });

  it("counts only the named file's bytes in a piece range", () => {
    // Piece 2 holds bytes 8-11: two of a.mkv, two of b.srt.
    expect(getFileRangeByteLength(layout, 'a.mkv', 2, 2)).toBe(2);
    expect(getFileRangeByteLength(layout, 'b.srt', 2, 3)).toBe(4);
    expect(getFileRangeByteLength(layout, 'missing', 0, 3)).toBe(0);
  });

  it('sums piece lengths with a short final piece', () => {
    expect(getRangeByteLength(torrent(14, 4), 0, 3)).toBe(14);
    expect(getRangeByteLength(torrent(14, 0), 0, 3)).toBe(0);
  });

  it('rejects torrent metadata without a usable piece count', () => {
    expect(getTorrentPieceCount(torrent(14, 4, new Array(4)))).toBe(4);
    expect(() => getTorrentPieceCount(torrent(14, 4, []))).toThrow(
      expect.objectContaining({ status: 'invalid_torrent_metadata' })
    );
  });

  it('treats a file as stored when its pieces are verified or it was recorded complete', () => {
    const none = { downloadedPieces: new Uint8Array(1) };
    // Pieces 2 and 3 verified: b.srt is complete in the bitfield, a.mkv is not.
    const tail = { downloadedPieces: Uint8Array.of(0b00110000) };
    expect(isFileStored(tail, layout, 'b.srt', [])).toBe(true);
    expect(isFileStored(tail, layout, 'a.mkv', [])).toBe(false);
    expect(
      isFileStored(none, layout, 'a.mkv', [{ path: 'a.mkv', completedAt: new Date() } as never])
    ).toBe(true);
  });

  it('rejects a path the source does not contain', () => {
    expect(() => assertFileInLayout(layout, 'a.mkv')).not.toThrow();
    expect(() => assertFileInLayout(layout, 'c.mkv')).toThrow(
      expect.objectContaining({ status: 'source_file_unavailable' })
    );
  });

  it('sums the logical size of the requested files', () => {
    expect(getSelectedBytes(layout, ['a.mkv', 'b.srt', 'c.mkv'])).toBe(14);
  });

  it('derives version 1 filename salts from the source hash and leaves version 2 alone', () => {
    expect(withSourceFilenameSalt(layout, 'ABC').filenameSalt).toBe('download-ABC');
    const same = { ...layout, filenameSalt: 'download-ABC' };
    expect(withSourceFilenameSalt(same, 'ABC')).toBe(same);
    const v2 = { ...layout, encryptionVersion: 2 as const, filenameSalt: 'random' };
    expect(withSourceFilenameSalt(v2, 'ABC')).toBe(v2);
  });
});
