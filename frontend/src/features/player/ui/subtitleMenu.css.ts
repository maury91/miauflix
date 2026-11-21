import { style } from '@vanilla-extract/css';

/**
 * The panel's content scrolls inside a fixed height (a scroll area needs one), short enough to
 * sit above the player's controls row.
 */
export const body = style({
  height: '26rem',
  maxHeight: '60vh',
});
