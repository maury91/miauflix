import { style } from '@vanilla-extract/css';

/**
 * Compiled once at build time (docs/development/css-architecture.md). The card's geometry is in
 * `em` of its own font size, which the component sets inline to width / 18, so no width ever
 * produces a new rule. The component also sets the width itself inline, in exact pixels.
 */

/**
 * Width of the card in its own `em`. Height follows from the 16 / 9 aspect ratio (on the TV, from
 * this width: see legacy-chromium-postcss.ts).
 */
export const CARD_WIDTH_EM = 18;

export const card = style({
  boxSizing: 'border-box',
  display: 'block',
  flex: '0 0 auto',
  width: `${CARD_WIDTH_EM}em`,
  maxWidth: '100%',
  minWidth: 0,
  position: 'relative',
  aspectRatio: '16 / 9',
  padding: 0,
  border: 0,
  borderRadius: 6,
  overflow: 'hidden',
  background: '#141a20',
  color: '#fff',
  fontFamily: "'Poppins', sans-serif",
  textAlign: 'left',
  cursor: 'pointer',
  userSelect: 'none',
  WebkitUserSelect: 'none',
  WebkitTouchCallout: 'none',
  outline: '1px solid transparent',
  transform: 'scale(1)',
  transition: 'transform 150ms ease-out, outline-color 150ms ease-out',
  selectors: {
    // Separate rules: Chromium 69 drops a whole selector list over one unknown pseudo-class
    '&:hover:not(:disabled)': { outlineColor: '#ffffff40', transform: 'scale(1.015)' },
    '&[data-hovered]:not(:disabled)': { outlineColor: '#ffffff40', transform: 'scale(1.015)' },
    '&:focus-visible:not(:disabled)': {
      outline: '3px solid #fff',
      transform: 'scale(1.03)',
      zIndex: 1,
    },
    '&[data-focused]:not(:disabled)': {
      outline: '3px solid #fff',
      transform: 'scale(1.03)',
      zIndex: 1,
    },
    '&:disabled': { cursor: 'default', opacity: 0.45 },
  },
  '@media': {
    '(prefers-reduced-motion: reduce)': { transition: 'none', transform: 'none !important' },
  },
});

export const backdrop = style({
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  objectPosition: 'center',
  borderRadius: 'inherit',
});

export const overlay = style({
  position: 'absolute',
  inset: 0,
  background: 'linear-gradient(transparent 35%, rgba(0, 0, 0, 0.75))',
});

export const logo = style({
  position: 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  width: 'auto',
  height: 'auto',
  maxWidth: '80%',
  maxHeight: '65%',
  objectFit: 'contain',
});

/** Off the TV only: a TV repaints the filter with every card, and filters are costly there. */
export const logoShadow = style({
  filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.65))',
});

export const info = style({
  position: 'absolute',
  inset: 'auto 12px 12px',
  display: 'grid',
  // width / 80 at a font size of width / 18
  gap: '0.225em',
  lineHeight: 1.3,
  fontWeight: 600,
  textShadow: '0 2px 4px #000',
});

export const infoLine = style({
  overflow: 'hidden',
  whiteSpace: 'nowrap',
  textOverflow: 'ellipsis',
});

export const progressTrack = style({
  position: 'absolute',
  inset: 'auto 8px 6px',
  // width / 80 at a font size of width / 18
  height: '0.225em',
  borderRadius: 2,
  overflow: 'hidden',
  background: '#ffffff40',
});

/** Its width, the percentage watched, is set inline. */
export const progressFill = style({
  display: 'block',
  height: '100%',
  background: '#e50920',
});
