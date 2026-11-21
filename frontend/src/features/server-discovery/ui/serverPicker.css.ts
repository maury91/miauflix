import { color, fontFamily, layer, space } from '@shared/design-system/tokens';
import { style } from '@vanilla-extract/css';

/** The whole screen: the TV shows nothing else until it has a server. */
export const page = style({
  position: 'fixed',
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  zIndex: layer.page,
  // Its ScrollArea scrolls, revealing what remote focus reaches
  overflow: 'hidden',
  backgroundColor: color.canvas,
  color: color.text,
  fontFamily,
});

export const column = style({
  boxSizing: 'border-box',
  width: '100%',
  maxWidth: '36rem',
  margin: '0 auto',
  padding: `${space.xl} ${space.lg}`,
});
