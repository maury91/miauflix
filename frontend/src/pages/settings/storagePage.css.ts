import { color, radius, space } from '@shared/design-system/tokens';
import { globalStyle, style } from '@vanilla-extract/css';

/** Status and errors, spaced with margins (Chromium 69 has no flex `gap`). */
export const section = style({
  marginBottom: space.xl,
});

/** The settings card, under the disk bar it changes. */
export const settings = style({
  marginTop: space.lg,
});

/** Reserves its line so announcing a result doesn't push the list down. */
export const status = style({
  minHeight: '1.5em',
  margin: `${space.sm} 0`,
  color: color.textSecondary,
});

/** "Sort by" beside its picker, which names it for assistive technology. */
export const sort = style({
  display: 'flex',
  alignItems: 'center',
});
globalStyle(`${sort} > span`, { flex: 'none', marginRight: space.sm });
globalStyle(`${sort} > :last-child`, { minWidth: '13rem' });

/** A landscape still beside each download, the row's leading visual. */
export const thumbnail = style({
  display: 'block',
  width: '8rem',
  borderRadius: radius.sm,
  overflow: 'hidden',
  fontSize: '1.5rem',
  '@media': { '(max-width: 37.5em)': { width: '5.5rem' } },
});

export const details = style({});
globalStyle(`${details} > span`, { display: 'block' });
globalStyle(`${details} > * + *`, { marginTop: space['2xs'] });

/** How much has downloaded, drawn as ProgressBar's hairline; the text says it too. */
export const progress = style({
  display: 'block',
  maxWidth: '20rem',
  height: '0.25rem',
  overflow: 'hidden',
  borderRadius: radius.full,
  backgroundColor: color.control,
});

export const progressFill = style({
  display: 'block',
  height: '100%',
  backgroundColor: color.brand,
  transformOrigin: 'left center',
});

export const legend = style({
  marginTop: space.md,
});
