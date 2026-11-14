import { style } from '@vanilla-extract/css';

import { color, radius } from '../tokens';

/**
 * Avatar (docs/plans/style-guide.md, section 8.4): a passive circle holding a picture. Until the
 * picture has loaded (and if it fails) the circle shows its colour and optional placeholder, so it
 * never changes size or leaves a hole.
 *
 * - `data-size="sm" | "md" | "lg" | "xl" | "fill"`: 2, 2.5, 4 and 8rem, or the container (a square
 *   tile frame)
 * - `data-fit="cover" | "contain"`
 * - `data-status="loading" | "loaded" | "failed"`
 */

const sizes = { sm: '2rem', md: '2.5rem', lg: '4rem', xl: '8rem' } as const;

const sizeSelectors: Record<string, { width: string; height: string }> = {};
for (const [size, side] of Object.entries(sizes)) {
  sizeSelectors[`&[data-size="${size}"]`] = { width: side, height: side };
}

export const avatar = style({
  position: 'relative',
  display: 'inline-block',
  verticalAlign: 'middle',
  flex: 'none',
  overflow: 'hidden',
  borderRadius: radius.full,
  backgroundColor: color.surfaceRaised,
  selectors: {
    ...sizeSelectors,
    '&[data-size="fill"]': {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    },
  },
});

export const placeholder = style({
  position: 'absolute',
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
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
    // Until decoded the colour and placeholder show through
    [`${avatar}:not([data-status="loaded"]) &`]: { opacity: 0 },
  },
});
