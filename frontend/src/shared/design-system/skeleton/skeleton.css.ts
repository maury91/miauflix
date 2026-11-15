import { keyframes, style, type StyleRule } from '@vanilla-extract/css';

import { color, radius, typeScale } from '../tokens';

/**
 * Skeleton (docs/plans/style-guide.md, section 8.5): placeholder geometry for content that is
 * loading. Each shape takes exactly the box of what replaces it (the same ratios as Artwork, the
 * same sizes as Avatar, a text role's line height), so nothing moves when the content arrives.
 *
 * The pulse animates only opacity, so it composites. A SkeletonGroup pulses once for all of its
 * placeholders (one layer instead of one per placeholder). Reduced motion keeps them still.
 *
 * - `data-shape="text" | "box" | "circle"`
 * - `data-surface="solid" | "overMedia"`: the fill on the canvas or over artwork
 * - `data-ratio`, `data-size`, `data-radius`, `data-type`: the shape's geometry
 *
 * Each selector is its own rule: Chromium 69 drops a whole selector list over one it doesn't know.
 */

const pulse = keyframes({
  '0%': { opacity: 1 },
  '50%': { opacity: 0.5 },
  '100%': { opacity: 1 },
});

const pulseAnimation = `${pulse} 1.6s ease-in-out infinite`;

export const group = style({
  animation: pulseAnimation,
  '@media': {
    '(prefers-reduced-motion: reduce)': { animation: 'none' },
  },
});

const fill = {
  solid: color.surfaceRaised,
  // White at low opacity reads as a placeholder over any artwork
  overMedia: 'rgba(255, 255, 255, 0.16)',
};

const avatarSizes = { sm: '2rem', md: '2.5rem', lg: '4rem', xl: '8rem' } as const;
const ratios = { landscape: '56.25%', portrait: '150%', square: '100%' } as const;

const selectors: StyleRule['selectors'] = {
  [`&[data-surface="overMedia"]`]: { backgroundColor: fill.overMedia },
  // Inside a group only the group pulses
  [`${group} &`]: { animation: 'none' },
};
for (const [ratio, paddingTop] of Object.entries(ratios)) {
  // On a child, so the percentage resolves against the placeholder's own width, not its parent's
  // (a given `width` keeps the ratio)
  selectors[`&[data-ratio="${ratio}"]::before`] = { content: '""', display: 'block', paddingTop };
}
for (const [size, side] of Object.entries(avatarSizes)) {
  selectors[`&[data-size="${size}"]`] = { width: side, height: side };
}
for (const [name, value] of Object.entries(radius)) {
  selectors[`&[data-radius="${name}"]`] = { borderRadius: value };
}

/** A box or a circle; text uses `textBlock` and `line`. */
export const shape = style({
  display: 'block',
  boxSizing: 'border-box',
  width: '100%',
  borderRadius: radius.md,
  backgroundColor: fill.solid,
  animation: pulseAnimation,
  selectors: {
    ...selectors,
    '&[data-ratio="fill"]': { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
    '&[data-shape="circle"]': { flex: 'none', borderRadius: '50%' },
    '&[data-size="fill"]': { height: 0, paddingTop: '100%' },
  },
  '@media': {
    '(prefers-reduced-motion: reduce)': { animation: 'none' },
  },
});

export const textBlock = style({
  // A flex column: the lines' margins never collapse, so each line keeps its full line height
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
  animation: pulseAnimation,
  selectors: {
    [`${group} &`]: { animation: 'none' },
  },
  '@media': {
    '(prefers-reduced-motion: reduce)': { animation: 'none' },
  },
});

const rem = (value: string) => parseFloat(value);
const lineSelectors: StyleRule['selectors'] = {
  [`${textBlock}[data-surface="overMedia"] > &`]: { backgroundColor: fill.overMedia },
  // The last of several lines is shorter, as a paragraph's usually is
  '&:last-child:not(:first-child)': { width: '60%' },
};
for (const [role, { fontSize, lineHeight }] of Object.entries(typeScale)) {
  const size = rem(fontSize);
  // The bar is one font size tall; the margins make up the role's line height
  const margin = `${(size * (Number(lineHeight) - 1)) / 2}rem`;
  lineSelectors[`${textBlock}[data-type="${role}"] > &`] = {
    height: fontSize,
    marginTop: margin,
    marginBottom: margin,
  };
}

/** One line of text: the role's font size tall, spaced to its line height. */
export const line = style({
  display: 'block',
  width: '100%',
  borderRadius: radius.sm,
  backgroundColor: fill.solid,
  selectors: lineSelectors,
});
