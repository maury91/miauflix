import { describe, expect, it } from 'vitest';

import {
  homeMountedRows,
  homeRowLoadState,
  mediaBoxSizes,
  selectMediaBoxSizes,
} from './home-layout';

describe('mediaBoxSizes', () => {
  it.each([
    // width, height → cards per row
    [1920, 1080, 4],
    [1280, 720, 4],
    [3840, 2160, 4],
    [2560, 1080, 5],
    [1024, 768, 3],
  ])('%ix%i fits %i cards', (width, height, cards) => {
    expect(mediaBoxSizes({ width, height }).mediaPerPage).toBe(cards);
  });

  it('sizes cards from the window height and centres them', () => {
    const sizes = mediaBoxSizes({ width: 1920, height: 1080 });
    expect(sizes.mediaWidth).toBeCloseTo(380.16);
    expect(sizes.gap).toBeCloseTo(21.6);
    expect(sizes.width).toBeCloseTo(4 * 380.16 + 3 * 21.6);
    expect(sizes.margin * 2 + sizes.width).toBeCloseTo(1920);
  });

  it('lets at most half a card peek in, and never a negative peek', () => {
    const wide = mediaBoxSizes({ width: 1920, height: 1080 });
    expect(wide.peekWidth).toBeCloseTo(Math.min(wide.mediaWidth / 2, wide.margin));
    const narrow = mediaBoxSizes({ width: 200, height: 1080 });
    expect(narrow.peekWidth).toBeGreaterThanOrEqual(0);
  });

  it('fits at least one card, also in a tiny or unmeasured window', () => {
    expect(mediaBoxSizes({ width: 200, height: 1080 }).mediaPerPage).toBe(1);
    expect(mediaBoxSizes({ width: 0, height: 0 }).mediaPerPage).toBe(1);
  });

  it('reads the measured window, defaulting when the store has no measurements', () => {
    expect(
      selectMediaBoxSizes({ measurements: { window: { width: 1280, height: 720 } } }).windowWidth
    ).toBe(1280);
    expect(selectMediaBoxSizes({}).windowWidth).toBe(1920);
  });
});

describe('homeRowLoadState', () => {
  it.each([
    // focused row, rows → visible, prefetch
    [0, 10, [0, 1], [2, 3, 4, 5]],
    [3, 10, [3, 4], [5, 2, 6, 1]],
    [9, 10, [9], [8, 7, 6, 5]],
    [0, 1, [0], []],
    [0, 3, [0, 1], [2]],
    [0, 0, [], []],
  ])('row %i of %i', (active, count, visible, prefetch) => {
    const state = homeRowLoadState(active, count);
    expect([...state.visible]).toEqual(visible);
    expect([...state.prefetch]).toEqual(prefetch);
  });
});

describe('homeMountedRows', () => {
  it('mounts the rows around the focused row, covering every row that loads', () => {
    const rows = homeMountedRows(5, 5, 100);
    expect(rows).toEqual([3, 4, 5, 6, 7, 8, 9, 10]);
    const { visible, prefetch } = homeRowLoadState(5, 100);
    [...visible, ...prefetch].forEach(row => expect(rows).toContain(row));
  });

  it('also mounts the rows scrolled into view, without the rows in between', () => {
    expect(homeMountedRows(0, 20, 100)).toEqual([0, 1, 2, 3, 4, 5, 18, 19, 20, 21, 22, 23, 24, 25]);
  });

  it('stays within the loaded rows', () => {
    expect(homeMountedRows(0, 0, 3)).toEqual([0, 1, 2]);
    expect(homeMountedRows(0, 0, 0)).toEqual([]);
  });
});
