import { style } from '@vanilla-extract/css';

/** The wordmark's letters, each sized and spaced to the drawing (IntroAnimation moves them one by one). */
export const text = style({
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'flex-start',
  position: 'relative',
  letterSpacing: 0,
  fill: '#db202c',
  stroke: '#db202c',
  margin: 0,
});

export const m = style({
  margin: '0 0.04em 0 0',
  height: '1em',
});

export const i = style({
  margin: '0 0.02em 0 0.065em',
  height: '0.92em',
});

export const a = style({
  margin: '0 0.04em',
  height: '0.9em',
});

export const u = style({
  margin: '0 0.045em',
  height: '0.88em',
});

export const f = style({
  margin: '0 0.045em',
  height: '0.87em',
});

export const l = style({
  margin: '0 0.04em',
  height: '0.9em',
});

export const i2 = style({
  margin: '0 0.045em',
  height: '0.915em',
});

export const x = style({
  margin: '0 0em 0 0.055em',
  height: '1em',
});
