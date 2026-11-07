import { describe, expect, it } from 'bun:test';

import { clearPiecesInBitfield, pieceRangeOf } from '../../src/engine/download.utils';

describe('piece range helpers', () => {
  it('maps a byte range to the inclusive pieces it overlaps', () => {
    expect(pieceRangeOf(4, 0, 6)).toEqual({ first: 0, last: 1 });
    expect(pieceRangeOf(4, 6, 14)).toEqual({ first: 1, last: 4 });
    expect(pieceRangeOf(4, 8, 4)).toEqual({ first: 2, last: 2 });
    expect(pieceRangeOf(4, 8, 0)).toBeNull();
  });

  it('clears whole piece ranges in a copy of the bitfield', () => {
    const bitfield = Uint8Array.of(0b11111111, 0b11110000);
    const cleared = clearPiecesInBitfield(bitfield, [
      { first: 1, last: 2 },
      { first: 9, last: 9 },
    ]);
    expect([...cleared]).toEqual([0b10011111, 0b10110000]);
    expect([...bitfield]).toEqual([0b11111111, 0b11110000]);
  });
});
