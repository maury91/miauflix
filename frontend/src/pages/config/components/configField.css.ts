import { space } from '@shared/design-system/tokens';
import { style } from '@vanilla-extract/css';

/**
 * A size or duration: the number, then its unit, bottoms aligned (the unit's label is hidden), with
 * the help text under both so nothing pushes the unit below the input.
 */
export const unitRow = style({
  display: 'flex',
  alignItems: 'flex-end',
});

export const unitNumber = style({
  flex: '1 1 0%',
  minWidth: 0,
});

export const unitSelect = style({
  flex: 'none',
  marginLeft: space.sm,
  selectors: {
    '[dir="rtl"] &': { marginLeft: 0, marginRight: space.sm },
  },
});

export const extra = style({
  marginTop: space.xs,
});

export const unitHelp = style({
  margin: `${space.xs} 0 0`,
});
