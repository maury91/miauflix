import { globalStyle, style } from '@vanilla-extract/css';

import {
  color,
  controlSize,
  duration,
  easing,
  fontFamily,
  layer,
  shadowOverlay,
  space,
} from '../tokens';

/**
 * NavRail (docs/plans/style-guide.md, sections 4 and 8.2): a column of NavItems, inverted-fill
 * actions like Button. The current route has the translucent fill, the focused item is white; brand
 * red is never a nav fill. States are attributes:
 *
 * - `data-expanded` on the rail: labels shown. Compact, each item is a circle around its icon and
 *   its label stays its accessible name. The rail's box keeps the compact width, so expanding
 *   overlays the page instead of reflowing it; the panel and the labels fade with opacity only.
 * - `data-current` on an item: the current route (translucent fill, `aria-current="page"`).
 *
 * Each selector is its own rule: Chromium 69 drops a whole selector list over one it doesn't know.
 */

const item = controlSize.md;
const inset = space.xs;
const compactWidth = `${parseFloat(item.height) + parseFloat(inset) * 2}rem`;
const fade = `opacity ${duration.standard} ${easing.standard}`;

export const rail = style({
  position: 'relative',
  zIndex: layer.stickyChrome,
  flex: 'none',
  boxSizing: 'border-box',
  width: compactWidth,
  height: '100%',
  fontFamily,
});

/** The visible panel: as wide as the rail when compact, as wide as its labels when expanded. */
export const panel = style({
  position: 'absolute',
  top: 0,
  bottom: 0,
  left: 0,
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  minWidth: '100%',
  padding: `${space.lg} ${inset}`,
  backgroundColor: color.canvas,
  // A shadow, not a border, so the edge takes nothing from the items' width
  boxShadow: `inset -0.0625rem 0 0 ${color.borderSubtle}`,
  selectors: {
    '[dir="rtl"] &': {
      left: 'auto',
      right: 0,
      boxShadow: `inset 0.0625rem 0 0 ${color.borderSubtle}`,
    },
  },
});

/** The items' column; the end slot (Settings, Back) sits at the bottom. */
export const items = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'stretch',
});

export const end = style({
  marginTop: 'auto',
  paddingTop: space.md,
});

globalStyle(`${items} > * + *`, { marginTop: space.xs });

/** NavItem: the action recipe, left-aligned; a circle when the rail is compact. */
export const navItem = style({
  justifyContent: 'flex-start',
  selectors: {
    [`${rail}:not([data-expanded]) &`]: {
      width: item.height,
      paddingLeft: 0,
      paddingRight: 0,
      justifyContent: 'center',
    },
    [`${rail}[data-expanded] &`]: {
      paddingLeft: `${(parseFloat(item.height) - parseFloat(item.icon)) / 2}rem`,
    },
    [`[dir="rtl"] ${rail}[data-expanded] &`]: {
      paddingLeft: item.paddingX,
      paddingRight: `${(parseFloat(item.height) - parseFloat(item.icon)) / 2}rem`,
    },
  },
});

export const icon = style({
  display: 'inline-flex',
  flex: 'none',
  fontSize: item.icon,
  lineHeight: 0,
});

export const label = style({
  marginLeft: space.sm,
  marginRight: space.sm,
  opacity: 1,
  transition: fade,
  selectors: {
    // Compact: hidden from sight, still the item's accessible name
    [`${rail}:not([data-expanded]) &`]: {
      position: 'absolute',
      width: 1,
      height: 1,
      margin: -1,
      overflow: 'hidden',
      clip: 'rect(0 0 0 0)',
      opacity: 0,
    },
  },
  '@media': {
    '(prefers-reduced-motion: reduce)': { transition: 'none' },
  },
});

/** Positions the count Badge: expanded it ends the row; compact it sits on the icon's corner. */
export const badge = style({
  display: 'inline-flex',
  lineHeight: 0,
  selectors: {
    [`${rail}[data-expanded] &`]: { marginLeft: 'auto' },
    [`[dir="rtl"] ${rail}[data-expanded] &`]: { marginLeft: 0, marginRight: 'auto' },
    [`${rail}:not([data-expanded]) &`]: { position: 'absolute', top: '0.125rem', left: '1.375rem' },
    [`[dir="rtl"] ${rail}:not([data-expanded]) &`]: { left: 'auto', right: '1.375rem' },
  },
});

/** Expanded, the panel overlays the page; labels never wrap, so it grows to the longest. */
globalStyle(`${rail}[data-expanded] ${panel}`, { boxShadow: shadowOverlay });
