import { style } from '@vanilla-extract/css';

import { space, tvSafeArea } from '../tokens';
import { windowClassQuery } from './windowClass';

/**
 * Container and SafeArea (docs/plans/style-guide.md, sections 5 and 8.1).
 *
 * Container centres content at a reading, form or full width, with viewport gutters on the web
 * (`md` on compact windows, `lg` from medium up). On TV the screen's SafeArea already keeps
 * content off the edges, so a Container adds no gutters there.
 *
 * SafeArea pads a screen-sized region: the TV safe area (`4rem` × `2.25rem`) at TV density, the
 * device's insets (notches, rounded corners) on the web. Backgrounds behind it still bleed to the
 * edges. TV is the static `html[data-density="tv"]`, so nothing is decided in JavaScript.
 */

const tv = 'html[data-density="tv"] &';

export const widths = { form: '35rem', reading: '50rem' } as const;

export const container = style({
  boxSizing: 'border-box',
  width: '100%',
  marginRight: 'auto',
  marginLeft: 'auto',
  paddingRight: space.md,
  paddingLeft: space.md,
  selectors: {
    // The gutters sit outside the content width
    '&[data-width="form"]': { maxWidth: `calc(${widths.form} + 2 * ${space.md})` },
    '&[data-width="reading"]': { maxWidth: `calc(${widths.reading} + 2 * ${space.md})` },
    '&[data-gutters="none"]': { paddingRight: 0, paddingLeft: 0 },
    '&[data-width="form"][data-gutters="none"]': { maxWidth: widths.form },
    '&[data-width="reading"][data-gutters="none"]': { maxWidth: widths.reading },
    [tv]: { paddingRight: 0, paddingLeft: 0 },
    [`html[data-density="tv"] &[data-width="form"]`]: { maxWidth: widths.form },
    [`html[data-density="tv"] &[data-width="reading"]`]: { maxWidth: widths.reading },
  },
  '@media': {
    [windowClassQuery.medium]: {
      paddingRight: space.lg,
      paddingLeft: space.lg,
      // The opt-outs and TV rules above are more specific, so only the wider gutters change here
      selectors: {
        '&[data-width="form"]': { maxWidth: `calc(${widths.form} + 2 * ${space.lg})` },
        '&[data-width="reading"]': { maxWidth: `calc(${widths.reading} + 2 * ${space.lg})` },
      },
    },
  },
});

const inset = (side: 'top' | 'right' | 'bottom' | 'left') => `env(safe-area-inset-${side}, 0px)`;

export const safeArea = style({
  boxSizing: 'border-box',
  selectors: {
    '&:not([data-edges="y"])': { paddingRight: inset('right'), paddingLeft: inset('left') },
    '&:not([data-edges="x"])': { paddingTop: inset('top'), paddingBottom: inset('bottom') },
    [`html[data-density="tv"] &:not([data-edges="y"])`]: {
      paddingRight: tvSafeArea.x,
      paddingLeft: tvSafeArea.x,
    },
    [`html[data-density="tv"] &:not([data-edges="x"])`]: {
      paddingTop: tvSafeArea.y,
      paddingBottom: tvSafeArea.y,
    },
    '&[data-fill]': { minHeight: '100vh' },
  },
});
