/** The SplitLogo elements an animation moves. */
export interface SplitLogoParts {
  /** The cat-shaped M, body and eyes. */
  m: SVGGElement;
  /** The M's two eyes, for the blink. */
  eyes: SVGGElement;
  /** "iauwatch", left to right. */
  letters: SVGPathElement[];
  /** The black frame around the M's face, when drawn (SplitLogo's `faceFrame`). */
  faceFrame: SVGGElement | null;
}

export const getSplitLogoParts = (svg: SVGSVGElement): SplitLogoParts | null => {
  const m = svg.querySelector<SVGGElement>('[data-logo-part="m"]');
  const eyes = svg.querySelector<SVGGElement>('[data-logo-part="eyes"]');
  if (!m || !eyes) return null;
  const letters = Array.from(svg.querySelectorAll<SVGPathElement>('[data-logo-part="letter"]'));
  const faceFrame = svg.querySelector<SVGGElement>('[data-logo-part="face-frame"]');
  return { m, eyes, letters, faceFrame };
};
