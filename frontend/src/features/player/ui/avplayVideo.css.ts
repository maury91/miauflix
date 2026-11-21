import { style } from '@vanilla-extract/css';

/** AVPlay draws in this element's area, below the page. */
export const plane = style({
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
});
