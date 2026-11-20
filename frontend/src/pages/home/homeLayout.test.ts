import { collectionGeometry } from '@shared/design-system/carousel/collectionGeometry';

import { homeLayout, homeRowLayout } from './homeLayout';

describe('homeLayout', () => {
  const window = { width: 1920, height: 1080 };
  const layout = homeLayout(window, collectionGeometry(window));

  it('places the rows as the CSS does (42vh, padding 6vh, mask 5vh to 8vh)', () => {
    expect(layout.rowsClipTop).toBeCloseTo(453.6);
    expect(layout.rowsContentTop).toBeCloseTo(518.4);
    expect(layout.rowsFade[0]).toBeCloseTo(507.6);
    expect(layout.rowsFade[1]).toBeCloseTo(540);
    expect(layout.rowsViewport).toBeCloseTo(475.2);
  });

  it('rests the focused card under the first row title, centred by the margin', () => {
    const geometry = collectionGeometry(window);
    expect(layout.focusAnchor.x).toBeCloseTo((1920 - geometry.contentWidth) / 2);
    // 48vh + title 5vh + 1vh + the carousel's padding (0.5rem at 16 px)
    expect(layout.focusAnchor.y).toBeCloseTo(583.2 + 8);
    expect(layout.focusAnchor.height).toBeCloseTo((geometry.itemWidth * 9) / 16);
  });

  it('puts the hero details 9vh above its bottom', () => {
    expect(layout.heroHeight).toBeCloseTo(594);
    expect(layout.heroDetailsBottom).toBeCloseTo(496.8);
  });

  it('centres a loading row’s spinner on its cards, under the title and the carousel padding', () => {
    const geometry = collectionGeometry(window);
    const row = homeRowLayout(window.height);
    expect(row.carouselTop).toBeCloseTo(64.8);
    expect(row.cardsMiddle).toBeCloseTo(64.8 + 8 + (geometry.itemWidth * 9) / 16 / 2);
  });
});
