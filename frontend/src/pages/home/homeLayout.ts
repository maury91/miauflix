import {
  type CollectionGeometry,
  ITEM_WIDTH_OF_HEIGHT,
} from '@shared/design-system/carousel/collectionGeometry';
import { remPx } from '@shared/design-system/gl/art';
import { space } from '@shared/design-system/tokens';

import { ROW_GAP_VH, ROW_HEIGHT_VH } from './home-layout';

/**
 * Home's vertical layout, in vh: the CSS (homePage.css.ts, categoryRow.css.ts, the hero's styles)
 * and the GL surface (homeLayout below) both read it, so the drawn rows line up with the DOM ones.
 */
export const HOME_VH = {
  /** The hero: its height, and its padding above and below the details. */
  heroHeight: 55,
  heroPaddingTop: 10,
  heroPaddingBottom: 9,
  /** The rows' scroll container: its top, padding, and the mask fading the rows in at its top. */
  rowsTop: 42,
  rowsPaddingTop: 6,
  rowsPaddingBottom: 8,
  rowsFadeFrom: 5,
  rowsFadeTo: 8,
  /** A row: its whole height and the gap below it (home-layout.ts), its title and the gap under it. */
  rowHeight: ROW_HEIGHT_VH,
  rowGap: ROW_GAP_VH,
  rowTitle: 5,
  rowTitleGap: 1,
  /** A row's message in place of the cards (failed, empty). */
  rowState: 20,
} as const;

const share = (vh: number, windowHeight: number) => (vh / 100) * windowHeight;

/**
 * Within a row (px from its top): its carousel, the middle of its cards (where a loading row's
 * spinner is) and the middle of its message in the cards' place.
 */
export function homeRowLayout(windowHeight: number) {
  const carouselTop = share(HOME_VH.rowTitle + HOME_VH.rowTitleGap, windowHeight);
  const cardHeight = (windowHeight * ITEM_WIDTH_OF_HEIGHT * 9) / 16;
  return {
    carouselTop,
    cardsMiddle: carouselTop + remPx(space.xs) + cardHeight / 2,
    stateMiddle: carouselTop + share(HOME_VH.rowState, windowHeight) / 2,
  };
}

/** Home's layout in px for a window height (and its rows' collection geometry). */
export function homeLayout(
  { width: windowWidth, height: windowHeight }: { width: number; height: number },
  geometry: CollectionGeometry
) {
  const at = (vh: number) => share(vh, windowHeight);
  const rowsContentTop = HOME_VH.rowsTop + HOME_VH.rowsPaddingTop;
  const { carouselTop } = homeRowLayout(windowHeight);
  /** CarouselGl's viewport pads its items by `space.xs` (the focus scale and outline fit in it). */
  const carouselPadding = remPx(space.xs);
  return {
    heroHeight: at(HOME_VH.heroHeight),
    /** The hero details' bottom edge. */
    heroDetailsBottom: at(HOME_VH.heroHeight - HOME_VH.heroPaddingBottom),
    /** Where the rows are clipped, where the first row starts, and their fade-in edge. */
    rowsClipTop: at(HOME_VH.rowsTop),
    rowsContentTop: at(rowsContentTop),
    rowsFade: [
      at(HOME_VH.rowsTop + HOME_VH.rowsFadeFrom),
      at(HOME_VH.rowsTop + HOME_VH.rowsFadeTo),
    ] as [number, number],
    /** The rows' scroll container's height below its padding: room the last row scrolls into. */
    rowsViewport: at(100 - HOME_VH.rowsTop - HOME_VH.rowsPaddingTop - HOME_VH.rowsPaddingBottom),
    rowHeight: at(HOME_VH.rowHeight),
    /** The focused card's resting box (GlFocusAnchor): the first row's first whole card. */
    focusAnchor: {
      x: (windowWidth - geometry.contentWidth) / 2,
      y: at(rowsContentTop) + carouselTop + carouselPadding,
      width: geometry.itemWidth,
      height: (geometry.itemWidth * 9) / 16,
    },
  };
}
