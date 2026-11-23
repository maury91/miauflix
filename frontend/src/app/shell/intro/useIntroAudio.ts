import type { gsap } from 'gsap';
import { type RefObject, useEffect, useMemo, useRef } from 'react';

/**
 * When the beats of the intro sound (/assets/pam-pam-meow.mp3) fall, in seconds from when
 * playback starts: two "pam", then the "meow".
 */
export const INTRO_AUDIO_CUES = {
  pams: [0.02, 0.35],
  meow: 0.62,
} as const;

/** How long the intro waits for the sound to start before going on silently. */
export const AUDIO_START_TIMEOUT_MS = 2000;

export interface IntroAudio {
  /**
   * Play the sound from the start, holding the timeline until it actually plays so the beats land
   * on their cues. Without sound (blocked autoplay, a load error, a start slower than
   * AUDIO_START_TIMEOUT_MS) the timeline goes on silently.
   */
  start: () => void;
  pause: () => void;
  resume: () => void;
  /** A start is waiting for playback: the sound resumes the timeline, not the caller. */
  isHolding: () => boolean;
  /** Silence and rewind it; a start still waiting for playback is dropped. */
  stop: () => void;
}

/** A start waiting for the sound, which holds the timeline. */
interface PendingStart {
  /** The intro was paused meanwhile: releasing the hold must not resume it. */
  paused: boolean;
  /** Gave up on it (timed out, failed or stopped): sound starting late is silenced. */
  abandoned: boolean;
  timeout: ReturnType<typeof setTimeout>;
}

/** The intro sound, played in step with `timelineRef` (IntroStage's timeline). */
export const useIntroAudio = (timelineRef: RefObject<gsap.core.Timeline | null>): IntroAudio => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pendingRef = useRef<PendingStart | null>(null);
  /** The latest start, which owns the element's playback; none once stopped. */
  const ownerRef = useRef<PendingStart | null>(null);
  /** A resume of a sound under way, until it calls play(); pause, stop and start cancel it. */
  const resumeRef = useRef<object | null>(null);

  const audio = useMemo<IntroAudio>(() => {
    const silence = (element: HTMLAudioElement) => {
      element.pause();
      element.currentTime = 0;
    };

    /** Drop the hold without sound; the timeline goes on unless the intro was paused. */
    const giveUp = (pending: PendingStart) => {
      if (pendingRef.current !== pending) return;
      pendingRef.current = null;
      pending.abandoned = true;
      clearTimeout(pending.timeout);
      if (audioRef.current) silence(audioRef.current);
      if (!pending.paused) timelineRef.current?.resume();
    };

    /** Ask the sound to play from the start; the hold ends once it actually plays. */
    const attempt = (pending: PendingStart, element: HTMLAudioElement) => {
      element.currentTime = 0;
      Promise.resolve()
        .then(() => {
          // Dropped (stopped, replaced, given up) or paused again before the request went out
          if (pendingRef.current !== pending || pending.paused) return false;
          // Older engines return nothing from play(), not a promise
          return Promise.resolve(element.play()).then(() => true);
        })
        .then(
          played => {
            if (!played) return;
            if (pending.abandoned) {
              // Started after the intro gave up on it, or was stopped; unless a newer start
              // owns the element now, its sound is not wanted
              if (ownerRef.current === null || ownerRef.current === pending) silence(element);
              return;
            }
            // Replaced by a newer start, which owns the element
            if (pendingRef.current !== pending) return;
            if (pending.paused) {
              // Paused while it started: wait, at the start, for resume to play it again
              silence(element);
              return;
            }
            pendingRef.current = null;
            clearTimeout(pending.timeout);
            timelineRef.current?.resume();
          },
          (error: unknown) => {
            // Our own pause interrupted it: still holding, resume asks again
            if (error instanceof Error && error.name === 'AbortError') return;
            giveUp(pending);
          }
        );
    };

    const abandonPending = () => {
      const pending = pendingRef.current;
      if (!pending) return;
      pendingRef.current = null;
      pending.abandoned = true;
      clearTimeout(pending.timeout);
    };

    return {
      start: () => {
        const timeline = timelineRef.current;
        const element = audioRef.current;
        if (!timeline || !element) return;
        // A start replacing another: the older one's late sound is the new one's, keep it
        const previous = pendingRef.current;
        if (previous) clearTimeout(previous.timeout);
        const pending: PendingStart = {
          paused: false,
          abandoned: false,
          timeout: setTimeout(() => giveUp(pending), AUDIO_START_TIMEOUT_MS),
        };
        pendingRef.current = pending;
        ownerRef.current = pending;
        resumeRef.current = null;
        timeline.pause();
        attempt(pending, element);
      },
      pause: () => {
        resumeRef.current = null;
        if (pendingRef.current) pendingRef.current.paused = true;
        audioRef.current?.pause();
      },
      resume: () => {
        const element = audioRef.current;
        if (!element) return;
        const pending = pendingRef.current;
        if (pending) {
          // Nothing has played yet: from the start, still holding until it does
          pending.paused = false;
          attempt(pending, element);
          return;
        }
        // A sound under way carries on; otherwise the timeline starts it on its cue
        if (element.currentTime <= 0 || element.ended) return;
        const request = {};
        resumeRef.current = request;
        Promise.resolve()
          .then(() => {
            // Paused, stopped or restarted before the request went out
            if (resumeRef.current !== request) return undefined;
            resumeRef.current = null;
            return element.play();
          })
          .catch(() => undefined);
      },
      isHolding: () => pendingRef.current !== null,
      stop: () => {
        abandonPending();
        ownerRef.current = null;
        resumeRef.current = null;
        if (audioRef.current) silence(audioRef.current);
      },
    };
  }, [timelineRef]);

  useEffect(() => {
    const element = new Audio(`${import.meta.env.BASE_URL}assets/pam-pam-meow.mp3`);
    element.preload = 'auto';
    const handleError = (event: Event) => console.warn('Failed to load the intro sound', event);
    element.addEventListener('error', handleError);
    audioRef.current = element;
    return () => {
      audio.stop();
      audioRef.current = null;
      element.removeEventListener('error', handleError);
      element.src = '';
    };
  }, [audio]);

  return audio;
};
