import { color, radius, space, typeScale } from '@shared/design-system/tokens';
import { style } from '@vanilla-extract/css';

export const fallback = style({
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '12.5rem',
  margin: space.md,
  padding: space.xl,
  borderRadius: radius.md,
  backgroundColor: color.surface,
  color: color.text,
});

export const details = style({
  alignSelf: 'stretch',
  maxWidth: '37.5rem',
  margin: `${space.md} auto 0`,
  textAlign: 'start',
});

export const stack = style({
  overflowX: 'auto',
  margin: 0,
  padding: space.md,
  borderRadius: radius.sm,
  backgroundColor: color.surfaceRaised,
  color: color.textSecondary,
  ...typeScale.caption,
});
