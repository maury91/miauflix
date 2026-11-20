import { space } from '@shared/design-system/tokens';
import { style } from '@vanilla-extract/css';

/** The service's name with its status badge at the end, wrapping under it when narrow. */
export const header = style({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  justifyContent: 'space-between',
});

export const status = style({
  marginLeft: 'auto',
  paddingLeft: space.sm,
  selectors: {
    '[dir="rtl"] &': { marginLeft: 0, marginRight: 'auto', paddingLeft: 0, paddingRight: space.sm },
  },
});

export const description = style({
  marginTop: space['2xs'],
});

export const causes = style({
  margin: `${space.xs} 0 0`,
  paddingLeft: space.md,
  selectors: {
    '[dir="rtl"] &': { paddingLeft: 0, paddingRight: space.md },
  },
});
