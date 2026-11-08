import { fitBetweenInsets } from './subtitle-insets';

describe('subtitles between the open controls', () => {
  // A 16:9 picture filling a 1600x900 player.
  const picture = { x: 0, y: 0, width: 1600, height: 900 };

  it('keeps the picture box while the controls are hidden or clear of it', () => {
    expect(fitBetweenInsets(picture, 900, 0, 0)).toEqual(picture);
    // A letterboxed picture already sits between the header and the bar.
    const letterboxed = { x: 0, y: 150, width: 1600, height: 600 };
    expect(fitBetweenInsets(letterboxed, 900, 100, 140)).toEqual(letterboxed);
  });

  it('scales the whole box into the free space, keeping its shape and centre line', () => {
    const fitted = fitBetweenInsets(picture, 900, 90, 180);
    expect(fitted.y).toBe(90);
    expect(fitted.height).toBe(630);
    expect(fitted.width).toBeCloseTo(1120);
    expect(fitted.x).toBeCloseTo(240);
    expect(fitted.width / fitted.height).toBeCloseTo(16 / 9);
  });

  it('only moves a box that fits but overlaps, without shrinking it', () => {
    const fitted = fitBetweenInsets({ x: 0, y: 150, width: 1600, height: 600 }, 900, 0, 200);
    expect(fitted).toEqual({ x: 0, y: 100, width: 1600, height: 600 });
  });
});
