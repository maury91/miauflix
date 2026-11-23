import { forwardRef } from 'react';

import { LOGO_LETTERS, LOGO_M, LOGO_VIEWBOX } from './logoParts';

/** How far the face frame reaches past the M (viewBox units): past the screen edges once it shows. */
const FRAME_REACH = 2000;
const { face } = LOGO_M;
/** Black panels covering all around the M's face: left of it, right of it, above and below it. */
const FACE_FRAME_PANELS = [
  {
    id: 'left',
    x: -FRAME_REACH,
    y: -FRAME_REACH,
    width: FRAME_REACH + face.left,
    height: 2 * FRAME_REACH,
  },
  { id: 'right', x: face.right, y: -FRAME_REACH, width: FRAME_REACH, height: 2 * FRAME_REACH },
  // Above and below span the full width, overlapping the sides: no hairline seam where they meet
  {
    id: 'above',
    x: -FRAME_REACH,
    y: -FRAME_REACH,
    width: 3 * FRAME_REACH,
    height: FRAME_REACH + face.top,
  },
  { id: 'below', x: -FRAME_REACH, y: face.bottom, width: 3 * FRAME_REACH, height: FRAME_REACH },
];

/**
 * The wordmark drawn inline, the M and each letter its own element, so the intro can take it
 * apart. Looks the same as the logo image (logo.svg). The M is drawn last: letters that slide
 * into it pass behind it.
 *
 * `faceFrame` adds black panels behind the M, all around its face and hidden until shown: with
 * them, whatever is behind the wordmark shows only through the face (the intro's reveal).
 */
export const SplitLogo = forwardRef<
  SVGSVGElement,
  { className?: string; title?: string; faceFrame?: boolean }
>(({ className, title, faceFrame = false }, ref) => (
  <svg
    ref={ref}
    className={className}
    viewBox={`0 0 ${LOGO_VIEWBOX.width} ${LOGO_VIEWBOX.height}`}
    role={title ? 'img' : undefined}
    aria-hidden={title ? undefined : true}
    aria-label={title}
    // Letters leave the wordmark's box while they slide; keep them drawn
    overflow="visible"
  >
    {LOGO_LETTERS.map(letter => (
      <path
        key={letter.id}
        data-logo-part="letter"
        data-letter={letter.id}
        fill={letter.fill}
        fillRule="evenodd"
        d={letter.d}
      />
    ))}
    {faceFrame && (
      <g data-logo-part="face-frame" fill="black" style={{ visibility: 'hidden' }}>
        {FACE_FRAME_PANELS.map(({ id, ...panel }) => (
          <rect key={id} {...panel} />
        ))}
      </g>
    )}
    <g data-logo-part="m">
      <path fill={LOGO_M.bodyFill} fillRule="evenodd" d={LOGO_M.body} />
      <g data-logo-part="eyes">
        {LOGO_M.eyes.map(eye => (
          <path key={eye} fill={LOGO_M.eyesFill} fillRule="evenodd" d={eye} />
        ))}
      </g>
    </g>
  </svg>
));

SplitLogo.displayName = 'SplitLogo';
