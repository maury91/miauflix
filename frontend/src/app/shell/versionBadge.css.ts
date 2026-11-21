import { color } from '@shared/design-system/tokens';
import { style } from '@vanilla-extract/css';

export const badge = style({
  position: 'fixed',
  right: '16px',
  bottom: '12px',
  zIndex: 1000,
  color: color.textDisabled,
  fontSize: '12px',
  letterSpacing: '0.02em',
  pointerEvents: 'none',
  userSelect: 'none',
});
