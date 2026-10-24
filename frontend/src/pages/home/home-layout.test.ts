import { describe, expect, it } from 'vitest';

import { homeRowLoadState, mediaBoxSizes, selectMediaBoxSizes } from './home-layout';

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
