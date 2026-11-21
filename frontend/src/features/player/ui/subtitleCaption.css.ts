import { style } from '@vanilla-extract/css';

/** Gap between the caption and the screen bottom, or the controls when they are open. */
export const EDGE_GAP = '6vh';
export const CONTROLS_GAP = '1.5vh';

export const caption = style({
  position: 'absolute',
  right: 0,
  bottom: EDGE_GAP,
  left: 0,
  padding: '0 10%',
  color: '#fff',
  fontSize: '4.5vh',
  fontWeight: 600,
  lineHeight: 1.3,
  textAlign: 'center',
  whiteSpace: 'pre-line',
  // An outline that keeps white text readable on bright scenes without hiding the picture
  textShadow: [
    '0 0 0.08em #000',
    '0.06em 0.06em 0.06em #000',
    '-0.06em -0.06em 0.06em #000',
    '0.06em -0.06em 0.06em #000',
    '-0.06em 0.06em 0.06em #000',
    '0 0.08em 0.2em rgba(0, 0, 0, 0.8)',
  ].join(', '),
  pointerEvents: 'none',
  transition: 'bottom 0.2s ease',
});
