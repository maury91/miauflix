import { globalStyle, style } from '@vanilla-extract/css';

import {
  BRAND_LOGO_ASPECT,
  CORNER_LOGO_HEIGHT,
  CORNER_LOGO_TOP,
  INTRO_LOGO_HEIGHT_NARROW_PX,
  INTRO_LOGO_HEIGHT_PX,
  NARROW_MAX_WIDTH_PX,
} from './logoGeometry';

const narrow = `(max-width: ${NARROW_MAX_WIDTH_PX}px)`;

export const centeredLogoSize = style({
  width: `${INTRO_LOGO_HEIGHT_PX * BRAND_LOGO_ASPECT}px`,
  maxWidth: '90vw',
  height: 'auto',
  '@media': {
    [narrow]: { width: `${INTRO_LOGO_HEIGHT_NARROW_PX * BRAND_LOGO_ASPECT}px` },
  },
});

/**
 * The app's logo, fixed above every page. Where it sits comes from `data-position`:
 *
 * - `page` (sign-in, setup): centred above the page's card
 * - `intro`: centred on the screen, where the intro animation starts
 * - `configuration`: a small mark at the top, over its own backdrop
 * - `home`: the corner, lined up with the content (`--home-content-left`)
 *
 * `data-above-intro`, `data-hidden` and `data-static` (no transition) complete it.
 */
export const image = style([
  centeredLogoSize,
  {
    display: 'block',
    position: 'fixed',
    zIndex: 1002,
    pointerEvents: 'none',
    transition: 'all 0.4s ease-in-out',
    transform: 'translate(-50%, 0%)',
    left: '50%',
    top: 'calc(50% - 380px)',
    selectors: {
      '&[data-above-intro]': { zIndex: 1003 },
      '&[data-hidden]': { visibility: 'hidden' },
      '&[data-static]': { transition: 'none' },
      '&[data-position="intro"]': {
        transform: 'translate(-50%, -50%)',
        top: '50%',
      },
      '&[data-position="configuration"]': { top: '24px', width: 'auto', height: '56px' },
      '&[data-position="home"]': {
        transform: 'none',
        left: 'var(--home-content-left, 5vw)',
        top: CORNER_LOGO_TOP,
        width: 'auto',
        height: CORNER_LOGO_HEIGHT,
      },
    },
    '@media': {
      [narrow]: {
        top: '50px',
        selectors: {
          '&[data-position="intro"]': { top: '50%' },
          '&[data-position="configuration"]': { top: '16px', height: '48px' },
          '&[data-position="home"]': { top: CORNER_LOGO_TOP, height: CORNER_LOGO_HEIGHT },
        },
      },
    },
  },
]);

globalStyle(`body[data-miauflix-details='true'] ${image}`, {
  left: '8vw',
  '@media': { [narrow]: { left: '30vw' } },
});

globalStyle(`body[data-miauflix-player='true'] ${image}`, { display: 'none' });

/** Configuration pages scroll under the small logo: a strip behind it. */
export const configurationBackdrop = style({
  position: 'fixed',
  top: 0,
  right: 0,
  left: 0,
  height: '104px',
  backgroundColor: '#0a0d0f',
  zIndex: 1001,
  '@media': { [narrow]: { height: '80px' } },
});
