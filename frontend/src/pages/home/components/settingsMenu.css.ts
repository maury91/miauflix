import { color, radius, space } from '@shared/design-system/tokens';
import { style } from '@vanilla-extract/css';

/**
 * The settings panel in the rail's flyout: a raised panel lined up with the rail's Settings item,
 * starting right at the rail's edge so the pointer travels into it without leaving the rail.
 */
export const zone = style({
  position: 'absolute',
  left: 0,
  outline: 'none',
});

export const panel = style({
  boxSizing: 'border-box',
  width: '24rem',
  // Not min(): the 2020 TVs do not have it
  maxWidth: 'calc(100vw - 10rem)',
  padding: space.xs,
  border: `1px solid ${color.borderSubtle}`,
  borderRadius: radius.lg,
  backgroundColor: color.surfaceRaised,
  color: color.text,
});

export const header = style({
  padding: `${space.sm} ${space.sm} ${space.xs}`,
});
