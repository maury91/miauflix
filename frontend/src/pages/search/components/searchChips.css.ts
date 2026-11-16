import { space } from '@shared/design-system/tokens';
import { style } from '@vanilla-extract/css';

export const section = style({ marginBottom: space.lg });

export const title = style({ marginBottom: space.sm });

/** Five chips a row; margins rather than flex `gap` (Chromium 69). */
export const chips = style({
  display: 'flex',
  flexWrap: 'wrap',
  margin: `-${space['2xs']}`,
});

export const cell = style({
  boxSizing: 'border-box',
  width: '20%',
  padding: space['2xs'],
  display: 'flex',
});

export const row = style({
  display: 'flex',
  flexWrap: 'wrap',
  margin: `-${space['2xs']}`,
});

export const rowItem = style({ padding: space['2xs'] });
