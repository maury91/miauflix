import { globalStyle, style, type StyleRule } from '@vanilla-extract/css';

import {
  color,
  duration,
  easing,
  focusRing,
  fontFamily,
  radius,
  space,
  typeScale,
} from '../tokens';

/**
 * Checkbox, Radio and Switch (docs/plans/style-guide.md, section 4 and 8.2). Choices cannot invert,
 * so virtual focus is the white outline, drawn around the whole choice (indicator and label) so it
 * reads at TV distance. Selection is a fill: the indicator turns white with a dark mark, never the
 * brand color. Every state is a static rule on an attribute of the choice:
 *
 * - `data-focused`: virtual focus (outline)
 * - `data-checked` / `data-mixed`: selection
 * - `data-invalid`: danger border on the indicator
 * - `data-disabled`: dimmed, no pointer
 *
 * Each selector is its own rule: Chromium 69 drops a whole selector list over one it doesn't know.
 */

const rem = (value: string) => parseFloat(value);
const outlineDistance = rem(focusRing.width) + rem(focusRing.offset);
/** The outline sits this far outside the choice's own box, so it never touches the text. */
const outlinePadding = rem(space['2xs']);
const outlineInset = `-${outlineDistance + outlinePadding}rem`;

/** The indicator is as tall as one line of label text. */
const lineHeight = `${rem(typeScale.body.fontSize) * rem(typeScale.body.lineHeight)}rem`;
const indicatorSize = '1.25rem';
const indicatorBorder = '0.125rem';

export const choice = style({
  position: 'relative',
  // Hugs its content, so the outline wraps the choice; a switch row spans its container
  display: 'inline-flex',
  verticalAlign: 'top',
  alignItems: 'flex-start',
  minWidth: 0,
  fontFamily,
  color: color.text,
  cursor: 'pointer',
  userSelect: 'none',
  WebkitUserSelect: 'none',
  WebkitTapHighlightColor: 'transparent',
  selectors: {
    '&[data-end]': { display: 'flex', justifyContent: 'space-between' },
    '&[data-disabled]': { color: color.textDisabled, cursor: 'default' },
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

/** Label and description. */
export const text = style({
  display: 'flex',
  flexDirection: 'column',
  minWidth: 0,
});

export const label = style({
  fontSize: typeScale.body.fontSize,
  lineHeight: typeScale.body.lineHeight,
});

export const description = style({
  color: color.textSecondary,
  fontSize: typeScale.caption.fontSize,
  lineHeight: typeScale.caption.lineHeight,
  selectors: {
    [`${choice}[data-disabled] &`]: { color: color.textDisabled },
  },
});

/** Holds the indicator, one line tall, so it centres on the label's first line. */
export const indicatorSlot = style({
  position: 'relative',
  display: 'flex',
  flex: 'none',
  alignItems: 'center',
  height: lineHeight,
  marginRight: space.sm,
  selectors: {
    '[dir="rtl"] &': { marginRight: 0, marginLeft: space.sm },
    [`${choice}[data-end] &`]: { order: 1, marginRight: 0, marginLeft: space.md },
    [`[dir="rtl"] ${choice}[data-end] &`]: { marginLeft: 0, marginRight: space.md },
  },
});

/** The native input, invisible over the indicator: semantics, forms and clicks stay native. */
export const nativeInput = style({
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  margin: 0,
  opacity: 0,
  cursor: 'inherit',
});

const checkedFill: StyleRule = {
  backgroundColor: color.text,
  borderColor: color.text,
  color: color.canvas,
};

const boxBase: StyleRule = {
  boxSizing: 'border-box',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: indicatorSize,
  height: indicatorSize,
  border: `${indicatorBorder} solid ${color.borderControl}`,
  backgroundColor: 'transparent',
  color: 'transparent',
  fontSize: '1rem',
  lineHeight: 0,
};

const markSelectors = (shape: 'box' | 'circle'): Record<string, StyleRule> => ({
  [`${choice}[data-checked] &`]: shape === 'box' ? checkedFill : { borderColor: color.text },
  [`${choice}[data-mixed] &`]: checkedFill,
  [`${choice}[data-invalid] &`]: { borderColor: color.danger },
  [`${choice}[data-disabled] &`]: { borderColor: color.borderSubtle },
  [`${choice}[data-disabled][data-checked] &`]:
    shape === 'box'
      ? { backgroundColor: color.textDisabled, borderColor: color.textDisabled }
      : { borderColor: color.textDisabled },
});

export const checkbox = style({
  ...boxBase,
  borderRadius: radius.sm,
  selectors: markSelectors('box'),
});

export const radio = style({
  ...boxBase,
  borderRadius: radius.full,
  selectors: markSelectors('circle'),
});

/** The radio's dot, scaled in when selected. */
export const radioDot = style({
  width: '0.625rem',
  height: '0.625rem',
  borderRadius: radius.full,
  backgroundColor: color.text,
  transform: 'scale(0)',
  transition: `transform ${duration.fast} ${easing.standard}`,
  selectors: {
    [`${choice}[data-checked] &`]: { transform: 'scale(1)' },
    [`${choice}[data-disabled] &`]: { backgroundColor: color.textDisabled },
  },
  '@media': {
    '(prefers-reduced-motion: reduce)': { transition: 'none' },
  },
});

const trackWidth = 2.25;
const trackHeight = 1.25;
const thumbSize = 0.875;
const thumbInset = (trackHeight - thumbSize) / 2 - rem(indicatorBorder);
const thumbTravel = trackWidth - thumbSize - 2 * (thumbInset + rem(indicatorBorder));

export const track = style({
  position: 'relative',
  boxSizing: 'border-box',
  width: `${trackWidth}rem`,
  height: `${trackHeight}rem`,
  border: `${indicatorBorder} solid ${color.borderControl}`,
  borderRadius: radius.full,
  backgroundColor: color.control,
  selectors: markSelectors('box'),
});

/** Moves by transform only; mirrored for right-to-left text. */
export const thumb = style({
  position: 'absolute',
  top: `${thumbInset}rem`,
  left: `${thumbInset}rem`,
  width: `${thumbSize}rem`,
  height: `${thumbSize}rem`,
  borderRadius: radius.full,
  backgroundColor: color.text,
  transition: `transform ${duration.fast} ${easing.standard}`,
  selectors: {
    [`${choice}[data-checked] &`]: {
      backgroundColor: color.canvas,
      transform: `translateX(${thumbTravel}rem)`,
    },
    [`[dir="rtl"] ${choice} &`]: { left: 'auto', right: `${thumbInset}rem` },
    [`[dir="rtl"] ${choice}[data-checked] &`]: { transform: `translateX(-${thumbTravel}rem)` },
    [`${choice}[data-disabled] &`]: { backgroundColor: color.textDisabled },
    [`${choice}[data-disabled][data-checked] &`]: { backgroundColor: color.borderSubtle },
  },
  '@media': {
    '(prefers-reduced-motion: reduce)': { transition: 'none' },
  },
});

/** A group of choices: a fieldset with its legend as the label. */
export const group = style({
  minWidth: 0,
  margin: 0,
  padding: 0,
  border: 0,
  fontFamily,
});

export const options = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  // Room for the outline between choices
  selectors: {
    '&[data-orientation="horizontal"]': { flexDirection: 'row', flexWrap: 'wrap' },
  },
});

/** A row's facts at its end, after the text. */
export const metadata = style({
  display: 'flex',
  flex: 'none',
  alignItems: 'center',
  marginLeft: 'auto',
  paddingLeft: space.sm,
  selectors: {
    '[dir="rtl"] &': { marginLeft: 0, marginRight: 'auto', paddingLeft: 0, paddingRight: space.sm },
  },
});

export const option = style({
  margin: `${space.xs} 0`,
  selectors: {
    [`${options}[data-orientation="horizontal"] &`]: { margin: `${space.xs} ${space.lg} 0 0` },
    [`[dir="rtl"] ${options}[data-orientation="horizontal"] &`]: {
      margin: `${space.xs} 0 0 ${space.lg}`,
    },
  },
});

/*
 * `rows`: each option a full-width row on a quiet fill (a panel's list), selected rows on a
 * stronger one. The outline stays the focus mark; selection is the fill and the white indicator.
 */
globalStyle(`${options}[data-appearance="rows"]`, { alignItems: 'stretch' });
globalStyle(`${options}[data-appearance="rows"] > ${option}`, { margin: `0 0 ${space.xs}` });
globalStyle(`${options}[data-appearance="rows"] ${choice}`, {
  display: 'flex',
  alignItems: 'center',
  boxSizing: 'border-box',
  width: '100%',
  minHeight: '3rem',
  padding: `${space.xs} ${space.md}`,
  borderRadius: radius.md,
  backgroundColor: color.surfaceHover,
  transition: `background-color ${duration.fast} ${easing.standard}`,
});
globalStyle(`${options}[data-appearance="rows"] ${choice}[data-checked]`, {
  backgroundColor: color.borderSubtle,
});
globalStyle(`${options}[data-appearance="rows"] ${choice}::after`, {
  top: `-${outlineDistance}rem`,
  right: `-${outlineDistance}rem`,
  bottom: `-${outlineDistance}rem`,
  left: `-${outlineDistance}rem`,
});
