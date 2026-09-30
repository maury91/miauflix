import { describe, expect, it } from 'bun:test';

import { getFaceGroupFocus } from '../src/services/backdrop-face-focus';

describe('getFaceGroupFocus', () => {
  it('centers a square focus on one accepted face', () => {
    expect(getFaceGroupFocus([{ x: 20, y: 10, width: 30, height: 40 }], 100, 100)).toEqual({
      x: 0.35,
      y: 0.3,
    });
  });

  it('centers the union when multiple faces are detected', () => {
    expect(
      getFaceGroupFocus(
        [
          { x: 10, y: 20, width: 20, height: 30, score: 0.9 },
          { x: 70, y: 40, width: 20, height: 20, score: 0.8 },
        ],
        100,
        100
      )
    ).toEqual({ x: 0.5, y: 0.4 });
  });

  it('ignores low-confidence and invalid boxes', () => {
    expect(
      getFaceGroupFocus(
        [
          { x: 10, y: 10, width: 20, height: 20, score: 0.49 },
          { x: Number.NaN, y: 0, width: 10, height: 10, score: 0.9 },
        ],
        100,
        100
      )
    ).toBeNull();
  });

  it('clamps boxes before calculating the group center', () => {
    expect(getFaceGroupFocus([{ x: -10, y: -10, width: 30, height: 30 }], 100, 100)).toEqual({
      x: 0.1,
      y: 0.1,
    });
  });
});
