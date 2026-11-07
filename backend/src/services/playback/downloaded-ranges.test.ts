import {
  applyPiecesUpdate,
  downloadedRanges,
  mergeSnapshot,
  type SourcePieces,
} from './downloaded-ranges';

const base64 = (...bytes: number[]) => Buffer.from(bytes).toString('base64');

describe('downloaded ranges', () => {
  describe('applyPiecesUpdate', () => {
    it('replaces the pieces with a whole bitfield and sets added pieces', () => {
      const whole = applyPiecesUpdate(undefined, { totalPieces: 16, bitfield: base64(0x80, 0) });
      expect([...whole.bitfield]).toEqual([0x80, 0]);
      const added = applyPiecesUpdate(whole, { totalPieces: 16, added: [1, 15, 99] });
      expect([...added.bitfield]).toEqual([0xc0, 0x01]);
      const lost = applyPiecesUpdate(added, { totalPieces: 16, bitfield: base64(0, 1) });
      expect([...lost.bitfield]).toEqual([0, 1]);
    });

    it('starts from no pieces when added pieces arrive first', () => {
      expect([...applyPiecesUpdate(undefined, { totalPieces: 8, added: [7] }).bitfield]).toEqual([
        1,
      ]);
    });
  });

  it('merges a snapshot with pieces heard before it arrived', () => {
    const heard: SourcePieces = { totalPieces: 8, bitfield: new Uint8Array([0x01]) };
    expect([...mergeSnapshot(heard, { totalPieces: 8, bitfield: base64(0x80) }).bitfield]).toEqual([
      0x81,
    ]);
  });

  describe('downloadedRanges', () => {
    it('merges consecutive pieces into thousandths of the file', () => {
      // Ten 100-byte pieces, one 1000-byte file: pieces 0-2 and 5 are verified.
      const pieces = { totalPieces: 10, bitfield: new Uint8Array([0b11100100, 0]) };
      expect(downloadedRanges(pieces, 100, { offset: 0, length: 1000 })).toEqual([
        [0, 300],
        [500, 600],
      ]);
    });

    it('clips pieces to a file inside a multi-file source', () => {
      // The file spans bytes 150-450 (pieces 1-4); piece 1 covers its first 50 bytes.
      const pieces = { totalPieces: 10, bitfield: new Uint8Array([0b01001000, 0]) };
      expect(downloadedRanges(pieces, 100, { offset: 150, length: 300 })).toEqual([
        [0, 167],
        [833, 1000],
      ]);
    });

    it('merges stretches that touch once rounded to the scale', () => {
      // 10000 one-byte pieces: every other piece is verified, each gap is under a thousandth.
      const bitfield = new Uint8Array(1250).fill(0b10101010);
      expect(
        downloadedRanges({ totalPieces: 10_000, bitfield }, 1, { offset: 0, length: 10_000 })
      ).toEqual([[0, 1000]]);
    });

    it('is empty without pieces or a usable layout', () => {
      const pieces = { totalPieces: 4, bitfield: new Uint8Array([0xf0]) };
      expect(downloadedRanges(pieces, 0, { offset: 0, length: 10 })).toEqual([]);
      expect(downloadedRanges(pieces, 10, { offset: 0, length: 0 })).toEqual([]);
    });
  });
});
