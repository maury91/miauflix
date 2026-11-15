import { style } from '@vanilla-extract/css';

import { radius, space } from '../../tokens';

/**
 * EpisodeItem (docs/plans/style-guide.md, section 8.6): the still in a ListItem's leading slot, a
 * fixed 16:9 box with the decorative progress hairline along its bottom.
 */

export const still = style({
  position: 'relative',
  display: 'block',
  width: '10rem',
  overflow: 'hidden',
  borderRadius: radius.sm,
  '@media': {
    '(max-width: 37.5em)': { width: '7rem' },
  },
});

export const progress = style({
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: 0,
});

/** The badge and the facts at the row's end. */
export const metadata = style({
  display: 'inline-flex',
  alignItems: 'center',
});

export const metadataBadge = style({
  display: 'inline-flex',
  marginRight: space.xs,
  selectors: {
    '[dir="rtl"] &': { marginRight: 0, marginLeft: space.xs },
  },
});
