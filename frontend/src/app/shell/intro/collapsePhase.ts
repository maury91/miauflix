import { LOGO_LETTERS, LOGO_M, LOGO_VIEWBOX } from '@shared/brand/logo/logoParts';
import { gsap } from 'gsap';

import type { IntroPhase } from './introPhase';

/** How long one letter takes to slide into the M, and the delay between letters (seconds). */
const LETTER_S = 0.7;
const LETTER_STAGGER_S = 0.05;
/** Letters shrink to this as they reach the M. */
const LETTER_END_SCALE = 0.4;
/** The M swallows the last letter: it swells by this, then settles. */
const GULP_SCALE = 1.08;
const GULP_ATTACK_S = 0.12;
const GULP_RELEASE_S = 0.4;

const M_CENTER = (LOGO_M.left + LOGO_M.right) / 2;
/** How far the wordmark moves so the M ends centred, in percent of the wordmark's width. */
export const M_CENTERED_X_PERCENT =
  ((LOGO_VIEWBOX.width / 2 - M_CENTER) / LOGO_VIEWBOX.width) * 100;

/** Total length of the collapse (seconds), the gulp included. */
export const COLLAPSE_DURATION_S =
  LETTER_S + LETTER_STAGGER_S * (LOGO_LETTERS.length - 1) + GULP_RELEASE_S;

/**
 * The black panels around the M's face (the expansion's reveal), shown once the letters they would
 * cover are gone. Black on the black screen, they change nothing visible; shown here, the TV paints
 * them before the sound starts rather than on a beat.
 */
const showFaceFrame = (faceFrame: SVGGElement) =>
  gsap.fromTo(
    faceFrame,
    { visibility: 'hidden' },
    { visibility: 'visible', duration: 0, immediateRender: false }
  );

/**
 * Phase 1: "Miauwatch" collapses into its M. The letters, nearest first, are pulled into the M,
 * shrinking and fading behind it, while the wordmark slides so the M ends centred on the screen;
 * the M gulps as the last letter arrives.
 */
export const collapsePhase: IntroPhase = ({ logo, parts }) => {
  const timeline = gsap.timeline();
  const lettersEnd = LETTER_S + LETTER_STAGGER_S * (parts.letters.length - 1);

  parts.letters.forEach((letter, index) => {
    const geometry = LOGO_LETTERS[index]!;
    const at = index * LETTER_STAGGER_S;
    timeline.fromTo(
      letter,
      { x: 0, scale: 1, opacity: 1, transformOrigin: '50% 50%' },
      {
        x: M_CENTER - (geometry.left + geometry.right) / 2,
        scale: LETTER_END_SCALE,
        duration: LETTER_S,
        ease: 'power2.in',
      },
      at
    );
    // Gone by the time it would show through the M's gaps
    timeline.to(
      letter,
      { opacity: 0, duration: LETTER_S * 0.3, ease: 'power1.in' },
      at + LETTER_S * 0.7
    );
  });

  timeline.fromTo(
    logo,
    { xPercent: 0 },
    { xPercent: M_CENTERED_X_PERCENT, duration: lettersEnd, ease: 'power2.inOut' },
    0
  );

  timeline
    .fromTo(
      parts.m,
      { scale: 1, transformOrigin: '50% 50%' },
      { scale: GULP_SCALE, duration: GULP_ATTACK_S, ease: 'power2.out' },
      lettersEnd - GULP_ATTACK_S / 2
    )
    .to(parts.m, { scale: 1, duration: GULP_RELEASE_S - GULP_ATTACK_S / 2, ease: 'power2.out' });
  if (parts.faceFrame) timeline.add(showFaceFrame(parts.faceFrame), lettersEnd);

  return timeline;
};

/**
 * Where the collapse ends, set at once: only the M, centred. Put before a later phase to play it
 * on its own (Storybook).
 */
export const collapsedPhase: IntroPhase = ({ logo, parts }) => {
  // Set now too: a zero-length timeline draws nothing until the playhead moves
  gsap.set(parts.letters, { opacity: 0 });
  gsap.set(logo, { xPercent: M_CENTERED_X_PERCENT });
  if (parts.faceFrame) gsap.set(parts.faceFrame, { visibility: 'visible' });
  const timeline = gsap
    .timeline()
    .set(parts.letters, { opacity: 0 }, 0)
    .set(logo, { xPercent: M_CENTERED_X_PERCENT }, 0);
  if (parts.faceFrame) timeline.set(parts.faceFrame, { visibility: 'visible' }, 0);
  return timeline;
};
