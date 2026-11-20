import { space } from '@shared/design-system/tokens';
import { style } from '@vanilla-extract/css';

/** A size or duration: the number, then its unit, bottoms aligned (the unit's label is hidden). */
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
