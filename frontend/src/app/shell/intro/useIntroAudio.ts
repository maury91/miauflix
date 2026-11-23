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

export interface IntroAudio {
  /**
   * Play the sound from the start, holding the timeline until it actually plays so the beats land
   * on their cues. Without sound (blocked autoplay, a load error) the timeline goes on silently.
   */
  start: () => void;
  pause: () => void;
  resume: () => void;
  /** A start is waiting for playback: the sound resumes the timeline, not the caller. */
  isHolding: () => boolean;
  /** Silence and rewind it; a start still waiting for playback is dropped. */
  stop: () => void;
}

/** The intro sound, played in step with `timelineRef` (IntroStage's timeline). */
export const useIntroAudio = (timelineRef: RefObject<gsap.core.Timeline | null>): IntroAudio => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  /** A start waiting for playback; `paused` when the intro was paused meanwhile. */
  const pendingRef = useRef<{ paused: boolean } | null>(null);

  useEffect(() => {
    const audio = new Audio(`${import.meta.env.BASE_URL}assets/pam-pam-meow.mp3`);
    audio.preload = 'auto';
    const handleError = (event: Event) => console.warn('Failed to load the intro sound', event);
    audio.addEventListener('error', handleError);
    audioRef.current = audio;
    return () => {
      audioRef.current = null;
      pendingRef.current = null;
      audio.removeEventListener('error', handleError);
      audio.pause();
      audio.src = '';
    };
  }, []);

  return useMemo<IntroAudio>(() => {
    // Older engines return nothing from play(), not a promise
    const play = (audio: HTMLAudioElement) =>
      Promise.resolve()
        .then(() => audio.play())
        .catch(() => undefined);
    return {
      start: () => {
        const timeline = timelineRef.current;
        const audio = audioRef.current;
        if (!timeline || !audio) return;
        const pending = { paused: false };
        pendingRef.current = pending;
        timeline.pause();
        audio.currentTime = 0;
        void play(audio).then(() => {
          if (pendingRef.current !== pending) return;
          pendingRef.current = null;
          if (pending.paused) audio.pause();
          else timeline.resume();
        });
      },
      pause: () => {
        if (pendingRef.current) pendingRef.current.paused = true;
        audioRef.current?.pause();
      },
      resume: () => {
        const audio = audioRef.current;
        if (!audio) return;
        if (pendingRef.current) pendingRef.current.paused = false;
        // Only a sound already under way: the timeline starts it on its cue
        if (pendingRef.current || (audio.currentTime > 0 && !audio.ended)) void play(audio);
      },
      isHolding: () => pendingRef.current !== null,
      stop: () => {
        pendingRef.current = null;
        const audio = audioRef.current;
        if (!audio) return;
        audio.pause();
        audio.currentTime = 0;
      },
    };
  }, [timelineRef]);
};
