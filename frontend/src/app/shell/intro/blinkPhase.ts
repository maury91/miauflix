import { gsap } from 'gsap';

import type { IntroPhase } from './introPhase';
import { INTRO_AUDIO_CUES } from './useIntroAudio';

/** The eyes shut to this share of their height. */
const CLOSED_EYES_SCALE = 0.08;
/** How long the eyes take to shut, stay shut, and open again (seconds). */
const CLOSE_S = 0.05;
const HOLD_S = 0.05;
const OPEN_S = 0.14;

/**
 * Phase 2: the cat blinks on each "pam" of the intro sound. The phase starts the sound and lasts
 * until the "meow", where the expansion begins.
 */
export const blinkPhase: IntroPhase = ({ parts, startAudio }) => {
  const timeline = gsap.timeline();
  timeline.call(startAudio, [], 0);
  timeline.set(parts.eyes, { scaleY: 1, transformOrigin: '50% 50%' }, 0);

  for (const at of INTRO_AUDIO_CUES.pams) {
    timeline
      .to(parts.eyes, { scaleY: CLOSED_EYES_SCALE, duration: CLOSE_S, ease: 'power2.in' }, at)
      .to(parts.eyes, { scaleY: 1, duration: OPEN_S, ease: 'power2.out' }, at + CLOSE_S + HOLD_S);
  }

  // Ends on the meow, whatever the blinks' length
  timeline.set({}, {}, INTRO_AUDIO_CUES.meow);
  return timeline;
};
