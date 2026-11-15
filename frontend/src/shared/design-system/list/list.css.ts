import { globalStyle, style } from '@vanilla-extract/css';

import { color, focusRing, fontFamily, radius, space, typeScale } from '../tokens';

/**
 * List rows (docs/plans/style-guide.md, section 8.4): ListItem and SettingRow share this geometry.
 * Rows cannot invert, so virtual focus on the row's primary part is the white outline around the
 * row; a trailing action shows its own white fill instead. States are attributes on the row:
 *
 * - `data-focused`: virtual focus on the primary part (outline)
 * - `data-selected`: the current item, a quiet fill
 * - `data-disabled`: dimmed, not activatable
 * - `data-interactive`: the primary part is a button or link (pointer cursor)
 *
 * Each selector is its own rule: Chromium 69 drops a whole selector list over one it doesn't know.
 */

const rem = (value: string) => parseFloat(value);
const outlineDistance = rem(focusRing.width) + rem(focusRing.offset);
const outlineInset = `-${outlineDistance}rem`;

export const list = style({
  display: 'flex',
  flexDirection: 'column',
  margin: 0,
  padding: 0,
  listStyle: 'none',
  selectors: {
    // Room between rows so one row's outline never covers the next row's content
    '&:not([data-divided])': { paddingTop: space['2xs'], paddingBottom: space['2xs'] },
  },
});

export const row = style({
  position: 'relative',
  display: 'flex',
  alignItems: 'stretch',
  minWidth: 0,
  borderRadius: radius.md,
  color: color.text,
  fontFamily,
  selectors: {
    [`${list}:not([data-divided]) > &:not(:last-child)`]: { marginBottom: space['2xs'] },
    [`${list}[data-divided] > &:not(:first-child)`]: {
      borderTop: `0.0625rem solid ${color.borderSubtle}`,
      borderTopLeftRadius: 0,
      borderTopRightRadius: 0,
    },
    '&[data-selected]': { backgroundColor: color.surfaceHover },
    '&[data-disabled]': { color: color.textDisabled },
    '&[data-focused]': { zIndex: 1 },
    // The focus outline: a pseudo-element following the radius, toggled by opacity
    '&::after': {
      content: '""',
      position: 'absolute',
      top: outlineInset,
      right: outlineInset,
      bottom: outlineInset,
      left: outlineInset,
      border: `${focusRing.width} solid ${color.focusOutline}`,
      borderRadius: `${rem(radius.md) + outlineDistance}rem`,
      opacity: 0,
      pointerEvents: 'none',
    },
    '&[data-focused]::after': { opacity: 1 },
  },
});

/** The primary part: a button, a link or a plain container, covering the row up to the actions. */
export const primary = style({
  boxSizing: 'border-box',
  display: 'flex',
  flex: '1 1 auto',
  alignItems: 'center',
  minWidth: 0,
  minHeight: '3.5rem',
  margin: 0,
  border: 0,
  padding: `${space.sm} ${space.md}`,
  borderRadius: 'inherit',
  backgroundColor: 'transparent',
  color: 'inherit',
  font: 'inherit',
  textAlign: 'inherit',
  textDecoration: 'none',
  // Focus is virtual and shown by the row's outline
  outline: 'none',
  WebkitTapHighlightColor: 'transparent',
  selectors: {
    [`${row}[data-interactive] &`]: { cursor: 'pointer' },
    [`${row}[data-disabled] &`]: { cursor: 'default' },
    [`${row}[data-trailing] &`]: { paddingRight: space.xs },
    [`[dir="rtl"] ${row}[data-trailing] &`]: { paddingRight: space.md, paddingLeft: space.xs },
  },
});

/** A leading visual: icon, avatar or artwork. Icons are 1em, sized here. */
export const leading = style({
  display: 'flex',
  flex: 'none',
  alignItems: 'center',
  justifyContent: 'center',
  marginRight: space.md,
  color: color.textSecondary,
  fontSize: '1.5rem',
  lineHeight: 0,
  selectors: {
    '[dir="rtl"] &': { marginRight: 0, marginLeft: space.md },
    [`${row}[data-disabled] &`]: { color: color.textDisabled },
  },
});

export const text = style({
  display: 'flex',
  flex: '1 1 auto',
  flexDirection: 'column',
  minWidth: 0,
  overflowWrap: 'break-word',
});

export const title = style({
  fontSize: typeScale.label.fontSize,
  lineHeight: typeScale.label.lineHeight,
  fontWeight: typeScale.label.fontWeight,
});

export const description = style({
  marginTop: space['2xs'],
  color: color.textSecondary,
  fontSize: typeScale.caption.fontSize,
  lineHeight: typeScale.caption.lineHeight,
  selectors: {
    [`${row}[data-disabled] &`]: { color: color.textDisabled },
  },
});

/** Short facts at the end of the primary part: a duration, a date, a status. */
export const metadata = style({
  flex: 'none',
  marginLeft: space.md,
  color: color.textSecondary,
  fontSize: typeScale.caption.fontSize,
  lineHeight: typeScale.caption.lineHeight,
  whiteSpace: 'nowrap',
  selectors: {
    '[dir="rtl"] &': { marginLeft: 0, marginRight: space.md },
  },
});

/** Trailing actions: siblings of the primary part, never inside it. */
export const trailing = style({
  display: 'flex',
  flex: 'none',
  alignItems: 'center',
  paddingRight: space.sm,
  selectors: {
    '[dir="rtl"] &': { paddingRight: 0, paddingLeft: space.sm },
  },
});

/** Trailing actions are spaced without wrappers, mirrored for right-to-left text. */
globalStyle(`${trailing} > * + *`, { marginLeft: space['2xs'] });
globalStyle(`[dir="rtl"] ${trailing} > * + *`, { marginLeft: 0, marginRight: space['2xs'] });

/** SettingRow: text first, then the value and control; the control wraps below when narrow. */
export const setting = style({
  boxSizing: 'border-box',
  display: 'flex',
  flex: '1 1 auto',
  flexWrap: 'wrap',
  alignItems: 'center',
  minWidth: 0,
  minHeight: '3.5rem',
  padding: `${space.sm} ${space.md}`,
});

export const settingText = style({
  display: 'flex',
  flex: '1 1 12rem',
  flexDirection: 'column',
  minWidth: 0,
  overflowWrap: 'break-word',
});

export const settingControl = style({
  display: 'flex',
  flex: 'none',
  alignItems: 'center',
  marginLeft: space.md,
  selectors: {
    '[dir="rtl"] &': { marginLeft: 0, marginRight: space.md },
  },
});

export const settingValue = style({
  marginRight: space.sm,
  color: color.textSecondary,
  fontSize: typeScale.body.fontSize,
  lineHeight: typeScale.body.lineHeight,
  selectors: {
    '[dir="rtl"] &': { marginRight: 0, marginLeft: space.sm },
  },
});

/** A toggle setting: the Switch is the row's content and draws its own outline. */
export const settingToggle = style({
  flex: '1 1 auto',
  minWidth: 0,
  padding: `${space.sm} ${space.md}`,
});
