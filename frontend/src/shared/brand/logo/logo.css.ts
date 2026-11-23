import { navRailWidth } from '@shared/design-system/nav-rail/navRail.css';
import { outlineRoom } from '@shared/design-system/scroll-area/scrollArea.css';
import { space } from '@shared/design-system/tokens';
import { globalStyle, keyframes, style } from '@vanilla-extract/css';

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

/** Search, settings and profiles: right of the back rail, where Search's columns start. */
export const INNER_LOGO_LEFT = `calc(${navRailWidth} + ${space.xl})`;
/**
 * Details: right of the back rail, over the title's information (the body's padding, then the
 * ScrollArea's room for focus rings).
 */
const DETAILS_LOGO_LEFT = `calc(${navRailWidth} + ${space['2xl']} + ${outlineRoom})`;

/*
 * The loading pulse, in CSS so the server-rendered logo pulses from the first paint and hydration
 * keeps the same running animation. The origin is the box's top-left corner, which
 * `translate(-50%, -50%)` puts at the logo's centre. Browsers with the `scale` property animate it,
 * so the position transform still transitions when the logo moves; the Samsung TV's Chromium 69
 * pulses `transform`, repeating the centred position (scaling before the translate draws the same).
 * Logo.tsx eases a stopped pulse back to full size with the same properties.
 */
export const PULSE_SCALE = 1.1;
export const PULSE_OPACITY = 0.8;
export const PULSE_MS = 1400;

const pulseTransform = keyframes({
  '0%': { transformOrigin: '0 0', transform: 'scale(1) translate(-50%, -50%)', opacity: 1 },
  '50%': {
    transformOrigin: '0 0',
    transform: `scale(${PULSE_SCALE}) translate(-50%, -50%)`,
    opacity: PULSE_OPACITY,
  },
  '100%': { transformOrigin: '0 0', transform: 'scale(1) translate(-50%, -50%)', opacity: 1 },
});

const pulseScale = keyframes({
  '0%': { transformOrigin: '0 0', scale: '1', opacity: 1 },
  '50%': { transformOrigin: '0 0', scale: String(PULSE_SCALE), opacity: PULSE_OPACITY },
  '100%': { transformOrigin: '0 0', scale: '1', opacity: 1 },
});

/**
 * The logo shared by the signed-in pages (and the loading screen), fixed above every page; it
 * moves between them. Where it sits comes from `data-position`:
 *
 * - `intro`: centred on the screen, where the intro animation starts (and the loading pulse)
 * - `home`: the corner, lined up with Home's cards (`--logo-home-left`, set by Logo)
 * - `inner`: the corner, right of the back rail (search, settings, profiles)
 * - `details`: the corner, over the details' information
 *
 * `data-above-intro`, `data-hidden`, `data-static` (no transition) and `data-pulsing` complete it.
 */
export const image = style([
  centeredLogoSize,
  {
    display: 'block',
    position: 'fixed',
    zIndex: 1002,
    pointerEvents: 'none',
    transition: 'all 0.4s ease-in-out',
    transform: 'translate(-50%, -50%)',
    left: '50%',
    top: '50%',
    selectors: {
      '&[data-above-intro]': { zIndex: 1003 },
      '&[data-hidden]': { visibility: 'hidden' },
      '&[data-static]': { transition: 'none' },
      '&[data-position="intro"][data-pulsing]': {
        animation: `${pulseTransform} ${PULSE_MS}ms ease-in-out infinite`,
      },
      '&[data-position="home"]': { left: 'var(--logo-home-left, 5vw)' },
      '&[data-position="inner"]': { left: INNER_LOGO_LEFT },
      '&[data-position="details"]': { left: DETAILS_LOGO_LEFT },
    },
    '@supports': {
      '(scale: 1)': {
        selectors: {
          '&[data-position="intro"][data-pulsing]': {
            animationName: pulseScale,
          },
        },
      },
    },
  },
]);

// Doubled attribute: outranks the pulse rules whatever order they are emitted in
globalStyle(`${image}[data-position="intro"][data-pulsing][data-pulsing]`, {
  '@media': { '(prefers-reduced-motion: reduce)': { animation: 'none' } },
});

// The three corner positions share their size and top
for (const position of ['home', 'inner', 'details']) {
  globalStyle(`${image}[data-position="${position}"]`, {
    transform: 'none',
    top: CORNER_LOGO_TOP,
    width: 'auto',
    height: CORNER_LOGO_HEIGHT,
  });
}

globalStyle(`body[data-miauwatch-player='true'] ${image}`, { display: 'none' });
