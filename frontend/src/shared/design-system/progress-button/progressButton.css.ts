import { keyframes, style, type StyleRule } from '@vanilla-extract/css';

import { action } from '../action/action.css';
import { color, controlSize, controlSizes, radius } from '../tokens';

/**
 * A progress button counting down (docs/plans/style-guide.md, "Progress button"). The button itself
 * keeps the rest look even while focused; the focused look is a second copy on top, revealed from
 * the left as the countdown runs.
 *
 * The reveal animates `transform` only: a clipping layer slides in from the left while the copy
 * inside it slides the opposite way, so the copy stays put and its visible part grows. Duration and
 * a negative delay (to start partway) are inline values; nothing runs in JavaScript per frame.
 */

const solidRest: StyleRule = { backgroundColor: 'transparent', color: color.onAction };
const overMediaRest: StyleRule = {
  backgroundColor: color.actionTranslucent,
  color: color.onAction,
};

/** Added to `action` while counting down; outranks its focus and pressed rules. */
export const progressRoot = style({
  selectors: {
    '&[data-progress]': { overflow: 'hidden' },
    '&[data-progress][data-focused]:not(:disabled)': solidRest,
    '&[data-progress][data-focused][data-surface="overMedia"]:not(:disabled)': overMediaRest,
    '&[data-progress]:active:not(:disabled):not([aria-busy="true"])': solidRest,
    '&[data-progress][data-surface="overMedia"]:active:not(:disabled):not([aria-busy="true"])':
      overMediaRest,
  },
});

const clipIn = keyframes({
  from: { transform: 'translateX(-100%)' },
  to: { transform: 'translateX(0)' },
});

const copyIn = keyframes({
  from: { transform: 'translateX(100%)' },
  to: { transform: 'translateX(0)' },
});

const coverButton: StyleRule = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  pointerEvents: 'none',
  animationTimingFunction: 'linear',
  animationFillMode: 'forwards',
};

/** The clipping layer: its right edge is the progress. */
export const clip = style({
  ...coverButton,
  overflow: 'hidden',
  animationName: clipIn,
  selectors: {
    [`${action}[data-paused] &`]: { animationPlayState: 'paused' },
  },
});

const copyPadding: Record<string, StyleRule> = {};
for (const size of controlSizes) {
  const { paddingX } = controlSize[size];
  copyPadding[`${action}[data-size="${size}"] &`] = {
    paddingLeft: paddingX,
    paddingRight: paddingX,
  };
}

/** The focused-look copy, laid out exactly like the button's own content. */
export const focusedCopy = style({
  ...coverButton,
  boxSizing: 'border-box',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: radius.full,
  backgroundColor: color.actionFocus,
  color: color.onActionFocus,
  animationName: copyIn,
  selectors: {
    ...copyPadding,
    [`${action}[data-paused] &`]: { animationPlayState: 'paused' },
  },
});
