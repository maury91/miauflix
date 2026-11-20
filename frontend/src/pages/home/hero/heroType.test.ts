import { heroTypeCss, heroTypeScale } from './heroType';

describe('hero type', () => {
  it('writes the CSS clamp from the same numbers', () => {
    expect(heroTypeCss('title')).toBe('clamp(32px, 5vh, 73.6px)');
    expect(heroTypeCss('overview')).toBe('clamp(14.4px, 2.3vh, 20.8px)');
  });

  it('resolves to px within the bounds', () => {
    expect(heroTypeScale(1080)).toEqual({
      title: 54,
      metadata: expect.closeTo(19.2) as number,
      overview: expect.closeTo(20.8) as number,
      status: expect.closeTo(16) as number,
    });
    expect(heroTypeScale(400).title).toBe(32);
    expect(heroTypeScale(4000).title).toBe(73.6);
  });
});
