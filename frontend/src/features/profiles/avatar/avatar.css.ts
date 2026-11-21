import { globalStyle, style } from '@vanilla-extract/css';

export const frame = style({
  position: 'relative',
  width: '100%',
  height: '100%',
});

export const picture = style({
  display: 'block',
  width: '100%',
  height: '100%',
  objectFit: 'contain',
});

/** Shown until (or instead of) a picture: a soft blob in the profile's colour (inline). */
export const placeholder = style({
  position: 'absolute',
  top: '14%',
  right: '18%',
  bottom: '10%',
  left: '18%',
  borderRadius: '46% 46% 42% 42%',
  backgroundImage: 'radial-gradient(circle at 35% 30%, rgba(255, 255, 255, 0.35), transparent 55%)',
});

/** The live Plushie's canvas fills its box (the viewer sets its own size inline). */
export const stage = style({
  position: 'relative',
  width: '100%',
  height: '100%',
});

globalStyle(`${stage} canvas`, {
  display: 'block',
  width: '100% !important',
  height: '100% !important',
});
