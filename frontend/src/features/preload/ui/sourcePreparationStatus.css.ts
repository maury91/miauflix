import { breakpoint, color, space } from '@shared/design-system/tokens';
import { globalStyle, style } from '@vanilla-extract/css';

export const status = style({
  display: 'flex',
  flex: '0 1 auto',
  flexDirection: 'column',
  alignItems: 'flex-end',
  minWidth: 'max-content',
  margin: 0,
  color: color.textSecondary,
  '@media': {
    [`(max-width: ${breakpoint.expanded})`]: {
      width: '100%',
      minWidth: 0,
      alignItems: 'flex-start',
    },
  },
});

/** The badges side by side (margins, not `gap`: Chromium 69 has no flex gap). */
export const badges = style({
  display: 'inline-flex',
  alignItems: 'center',
});

globalStyle(`${badges} > * + *`, { marginLeft: space.xs });

export const discovery = style({
  display: 'inline-flex',
  alignItems: 'center',
  marginBottom: space.xs,
});
