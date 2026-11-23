import { LOGO_M, LOGO_VIEWBOX } from '@shared/brand/logo/logoParts';
import { gsap } from 'gsap';
import { ExpoScaleEase } from 'gsap/EasePack';

import type { IntroPhase } from './introPhase';

gsap.registerPlugin(ExpoScaleEase);

/** How long the expansion lasts (seconds). */
export const EXPAND_DURATION_S = 0.83;
/** The M ends this many times larger than full size (as large as fits the screen). */
const PAST_FULL_SIZE_SCALE = 3;
/** The black behind the face starts clearing this long before the M is full size (seconds)… */
const FACE_CLEAR_BEFORE_FULL_SIZE_S = 0.3;
/** …and is gone this quickly (seconds). */
const FACE_CLEAR_S = 0.35;
/** The M blurs and fades over the last part of the growth past full size, this share of it. */
const DISSOLVE_SHARE = 0.6;
/** How far the M blurs (skipped on a TV). */
const EXPAND_BLUR_PX = 10;

const M_WIDTH = LOGO_M.right - LOGO_M.left;
const M_HEIGHT = LOGO_M.bottom - LOGO_M.top;
const percent = (value: number, of: number) => `${((value / of) * 100).toFixed(3)}%`;
/** The M's centre within the wordmark: the expansion grows from there, keeping the M in place. */
const M_ORIGIN = `${percent((LOGO_M.left + LOGO_M.right) / 2, LOGO_VIEWBOX.width)} ${percent(
  (LOGO_M.top + LOGO_M.bottom) / 2,
  LOGO_VIEWBOX.height
)}`;

/** How much the M must grow to be as large as fits the screen, from the wordmark's size on screen. */
const fullSizeScale = (logo: HTMLElement) => {
  const mWidth = (logo.offsetWidth * M_WIDTH) / LOGO_VIEWBOX.width;
  const mHeight = (logo.offsetHeight * M_HEIGHT) / LOGO_VIEWBOX.height;
  if (!mWidth || !mHeight) return 8;
  return Math.max(1, Math.min(window.innerWidth / mWidth, window.innerHeight / mHeight));
};

/**
 * Phase 3, on the "meow": the M grows towards the viewer on the black screen. Nearing full size,
 * the black clears behind its face only (the face frame, shown since the collapse, keeps all
 * around it black), so the page appears from inside the M, and grows with it until the M blurs
 * and fades away.
 */
export const expandPhase: IntroPhase = ({ backdrop, logo, lowResource }) => {
  const timeline = gsap.timeline();
  const d = EXPAND_DURATION_S;
  const fullSize = fullSizeScale(logo);
  const endScale = fullSize * PAST_FULL_SIZE_SCALE;
  // The ease below grows the scale exponentially: it is `endScale ** (t / d)` at time t
  const timeAtScale = (scale: number) => (d * Math.log(Math.max(1, scale))) / Math.log(endScale);
  const fullSizeAt = timeAtScale(fullSize);
  const dissolve = (d - fullSizeAt) * DISSOLVE_SHARE;

  timeline.fromTo(
    logo,
    { scale: 1, transformOrigin: M_ORIGIN },
    // Grows at a steady pace to the eye, however large it already is
    { scale: endScale, duration: d, ease: `expoScale(1, ${endScale})`, force3D: true },
    0
  );
  timeline.fromTo(
    backdrop,
    { opacity: 1 },
    { opacity: 0, duration: FACE_CLEAR_S, ease: 'power1.in' },
    Math.max(0, fullSizeAt - FACE_CLEAR_BEFORE_FULL_SIZE_S)
  );
  timeline.fromTo(
    logo,
    { opacity: 1 },
    { opacity: 0, duration: dissolve, ease: 'power1.in' },
    d - dissolve
  );
  if (!lowResource)
    timeline.fromTo(
      logo,
      { filter: 'blur(0px)' },
      { filter: `blur(${EXPAND_BLUR_PX}px)`, duration: dissolve, ease: 'power2.in' },
      d - dissolve
    );

  return timeline;
};
