/** `logo.svg`'s viewBox, in its own drawing units. */
export const LOGO_VIEWBOX = { x: 20.129, y: 227.599, width: 255.72, height: 70.204 } as const;

export type LogoLetter = 'm' | 'i' | 'a' | 'u' | 'f' | 'l' | 'i2' | 'x';

/**
 * Each letter's bounding box in `logo.svg` units (measured from its paths). The intro letters
 * (`LogoGlyphs`) use these as their viewBoxes, so placing them here redraws `logo.svg` exactly.
 */
export const LOGO_LETTER_BOXES: Record<
  LogoLetter,
  { x: number; y: number; width: number; height: number }
> = {
  m: { x: 20.129, y: 227.675, width: 35.435, height: 70.128 },
  i: { x: 60.789, y: 227.729, width: 10.599, height: 65.095 },
  a: { x: 76.698, y: 227.719, width: 31.565, height: 63.869 },
  u: { x: 112.959, y: 227.599, width: 32.5, height: 61.681 },
  f: { x: 151.339, y: 227.766, width: 29.16, height: 60.727 },
  l: { x: 186.379, y: 227.709, width: 28.36, height: 63.221 },
  i2: { x: 220.555, y: 227.774, width: 10.44, height: 64.777 },
  x: { x: 236.4, y: 227.68, width: 39.449, height: 70.042 },
};

/** Windows at most this wide use the narrow layout (matches the logo's media query). */
export const NARROW_MAX_WIDTH_PX = 720;
/** Height of the centred (intro and loading) logo. */
export const INTRO_LOGO_HEIGHT_PX = 130;
export const INTRO_LOGO_HEIGHT_NARROW_PX = 70;

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Where the centred logo is drawn in a window of this size. */
export function introLogoRect({ width, height }: { width: number; height: number }): Rect {
  const logoHeight =
    width <= NARROW_MAX_WIDTH_PX ? INTRO_LOGO_HEIGHT_NARROW_PX : INTRO_LOGO_HEIGHT_PX;
  const logoWidth = (logoHeight * LOGO_VIEWBOX.width) / LOGO_VIEWBOX.height;
  return {
    left: (width - logoWidth) / 2,
    top: (height - logoHeight) / 2,
    width: logoWidth,
    height: logoHeight,
  };
}

/** Where each letter of the centred logo is drawn, so the intro starts exactly on top of it. */
export function introLetterRects(viewport: {
  width: number;
  height: number;
}): Record<LogoLetter, Rect> {
  const logo = introLogoRect(viewport);
  const unit = logo.height / LOGO_VIEWBOX.height;
  const place = ({ x, y, width, height }: (typeof LOGO_LETTER_BOXES)[LogoLetter]): Rect => ({
    left: logo.left + (x - LOGO_VIEWBOX.x) * unit,
    top: logo.top + (y - LOGO_VIEWBOX.y) * unit,
    width: width * unit,
    height: height * unit,
  });
  return {
    m: place(LOGO_LETTER_BOXES.m),
    i: place(LOGO_LETTER_BOXES.i),
    a: place(LOGO_LETTER_BOXES.a),
    u: place(LOGO_LETTER_BOXES.u),
    f: place(LOGO_LETTER_BOXES.f),
    l: place(LOGO_LETTER_BOXES.l),
    i2: place(LOGO_LETTER_BOXES.i2),
    x: place(LOGO_LETTER_BOXES.x),
  };
}
