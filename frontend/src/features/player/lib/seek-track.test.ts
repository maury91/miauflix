import { describe, expect, it } from 'vitest';

import { downloadedBlocks } from './seek-track';

describe('downloadedBlocks', () => {
  it('turns thousandths of the file into shares of the seek bar', () => {
    expect(
      downloadedBlocks([
        [0, 120],
        [300, 340],
      ])
    ).toEqual([
      { start: 0, end: 0.12 },
      { start: 0.3, end: 0.34 },
    ]);
  });

  it('clamps to the file and leaves out empty stretches', () => {
    expect(
      downloadedBlocks([
        [-10, 50],
        [400, 400],
        [990, 1200],
      ])
    ).toEqual([
      { start: 0, end: 0.05 },
      { start: 0.99, end: 1 },
    ]);
  });

  it('draws nothing when downloads are unknown', () => {
    expect(downloadedBlocks(null)).toEqual([]);
  });
});
