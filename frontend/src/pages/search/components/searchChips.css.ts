import { space } from '@shared/design-system/tokens';
import { style } from '@vanilla-extract/css';

export const section = style({ marginBottom: space.lg });

export const title = style({ marginBottom: space.sm });

/** One chip per line; padding rather than flex `gap` (Chromium 69). */
export const list = style({ margin: `-${space['2xs']} 0` });

export const cell = style({ padding: `${space['2xs']} 0` });

export const row = style({
  display: 'flex',
  flexWrap: 'wrap',
  margin: `-${space['2xs']}`,
});

export const rowItem = style({ padding: space['2xs'] });
