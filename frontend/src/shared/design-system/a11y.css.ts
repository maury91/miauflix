import { style } from '@vanilla-extract/css';

/** Read by assistive technology, not shown. */
export const visuallyHidden = style({
  position: 'absolute',
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  border: 0,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
});
