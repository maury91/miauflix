import { style } from '@vanilla-extract/css';

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
 * Slider (docs/plans/style-guide.md, sections 8.3 and 10): a drawn track and thumb with the native
 * range input laid invisibly over them, so pointer dragging, touch and assistive technology stay
 * native. Sliders cannot invert, so virtual focus is the white outline around the control. The
 * fill grows by `scaleX` and the thumb moves by `translateX`, from inline values, so a change only
 * composites. Right-to-left mirrors the drawing; the native input mirrors itself.
 *
 * - `data-focused`: virtual focus (outline, larger thumb)
 * - `data-disabled`: dimmed, not adjustable
 * - `data-surface="solid" | "overMedia"`: the track on the canvas or over artwork
 *
 * Each selector is its own rule: Chromium 69 drops a whole selector list over one it doesn't know.
 */

const rem = (value: string) => parseFloat(value);
export const thumbSize = 1.25;
const thumbHalf = `${thumbSize / 2}rem`;
const outlineDistance = rem(focusRing.width) + rem(focusRing.offset);

export const root = style({
  display: 'block',
  width: '100%',
  minWidth: '8rem',
  color: color.text,
  fontFamily,
});

export const header = style({
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  marginBottom: space['2xs'],
});

export const label = style({
  minWidth: 0,
  fontSize: typeScale.label.fontSize,
  lineHeight: typeScale.label.lineHeight,
  fontWeight: typeScale.label.fontWeight,
  overflowWrap: 'break-word',
  selectors: {
    [`${root}[data-disabled] &`]: { color: color.textDisabled },
  },
});

export const value = style({
  flex: 'none',
  marginLeft: space.md,
  color: color.textSecondary,
  fontSize: typeScale.body.fontSize,
  lineHeight: typeScale.body.lineHeight,
  whiteSpace: 'nowrap',
  selectors: {
    '[dir="rtl"] &': { marginLeft: 0, marginRight: space.md },
    [`${root}[data-disabled] &`]: { color: color.textDisabled },
  },
});

export const description = style({
  display: 'block',
  marginBottom: space['2xs'],
  color: color.textSecondary,
  fontSize: typeScale.caption.fontSize,
  lineHeight: typeScale.caption.lineHeight,
  selectors: {
    [`${root}[data-disabled] &`]: { color: color.textDisabled },
  },
});

/** The adjustable area: a 2.5rem band holding the track, thumb and native input. */
export const control = style({
  position: 'relative',
  height: '2.5rem',
  selectors: {
    // The focus outline: a pseudo-element around the band, toggled by opacity
    '&::after': {
      content: '""',
      position: 'absolute',
      top: `-${outlineDistance}rem`,
      right: `-${outlineDistance + thumbSize / 4}rem`,
      bottom: `-${outlineDistance}rem`,
      left: `-${outlineDistance + thumbSize / 4}rem`,
      border: `${focusRing.width} solid ${color.focusOutline}`,
      borderRadius: radius.full,
      opacity: 0,
      pointerEvents: 'none',
    },
    [`${root}[data-focused] &::after`]: { opacity: 1 },
  },
});

/** Everything drawn: mirrored as a whole for right-to-left text. */
export const drawing = style({
  position: 'absolute',
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  pointerEvents: 'none',
  selectors: {
    '[dir="rtl"] &': { transform: 'scaleX(-1)' },
  },
});

export const track = style({
  position: 'absolute',
  top: '50%',
  right: 0,
  left: 0,
  height: '0.25rem',
  marginTop: '-0.125rem',
  borderRadius: radius.full,
  backgroundColor: color.borderControl,
  overflow: 'hidden',
  selectors: {
    [`${root}[data-surface="overMedia"] &`]: { backgroundColor: 'rgba(255, 255, 255, 0.4)' },
    [`${root}[data-disabled] &`]: { backgroundColor: color.borderSubtle },
  },
});

/** The thumb travels between half a thumb from each end, where the native thumb's centre does. */
export const rail = style({
  position: 'absolute',
  top: 0,
  right: thumbHalf,
  bottom: 0,
  left: thumbHalf,
});

const fillColor = {
  backgroundColor: color.text,
  selectors: {
    [`${root}[data-tone="brand"] &`]: { backgroundColor: color.brand },
    [`${root}[data-disabled] &`]: { backgroundColor: color.textDisabled },
  },
} as const;

/** The filled start, always under the thumb, so the fill reaches the track's rounded end. */
export const fillCap = style({
  position: 'absolute',
  top: 0,
  bottom: 0,
  left: 0,
  width: thumbHalf,
  ...fillColor,
});

export const fill = style({
  position: 'absolute',
  top: 0,
  bottom: 0,
  left: 0,
  width: '100%',
  transformOrigin: 'left center',
  ...fillColor,
});

/** Spans the rail and moves by a share of its own width, carrying the thumb at its start. */
export const thumbPosition = style({
  position: 'absolute',
  top: 0,
  bottom: 0,
  left: 0,
  width: '100%',
});

export const thumb = style({
  position: 'absolute',
  top: '50%',
  left: `-${thumbHalf}`,
  width: `${thumbSize}rem`,
  height: `${thumbSize}rem`,
  marginTop: `-${thumbHalf}`,
  borderRadius: '50%',
  backgroundColor: color.text,
  transition: `transform ${duration.fast} ${easing.standard}`,
  selectors: {
    [`${root}[data-focused] &`]: { transform: 'scale(1.2)' },
    [`${root}[data-disabled] &`]: { backgroundColor: color.textDisabled },
  },
  '@media': {
    '(prefers-reduced-motion: reduce)': { transition: 'none' },
  },
});

/**
 * A custom thumb glyph (an icon in `1em`), centred on the value by its own size and coloured like
 * the fill; it grows like the round thumb under focus.
 */
export const thumbGlyph = style({
  position: 'absolute',
  top: '50%',
  left: 0,
  display: 'flex',
  color: color.text,
  transform: 'translate(-50%, -50%)',
  transition: `transform ${duration.fast} ${easing.standard}`,
  selectors: {
    [`${root}[data-tone="brand"] &`]: { color: color.brand },
    [`${root}[data-focused] &`]: { transform: 'translate(-50%, -50%) scale(1.2)' },
    [`${root}[data-disabled] &`]: { color: color.textDisabled },
  },
  '@media': {
    '(prefers-reduced-motion: reduce)': { transition: 'none' },
  },
});

/** A tick under the track for each mark. */
export const tick = style({
  position: 'absolute',
  top: '50%',
  width: '0.125rem',
  height: '0.375rem',
  marginTop: '0.3125rem',
  marginLeft: '-0.0625rem',
  backgroundColor: color.borderControl,
});

/** The native range input: invisible, covering the band, its thumb as wide as the drawn one. */
export const nativeInput = style({
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  margin: 0,
  padding: 0,
  opacity: 0,
  cursor: 'pointer',
  WebkitAppearance: 'none',
  MozAppearance: 'none',
  appearance: 'none',
  background: 'transparent',
  WebkitTapHighlightColor: 'transparent',
  selectors: {
    '&:disabled': { cursor: 'default' },
    '&::-webkit-slider-thumb': {
      WebkitAppearance: 'none',
      width: `${thumbSize}rem`,
      height: `${thumbSize}rem`,
    },
    '&::-moz-range-thumb': {
      width: `${thumbSize}rem`,
      height: `${thumbSize}rem`,
      border: 0,
    },
  },
});

/** Mark labels under the band, each centred on its value; the end ones align with the ends. */
export const markLabels = style({
  position: 'relative',
  height: `${rem(typeScale.caption.fontSize) * Number(typeScale.caption.lineHeight)}rem`,
  color: color.textSecondary,
  fontSize: typeScale.caption.fontSize,
  lineHeight: typeScale.caption.lineHeight,
  selectors: {
    '[dir="rtl"] &': { transform: 'scaleX(-1)' },
    [`${root}[data-disabled] &`]: { color: color.textDisabled },
  },
});

export const markLabel = style({
  position: 'absolute',
  top: 0,
  whiteSpace: 'nowrap',
  transform: 'translateX(-50%)',
  selectors: {
    '&[data-edge="start"]': { transform: 'none' },
    '&[data-edge="end"]': { transform: 'translateX(-100%)' },
  },
});

/** Mark text reads forwards inside the mirrored row. */
export const markText = style({
  display: 'inline-block',
  selectors: {
    '[dir="rtl"] &': { transform: 'scaleX(-1)' },
  },
});
