import { describe, expect, it } from 'bun:test';

import {
  getFaceGroupFocus,
  getObjectGroupFocus,
  getSubjectFocus,
} from '../src/services/backdrop-face-focus';

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

  it('can calculate focus from a lower-confidence animal-face candidate', () => {
    expect(
      getFaceGroupFocus([{ x: 20, y: 10, width: 30, height: 30, score: 0.2 }], 100, 100, 0.2)
    ).toEqual({
      x: 0.35,
      y: 0.25,
    });
  });
});

describe('getObjectGroupFocus', () => {
  it('uses the head area of one subject box', () => {
    expect(
      getObjectGroupFocus(
        [{ label: 'person', score: 0.8, x: 20, y: 10, width: 30, height: 100 }],
        100,
        100
      )
    ).toEqual({ x: 0.35, y: 0.262 });
  });

  it('centers the estimated head points for multiple subjects', () => {
    expect(
      getObjectGroupFocus(
        [
          { label: 'person', score: 0.8, x: 10, y: 20, width: 20, height: 50 },
          { label: 'dog', score: 0.7, x: 70, y: 40, width: 20, height: 40 },
        ],
        100,
        100
      )
    ).toEqual({ x: 0.5, y: 0.381 });
  });

  it('ignores unrelated or low-confidence object boxes', () => {
    expect(
      getObjectGroupFocus(
        [
          { label: 'bench', score: 0.9, x: 10, y: 10, width: 20, height: 20 },
          { label: 'person', score: 0.29, x: 70, y: 40, width: 20, height: 20 },
        ],
        100,
        100
      )
    ).toBeNull();
  });
});

describe('getSubjectFocus', () => {
  it('keeps the close-up face ahead of a small background face', () => {
    const focus = getSubjectFocus(
      [
        { x: 20, y: 20, width: 40, height: 40, score: 0.95 },
        { x: 90, y: 30, width: 5, height: 5, score: 0.8 },
      ],
      [],
      100,
      100
    );
    expect(focus?.x).toBeGreaterThan(0.4);
    expect(focus?.x).toBeLessThan(0.46);
    expect(focus?.y).toBeGreaterThan(0.38);
  });

  it('balances equally prominent faces in an ensemble', () => {
    expect(
      getSubjectFocus(
        [
          { x: 10, y: 20, width: 20, height: 20, score: 0.9 },
          { x: 70, y: 20, width: 20, height: 20, score: 0.9 },
        ],
        [],
        100,
        100
      )
    ).toEqual({ x: 0.5, y: 0.3 });
  });

  it('does not count a face and its enclosing body twice', () => {
    const faces = [{ x: 20, y: 10, width: 20, height: 20, score: 0.9 }];
    const bodies = [{ label: 'person', score: 0.8, x: 10, y: 0, width: 50, height: 100 }];
    expect(getSubjectFocus(faces, bodies, 100, 100)).toEqual(getSubjectFocus(faces, [], 100, 100));
  });

  it('includes a subject whose face is missing without overwhelming a detected face', () => {
    const focus = getSubjectFocus(
      [{ x: 10, y: 10, width: 20, height: 20, score: 0.9 }],
      [{ label: 'person', score: 0.8, x: 65, y: 10, width: 30, height: 90 }],
      100,
      100
    );
    expect(focus?.x).toBeGreaterThan(0.2);
    expect(focus?.x).toBeLessThan(0.5);
  });

  it('returns null for empty detections and rejects invalid inputs', () => {
    expect(getSubjectFocus([], [], 100, 100)).toBeNull();
    expect(getSubjectFocus([{ x: 0, y: 0, width: 10, height: 10 }], [], NaN, 100)).toBeNull();
    expect(
      getSubjectFocus(
        [{ x: Infinity, y: 0, width: 10, height: 10 }],
        [{ label: 'person', score: NaN, x: 0, y: 0, width: 10, height: 10 }],
        100,
        100
      )
    ).toBeNull();
  });
});
