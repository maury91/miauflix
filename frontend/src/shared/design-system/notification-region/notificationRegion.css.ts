import { keyframes, style } from '@vanilla-extract/css';

import { duration, easing, layer, space, tvSafeArea } from '../tokens';

/**
 * NotificationRegion (docs/plans/style-guide.md, section 8.5): transient Messages stacked at the
 * bottom (or top) centre, over everything but never taking focus or the pointer. They enter with
 * opacity and a short slide (compositor only) and leave at once.
 */

export const region = style({
  position: 'fixed',
  zIndex: layer.notification,
  left: 0,
  right: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  padding: `0 ${space.md}`,
  pointerEvents: 'none',
  selectors: {
    '&[data-placement="bottom"]': { bottom: space.xl },
    '&[data-placement="top"]': { top: space.xl },
    'html[data-density="tv"] &[data-placement="bottom"]': { bottom: tvSafeArea.y },
    'html[data-density="tv"] &[data-placement="top"]': { top: tvSafeArea.y },
  },
});

const enter = keyframes({
  from: { opacity: 0, transform: 'translateY(0.5rem)' },
  to: { opacity: 1, transform: 'translateY(0)' },
});

export const item = style({
  width: '100%',
  maxWidth: '30rem',
  animation: `${enter} ${duration.panel} ${easing.standard}`,
  selectors: {
    '&:not(:first-child)': { marginTop: space.xs },
  },
  '@media': {
    '(prefers-reduced-motion: reduce)': { animation: 'none' },
  },
});
