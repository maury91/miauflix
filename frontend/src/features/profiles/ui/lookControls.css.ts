import { radius, space } from '@shared/design-system/tokens';
import { globalStyle, style } from '@vanilla-extract/css';

/**
 * The Plushie part pictures shown in the profile editor's ChoiceTileGroups (the tiles themselves
 * are the design system's): sprite sheet crops, a fabric-filled outline for each shape and the fur
 * tint. Ratios come from padding (no `aspect-ratio` on Chromium 69); colours and masks are inline.
 */

const fill = { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 } as const;

/** One part control after another in a tab. */
export const controls = style({});
globalStyle(`${controls} > * + *`, { marginTop: space.lg });

/** A 4:3 picture. */
export const pictureArea = style({
  position: 'relative',
  display: 'block',
  width: '100%',
  paddingBottom: '75%',
  overflow: 'hidden',
  borderRadius: radius.sm,
  // The tint blends with the picture only
  isolation: 'isolate',
});

/** The "none" sign in place of a picture. */
globalStyle(`${pictureArea} > svg`, {
  position: 'absolute',
  top: '50%',
  left: '50%',
  width: '42%',
  height: '42%',
  transform: 'translate(-50%, -50%)',
  opacity: 0.45,
});

export const sheetImage = style({
  position: 'absolute',
  maxWidth: 'none',
  pointerEvents: 'none',
  userSelect: 'none',
});

/** Recolours a picture to the fur colour, keeping its light and shade; masked to its shape. */
export const tint = style({
  position: 'absolute',
  mixBlendMode: 'color',
  pointerEvents: 'none',
});

/** A square for a shape, a share of the tile's width. */
export const shapeArea = style({
  position: 'relative',
  display: 'block',
  width: '70%',
  margin: '0 auto',
  paddingBottom: '70%',
});

/** The shape filled with the chosen fabric: the outline masks the fabric's picture. */
export const shapeFill = style({
  ...fill,
  overflow: 'hidden',
  isolation: 'isolate',
  WebkitMaskPosition: 'center',
  maskPosition: 'center',
  WebkitMaskSize: '100% 100%',
  maskSize: '100% 100%',
  WebkitMaskRepeat: 'no-repeat',
  maskRepeat: 'no-repeat',
});

/** Recolours the fabric to the fur colour. */
export const fabricTint = style({ ...fill, mixBlendMode: 'color' });

/** A soft light from the top left and shade below, so the flat fabric reads as stuffed. */
export const volume = style({
  ...fill,
  background:
    'radial-gradient(circle at 32% 26%, rgba(255, 255, 255, 0.28), transparent 55%), radial-gradient(circle at 60% 100%, rgba(0, 0, 0, 0.3), transparent 60%)',
});
