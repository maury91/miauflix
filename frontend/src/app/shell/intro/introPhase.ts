import type { SplitLogoParts } from '@shared/brand/logo/splitLogoParts';
import type { gsap } from 'gsap';

/** What an intro phase animates. */
export interface IntroPhaseTargets {
  /** The full-screen black backdrop. */
  backdrop: HTMLElement;
  /** The box holding the wordmark, centred on the screen. */
  logo: HTMLElement;
  parts: SplitLogoParts;
  /** A TV rasterizing in software: skip filters and other costly effects. */
  lowResource: boolean;
  /**
   * Start the intro sound. Call it from the timeline (`timeline.call`): the timeline holds until
   * the sound plays, so cues measured from the sound's start (INTRO_AUDIO_CUES) land on time.
   */
  startAudio: () => void;
}

/**
 * One step of the intro (collapse, blink, expand). It returns its own timeline, which IntroStage
 * plays after the previous phase's. A phase starts from where the previous one ended; to play
 * one on its own (Storybook), put a zero-length phase that sets that state before it
 * (`collapsedPhase`).
 */
export type IntroPhase = (targets: IntroPhaseTargets) => gsap.core.Timeline;
