import { style } from '@vanilla-extract/css';

import { color, duration, easing, radius } from '../tokens';

/**
 * Artwork (docs/plans/style-guide.md, section 8.4): an image whose geometry never depends on it. The
 * box takes its ratio through padding (no `aspect-ratio`, so Chromium 69 needs no rewrite), shows a
 * `surfaceRaised` placeholder while loading, fades the image in with opacity once decoded, and shows
 * the fallback in the same box when there is no image or it fails. States are attributes:
 *
 * - `data-ratio="landscape" | "portrait" | "square" | "fill"`: 16:9, 2:3, 1:1, or covering its
 *   positioned container (a tile's frame, a hero)
 * - `data-status="loading" | "loaded" | "failed"`
 * - `data-fit="cover" | "contain"`
 * - `data-instant` on the image: it replaces a held picture, so it shows without fading in
 */

export const artwork = style({
  position: 'relative',
  display: 'block',
  overflow: 'hidden',
  backgroundColor: color.surfaceRaised,
  selectors: {
    '&[data-ratio="landscape"]': { height: 0, paddingTop: '56.25%', borderRadius: radius.md },
    '&[data-ratio="portrait"]': { height: 0, paddingTop: '150%', borderRadius: radius.md },
    '&[data-ratio="square"]': { height: 0, paddingTop: '100%', borderRadius: radius.md },
    '&[data-ratio="fill"]': {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      borderRadius: 'inherit',
    },
  },
});

export const image = style({
  position: 'absolute',
  top: 0,
  left: 0,
  display: 'block',
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  objectPosition: 'center',
  opacity: 0,
  transition: `opacity ${duration.standard} ${easing.standard}`,
  selectors: {
    [`${artwork}[data-fit="contain"] &`]: { objectFit: 'contain' },
    [`${artwork}[data-status="loaded"] &`]: { opacity: 1 },
    // Replacing a held picture: shown at once, or the box would show through the fade
    '&[data-instant]': { transition: 'none' },
  },
  '@media': {
    '(prefers-reduced-motion: reduce)': { transition: 'none' },
  },
});

/** The previous picture, kept in view under a new one still loading (`holdPrevious`). */
export const heldImage = style([image, { opacity: 1, transition: 'none' }]);

/** The fallback fills the same box, centred: a title, an icon, a logo. */
export const fallback = style({
  position: 'absolute',
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: color.textSecondary,
  textAlign: 'center',
});
