import { color, radius, space } from '@shared/design-system/tokens';
import { globalStyle, style } from '@vanilla-extract/css';

/**
 * The sources setup's own parts. Spacing with margins, not flex `gap` (Chromium 69); rows use
 * flex, never grid (style guide, TV).
 */

/** The ways to add a source, one under the other. */
export const options = style({
  margin: 0,
  padding: 0,
  listStyle: 'none',
});

export const optionItem = style({
  selectors: {
    '& + &': { marginTop: space.sm },
  },
});

/** One way to add a source: its card, and the info button beside it. */
export const option = style({
  display: 'flex',
  alignItems: 'center',
});

/** The card is the row's main button: a bordered surface the row's focus outline follows. */
export const card = style({
  flex: '1 1 auto',
  minWidth: 0,
  border: `1px solid ${color.borderSubtle}`,
  borderRadius: radius.md,
  backgroundColor: color.surface,
});

export const optionIcon = style({
  fontSize: '2rem',
  color: color.text,
});

export const chevron = style({
  fontSize: '1.5rem',
  lineHeight: 0,
  color: color.text,
});

export const infoButton = style({
  flex: 'none',
  marginLeft: space.sm,
});

/** What an option is, under its card while the info button is pressed. */
export const info = style({
  margin: `${space.xs} 3.5rem 0 ${space.md}`,
  padding: `${space.sm} ${space.md}`,
  border: `1px solid ${color.borderSubtle}`,
  borderRadius: radius.md,
  backgroundColor: color.surfaceRaised,
});

/** A subpage's numbered steps. */
export const steps = style({
  margin: 0,
  paddingLeft: space.lg,
  color: color.textSecondary,
});
globalStyle(`${steps} > li + li`, { marginTop: space['2xs'] });
globalStyle(`${info} > * + *`, { marginTop: space.xs });
