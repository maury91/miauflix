import { space } from '@shared/design-system/tokens';
import { style } from '@vanilla-extract/css';

/** The technical details under the failure, centred under it like the EmptyState. */
export const details = style({
  maxWidth: '32rem',
  margin: `${space.lg} auto 0`,
});

export const list = style({ margin: `0 0 ${space.sm}` });

/** Label and value side by side; margins rather than flex `gap` (Chromium 69). */
export const item = style({
  display: 'flex',
  alignItems: 'baseline',
  marginBottom: space.xs,
});

export const term = style({ flex: '0 0 8rem', marginRight: space.sm });

export const value = style({ flex: '1 1 0%', minWidth: 0, margin: 0, overflowWrap: 'anywhere' });
