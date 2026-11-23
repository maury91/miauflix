import { centeredLogoSize } from '@shared/brand/logo/logo.css';
import { style } from '@vanilla-extract/css';

/** The whole screen, above every page, the wordmark centred. */
export const stage = style({
  position: 'fixed',
  left: 0,
  top: 0,
  width: '100vw',
  height: '100vh',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  zIndex: 1002,
});

export const backdrop = style({
  position: 'absolute',
  // Not `inset`: the TV's Chromium 69 doesn't know it
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  background: 'black',
  // Its own layer: the compositor fades it, the TV does not repaint the screen every frame
  willChange: 'opacity',
});

/** Where the wordmark sits: the size and place of the centred logo image (Logo, intro position). */
export const logo = style([
  centeredLogoSize,
  {
    position: 'relative',
    // The compositor moves the wordmark instead of repainting it every frame
    willChange: 'transform',
  },
]);

export const svg = style({ display: 'block', width: '100%', height: 'auto' });
