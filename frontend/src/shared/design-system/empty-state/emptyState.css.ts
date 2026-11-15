import { globalStyle, style } from '@vanilla-extract/css';

import { color, fontFamily, space, typeScale } from '../tokens';

/**
 * EmptyState (docs/plans/style-guide.md, section 8.5): absent content, centred: a visual, a
 * heading, a short body, actions and an optional Message. A layout, not an error primitive.
 */

export const emptyState = style({
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  maxWidth: '32rem',
  margin: '0 auto',
  padding: `${space.xl} ${space.lg}`,
  color: color.text,
  fontFamily,
  textAlign: 'center',
});

export const visual = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  marginBottom: space.lg,
  color: color.textSecondary,
  // Icons are 1em
  fontSize: '4rem',
  lineHeight: 0,
});

export const heading = style({
  margin: 0,
  fontSize: typeScale.heading.fontSize,
  lineHeight: typeScale.heading.lineHeight,
  fontWeight: typeScale.heading.fontWeight,
  // The app's global heading rule uppercases and lightens h1–h6
  fontStyle: 'normal',
  textTransform: 'none',
  overflowWrap: 'break-word',
});

export const body = style({
  margin: `${space.xs} 0 0`,
  color: color.textSecondary,
  fontSize: typeScale.body.fontSize,
  lineHeight: typeScale.body.lineHeight,
});

export const message = style({
  alignSelf: 'stretch',
  marginTop: space.lg,
  textAlign: 'start',
});

export const actions = style({
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'center',
  marginTop: space.md,
});

// Actions are spaced without wrappers; the first is the primary one (focus lands there)
globalStyle(`${actions} > *`, { margin: `${space.xs} ${space.xs} 0` });
