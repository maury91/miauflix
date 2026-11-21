import { color, radius, space, typeScale } from '@shared/design-system/tokens';
import { style } from '@vanilla-extract/css';

/** Three cues around a fixed "Now" line, each moved by how far it is from it. */
export const preview = style({
  position: 'relative',
  height: '10rem',
  overflow: 'hidden',
  borderRadius: radius.md,
  backgroundColor: color.surface,
});

export const now = style({
  position: 'absolute',
  top: '50%',
  left: space.xs,
  right: space.xs,
  display: 'flex',
  alignItems: 'center',
  transform: 'translateY(-50%)',
  color: color.textSecondary,
  ...typeScale.caption,
  pointerEvents: 'none',
  selectors: {
    '&::after': {
      content: '""',
      flex: 1,
      marginLeft: space['2xs'],
      borderTop: `1px solid ${color.borderSubtle}`,
    },
  },
});

export const nowIcon = style({ marginLeft: space['2xs'], fontSize: '1.25rem' });

/** `data-active`: the cue showing now. The offset is the inline transform (one per cue). */
export const line = style({
  position: 'absolute',
  top: '50%',
  left: '4rem',
  right: space.xs,
  transition: 'transform 0.1s linear',
  color: color.textSecondary,
  ...typeScale.caption,
  lineHeight: 1.3,
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
  whiteSpace: 'pre-line',
  backgroundColor: color.surface,
  selectors: {
    '&[data-current="true"]': { color: color.text, fontWeight: 600 },
  },
});

/** −5 s, the slider, +5 s. Margins, not `gap`: Chromium 69 has no flex gap. */
export const adjustment = style({
  display: 'flex',
  alignItems: 'center',
});

export const slider = style({
  flex: 1,
  minWidth: 0,
  margin: `0 ${space.sm}`,
});

export const range = style({
  display: 'flex',
  justifyContent: 'space-between',
  color: color.textSecondary,
  ...typeScale.caption,
});
