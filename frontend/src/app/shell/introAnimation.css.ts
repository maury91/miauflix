import { style } from '@vanilla-extract/css';

/** The whole screen, the wordmark centred; `data-low-resource` drops the compositing hints. */
export const container = style({
  position: 'fixed',
  left: 0,
  top: 0,
  width: '100vw',
  height: '100vh',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  willChange: 'transform, opacity, filter',
  backfaceVisibility: 'hidden',
  perspective: '1000px',
  contain: 'layout style paint',
  zIndex: 1002,
  selectors: {
    '&[data-low-resource]': {
      willChange: 'auto',
      backfaceVisibility: 'visible',
      perspective: 'none',
      contain: 'none',
    },
  },
});
