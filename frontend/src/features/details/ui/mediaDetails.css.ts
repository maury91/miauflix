import { color, fontFamily, space, typeScale } from '@shared/design-system/tokens';
import { style } from '@vanilla-extract/css';

/**
 * The details screen (docs/plans/style-guide.md, section 8): the back rail, then the title's
 * information over its backdrop and, for shows, the episodes beside it. Over media throughout: the
 * actions take the translucent rest look. Margins instead of flex `gap` (Chromium 69).
 */

/** Darkens the backdrop behind the information (start) and the episodes (end). */
const canvasAt = (alpha: number) => `rgba(10, 13, 15, ${alpha})`;

export const page = style({
  position: 'absolute',
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  zIndex: 3,
  display: 'flex',
  overflow: 'hidden',
  backgroundColor: color.canvas,
  color: color.text,
  fontFamily,
});

/** The backdrop, placed by the feature (an inline image, position and size). */
export const backdrop = style({
  position: 'absolute',
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  backgroundRepeat: 'no-repeat',
});

export const scrim = style({
  position: 'absolute',
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  pointerEvents: 'none',
  background: [
    `linear-gradient(90deg, ${color.canvas} 0%, ${canvasAt(0.94)} 29%, ${canvasAt(0.22)} 57%, ${canvasAt(0.3)} 100%)`,
    `linear-gradient(0deg, ${color.canvas} 0%, ${canvasAt(0)} 30%)`,
  ].join(', '),
  selectors: {
    // The episodes need a dark end too
    '&[data-episodes]': {
      background: [
        `linear-gradient(90deg, ${color.canvas} 0%, ${canvasAt(0.94)} 29%, ${canvasAt(0.22)} 57%, ${canvasAt(0.92)} 100%)`,
        `linear-gradient(0deg, ${color.canvas} 0%, ${canvasAt(0)} 30%)`,
      ].join(', '),
    },
  },
});

export const rail = style({
  position: 'relative',
  flex: 'none',
  height: '100%',
});

/** Everything right of the rail; the app logo sits over its top. */
export const body = style({
  position: 'relative',
  flex: '1 1 0%',
  minWidth: 0,
  boxSizing: 'border-box',
  height: '100%',
  padding: `6rem ${space['2xl']} ${space.xl}`,
});

export const info = style({
  maxWidth: '36rem',
  paddingBottom: space.xl,
});

export const logoFrame = style({
  maxWidth: '24rem',
  marginBottom: space.md,
});

export const logo = style({
  display: 'block',
  maxWidth: '100%',
  maxHeight: '8rem',
  objectFit: 'contain',
  objectPosition: 'left bottom',
});

export const title = style({
  marginBottom: space.sm,
});

export const facts = style({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
});

/** A fact and the separator dot after it. */
export const fact = style({
  display: 'inline-flex',
  alignItems: 'center',
  marginRight: space.sm,
  ...typeScale.label,
});

export const dot = style({
  display: 'inline-block',
  width: '0.25rem',
  height: '0.25rem',
  marginRight: space.sm,
  borderRadius: '50%',
  backgroundColor: color.textSecondary,
});

export const star = style({
  width: '1em',
  height: '1em',
  marginRight: space['2xs'],
  color: color.warning,
});

export const genres = style({
  marginTop: space['2xs'],
});

export const overview = style({
  marginTop: space.lg,
});

export const block = style({
  marginTop: space.lg,
});

/** The main action and, while the source warms up, its progress underneath. */
export const watch = style({
  display: 'inline-block',
  marginTop: space.md,
});

export const warmup = style({
  marginTop: space.xs,
});

export const seasons = style({
  marginTop: space.xl,
});

export const seasonList = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  marginTop: space.sm,
});

export const seasonItem = style({
  marginBottom: space.xs,
});

/** The episodes pane: its heading, then the list scrolling under it. */
export const episodes = style({
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  minHeight: 0,
});

export const episodeScroll = style({
  flex: '1 1 0%',
  minHeight: 0,
  marginTop: space.sm,
});

export const season = style({
  paddingBottom: space.lg,
});

export const seasonHeading = style({
  marginBottom: space.sm,
});

export const listStatus = style({
  paddingBottom: space.lg,
});
