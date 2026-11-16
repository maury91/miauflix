import { color } from '@shared/design-system/tokens';
import { style } from '@vanilla-extract/css';

import { ROW_GAP_VH, ROW_HEIGHT_VH } from '../home-layout';

/**
 * A Home row (docs/plans/style-guide.md, "Collection geometry"): a fixed height in vh, whatever it
 * shows, so Home places and scrolls rows without measuring them. The carousel spans the window;
 * the title and states line up with the rows' left edge (`--home-content-left`, set by Home).
 */
export const row = style({
  boxSizing: 'border-box',
  height: `${ROW_HEIGHT_VH - ROW_GAP_VH}vh`,
  marginBottom: `${ROW_GAP_VH}vh`,
});

export const title = style({
  boxSizing: 'border-box',
  height: '5vh',
  margin: '0 0 1vh',
  paddingLeft: 'var(--home-content-left, 5vw)',
  paddingRight: 'var(--home-content-left, 5vw)',
});

export const carousel = style({
  position: 'relative',
});

/** Over the carousel's empty track while the row's first page loads. */
export const loading = style({
  position: 'absolute',
  top: 0,
  bottom: 0,
  left: 0,
  display: 'flex',
  alignItems: 'center',
  paddingLeft: 'var(--home-content-left, 5vw)',
  color: color.textSecondary,
});

export const state = style({
  display: 'flex',
  alignItems: 'center',
  minHeight: '20vh',
  padding: `0 var(--home-content-left, 5vw)`,
  color: color.textSecondary,
});
