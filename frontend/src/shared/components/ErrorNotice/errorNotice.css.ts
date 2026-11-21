import { color, space } from '@shared/design-system/tokens';
import { style } from '@vanilla-extract/css';

export const line = style({ display: 'block' });

/** The hint, server detail and error id: quieter, in the surrounding font. */
export const secondary = style({
  display: 'block',
  marginTop: space['2xs'],
  color: color.textSecondary,
  fontSize: '0.85em',
});
