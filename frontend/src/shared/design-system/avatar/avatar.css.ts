import { style } from '@vanilla-extract/css';

import { color, fontFamily, radius } from '../tokens';

/**
 * Avatar (docs/plans/style-guide.md, section 8.4): a passive circle holding a picture, or a fallback
 * (the name's first letter on a colour, or custom content) while the picture loads, when there is
 * none and when it fails. The fallback stays under the picture, so loading never shows a hole.
 *
 * - `data-size="sm" | "md" | "lg" | "xl" | "fill"`: 2, 2.5, 4 and 8rem, or the container's width
 *   (a square tile frame); the letter scales with the size
 * - `data-fit="cover" | "contain"`
 */

const sizes = { sm: '2rem', md: '2.5rem', lg: '4rem', xl: '8rem' } as const;

const sizeSelectors: Record<string, { width: string; height: string; fontSize: string }> = {};
for (const [size, side] of Object.entries(sizes)) {
  sizeSelectors[`&[data-size="${size}"]`] = {
    width: side,
    height: side,
    fontSize: `${parseFloat(side) * 0.45}rem`,
  };
}

export const avatar = style({
  position: 'relative',
  display: 'inline-block',
  verticalAlign: 'middle',
  flex: 'none',
  overflow: 'hidden',
  borderRadius: radius.full,
  backgroundColor: color.surfaceRaised,
  color: color.text,
  fontFamily,
  fontWeight: 600,
  lineHeight: 1,
  selectors: {
    ...sizeSelectors,
    '&[data-size="fill"]': {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      fontSize: '3rem',
    },
  },
});

export const fallback = style({
  position: 'absolute',
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  textTransform: 'uppercase',
});

export const image = style({
  position: 'absolute',
  top: 0,
  left: 0,
  display: 'block',
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  selectors: {
    [`${avatar}[data-fit="contain"] &`]: { objectFit: 'contain' },
    // Until decoded the fallback shows through; a broken image is removed
    [`${avatar}:not([data-status="loaded"]) &`]: { opacity: 0 },
  },
});
