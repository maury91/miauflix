import { mapObject, typedEntries } from '@shared/lib/object';
import { introLetterRects } from '@shared/ui/logo/logoGeometry';
import { LogoGlyphs, type LogoHandle } from '@shared/ui/logo/LogoGlyphs';
import { gsap } from 'gsap';
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import styled from 'styled-components';

export interface LogoAnimationHandle {
  start: () => void;
  pause: () => void;
  resume: () => void;
  seek: (progress: number) => void;
  reset: () => void;
  getProgress: () => number;
  isAnimating: () => boolean;
}

interface LogoAnimatedProps {
  className?: string;
  style?: React.CSSProperties;
  autoStart?: boolean;
  delay?: number;
  onStart?: () => void;
  onComplete?: () => void;
  onProgress?: (progress: number) => void;
  onReady?: () => void;
  duration?: number;
  lowResourceAnimation?: boolean;
  /** Keep the centered animation logo hidden while the shared page logo moves into place. */
  logoVisible?: boolean;
}

const lettersXMovementMultipliers: Record<keyof LogoHandle, number> = {
  m: -5,
  i: -3.5,
  a: -2.2,
  u: -1,
  f: 1,
  l: 2.2,
  i2: 3.5,
  x: 5,
};

/**
 * The intro follows /assets/pam-pam-meow.mp3, measured from when playback starts: the logo
 * pulses on each "pam" and expands on the "meow".
 */
const INTRO_CUES = {
  pulses: [0.02, 0.35],
  expand: 0.62,
} as const;
/** How far a "pam" pulse grows the logo, and how quickly it swells and settles (seconds). */
const PULSE_SCALE = 1.25;
const PULSE_ATTACK_S = 0.05;
const PULSE_RELEASE_S = 0.22;

const AnimationContainer = styled.div`
  position: fixed;
  left: 0;
  top: 0;
  width: 100vw;
  height: 100vh;

  display: flex;
  justify-content: center;
  align-items: center;

  will-change: transform, opacity, filter;
  backface-visibility: hidden;
  perspective: 1000px;
  contain: layout style paint;
  font: 7vw/1 sans-serif;
  z-index: 1002;
`;

const useIntroAnimationAudio = () => {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const audio = new Audio('/assets/pam-pam-meow.mp3');
    audioRef.current = audio;
    audio.preload = 'auto';
    const handleError = (event: Event) => {
      console.warn('Failed to load intro animation audio', event, audio);
    };
    audio.addEventListener('error', handleError);
    return () => {
      audioRef.current = null;
      audio.removeEventListener('error', handleError);
      audio.pause();
      audio.src = '';
    };
  }, []);

  return audioRef;
};

export const IntroAnimation = forwardRef<LogoAnimationHandle, LogoAnimatedProps>(
  (
    {
      className,
      style,
      autoStart = false,
      delay = 0,
      onStart,
      onComplete,
      onProgress,
      duration = 2.5,
      onReady,
      lowResourceAnimation = false,
      logoVisible = true,
    },
    ref
  ) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const backgroundRef = useRef<HTMLDivElement>(null);
    const logoRef = useRef<LogoHandle | null>(null);
    const timelineRef = useRef<gsap.core.Timeline | null>(null);
    /** The "pam pam" pulses that lead into the expansion. */
    const preRollRef = useRef<gsap.core.Timeline | null>(null);
    /** A start() waiting for the audio; reset and unmount drop it, pause marks it paused. */
    const pendingStartRef = useRef<{ paused: boolean } | null>(null);
    const audioRef = useIntroAnimationAudio();
    const [constants, setConstants] = useState<Record<
      string,
      { box: { left: number; top: number; width: number; height: number }; multiplier: number }
    > | null>(null);

    // Place each letter exactly where the centred logo draws it, so the hand-off from the
    // loading logo to the intro does not shift or resize anything.
    const computeConstants = useCallback(() => {
      if (!logoRef.current) return;

      const letters = logoRef.current;
      const rects = introLetterRects({ width: window.innerWidth, height: window.innerHeight });

      const precomputedData = mapObject(
        mapObject(letters, key => rects[key]),
        (key, value, obj) => ({
          box: value,
          multiplier: lettersXMovementMultipliers[key] * obj['u'].width,
        })
      );

      // Apply performance optimizations
      Object.values(letters).forEach(letter => {
        Object.assign(letter.style, {
          willChange: 'transform, opacity, filter',
          backfaceVisibility: 'hidden' as const,
          perspective: '1000px',
        });
      });

      setConstants(precomputedData);
    }, []);

    useEffect(() => {
      computeConstants();
    }, [computeConstants]);

    const introAnimation = useMemo(() => {
      const letters = logoRef.current;

      if (!containerRef.current || !letters || !constants) return null;

      // Position letters relative to the viewport using their original viewport boxes
      typedEntries(letters).forEach(([key, letter]) => {
        const { left, top, width, height } = constants[key].box;
        gsap.set(letter, {
          position: 'fixed',
          display: 'block',
          left: `${left}px`,
          top: `${top}px`,
          width: `${width}px`,
          height: `${height}px`,
          margin: 0,
          transformOrigin: 'center center',
          force3D: true, // Hardware acceleration
        });
      });

      const animation = gsap.timeline({
        delay,
      });

      // Get letters and precomputed spacing
      const { m, i, a, u, f, l, i2, x } = letters;
      const letterAnimations = typedEntries(letters).map(([key, letter]) => ({
        letter,
        translateX: constants[key].multiplier,
      }));

      // Animate all letters scaling and moving simultaneously
      letterAnimations.forEach(({ letter, translateX }) => {
        animation.fromTo(
          letter,
          { transform: 'scale(1) translateX(0)' },
          {
            transform: `scale(10) translateX(${translateX}px)`,
            duration: duration,
            ease: 'expoScale(1, 10)',
          },
          0
        );
      });

      // Progressive letter removal for performance
      animation.call(
        () => {
          gsap.killTweensOf([m, x]);
          m.style.display = 'none';
          x.style.display = 'none';
        },
        [],
        duration * 0.3
      );
      animation.call(
        () => {
          gsap.killTweensOf([i, i2]);
          i.style.display = 'none';
          i2.style.display = 'none';
        },
        [],
        duration * 0.4
      );

      animation.call(
        () => {
          gsap.killTweensOf([a, l]);
          a.style.display = 'none';
          l.style.display = 'none';
        },
        [],
        duration * 0.65
      );

      // Blur effect (skip on Tizen for performance)
      if (!lowResourceAnimation) {
        animation.fromTo(
          [i, a, u, f, l, i2],
          { filter: 'blur(0px)' },
          {
            filter: 'blur(10px)',
            duration: duration * 0.6,
            ease: 'power2.inOut',
          },
          duration * 0.35
        );
      }

      // Fade out remaining letters
      animation.fromTo(
        [u, f],
        { opacity: 1 },
        {
          opacity: 0,
          duration: duration * 0.4,
        },
        duration * 0.6
      );

      // Fade out the container
      animation.fromTo(
        backgroundRef.current,
        { opacity: 1 },
        { opacity: 0, duration: duration * 0.4 },
        duration * (lowResourceAnimation ? 0.6 : 0.4)
      );

      // Kill any existing timeline
      if (timelineRef.current) {
        timelineRef.current.kill();
      } else {
        setTimeout(() => {
          onReady?.();
        }, 0);
      }

      timelineRef.current = animation;
      animation.pause();

      return animation;
    }, [constants, delay, duration, lowResourceAnimation, onReady]);

    useEffect(() => {
      if (introAnimation && onStart) {
        introAnimation.eventCallback('onStart', () => {
          onStart();
        });
      }
    }, [introAnimation, onStart]);

    useEffect(() => {
      if (introAnimation && onProgress) {
        introAnimation.eventCallback('onUpdate', () => {
          onProgress(introAnimation.progress());
        });
      }
    }, [introAnimation, onProgress]);

    useEffect(() => {
      if (introAnimation && onComplete) {
        introAnimation.eventCallback('onComplete', () => {
          onComplete();
          if (onProgress) {
            onProgress(1);
          }
        });
      }
    }, [introAnimation, onComplete, onProgress]);

    const start = useCallback(async () => {
      if (!introAnimation) return;

      // Time the cues from when the audio actually starts. Without audio (blocked autoplay or
      // a load error) the same rhythm plays silently, so the intro always looks the same.
      const pending = { paused: false };
      pendingStartRef.current = pending;
      await audioRef.current?.play().catch(() => undefined);
      if (pendingStartRef.current !== pending) return;
      pendingStartRef.current = null;

      preRollRef.current?.kill();
      const preRoll = gsap.timeline();
      const container = containerRef.current;
      if (container) {
        for (const at of INTRO_CUES.pulses) {
          preRoll
            .to(
              container,
              { scale: PULSE_SCALE, duration: PULSE_ATTACK_S, ease: 'power2.out', force3D: true },
              at
            )
            .to(
              container,
              { scale: 1, duration: PULSE_RELEASE_S, ease: 'power2.out' },
              at + PULSE_ATTACK_S
            );
        }
      }
      preRoll.call(
        () => {
          introAnimation.play();
        },
        [],
        INTRO_CUES.expand
      );
      preRollRef.current = preRoll;
      if (pending.paused) {
        preRoll.pause();
        audioRef.current?.pause();
      }
    }, [introAnimation, audioRef]);

    const pause = useCallback(() => {
      if (pendingStartRef.current) pendingStartRef.current.paused = true;
      preRollRef.current?.pause();
      if (introAnimation && !introAnimation.paused()) {
        introAnimation.pause();
      }

      // Pause audio when animation is paused
      if (audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
      }
    }, [introAnimation, audioRef]);

    const resume = useCallback(() => {
      // Before the meow cue the pre-roll owns timing; it starts the expansion itself.
      // While start() waits for the audio, the pre-roll it creates starts the timeline.
      const preRoll = preRollRef.current;
      if (pendingStartRef.current) pendingStartRef.current.paused = false;
      else if (preRoll && preRoll.paused() && preRoll.progress() < 1) preRoll.resume();
      else if (introAnimation && introAnimation.paused()) {
        introAnimation.resume();
      }

      // Resume audio when animation is resumed
      if (audioRef.current && audioRef.current.paused) {
        audioRef.current.play().catch(error => {
          console.warn('Audio resume failed:', error);
        });
      }
    }, [introAnimation, audioRef]);

    const seek = useCallback(
      (progress: number) => {
        if (!introAnimation) {
          console.warn('No timeline available for seeking');
          return;
        }

        const clampedProgress = Math.max(0, Math.min(1, progress));

        // Wait a frame to ensure timeline is ready, then seek
        if (!introAnimation) return;

        const duration = introAnimation.duration();
        if (duration <= 0) {
          console.warn('Timeline duration is 0, cannot seek');
          return;
        }

        // Store current state
        const wasPlaying = !introAnimation.paused();

        // Pause timeline to prevent conflicts
        introAnimation.pause();

        // Seek using progress
        introAnimation.progress(clampedProgress);

        // Force immediate evaluation of all timeline state for consistent rendering
        introAnimation.invalidate();

        // Ensure all CSS properties are applied immediately
        gsap.set({}, { force3D: false }); // Force style recalculation

        // Update our tracking
        if (onProgress) {
          onProgress(clampedProgress);
        }

        // Resume if it was playing and not at the end
        if (wasPlaying && clampedProgress < 1) {
          introAnimation.resume();
        }
      },
      [introAnimation, onProgress]
    );

    const reset = useCallback(() => {
      pendingStartRef.current = null;
      preRollRef.current?.kill();
      preRollRef.current = null;
      if (containerRef.current) gsap.set(containerRef.current, { clearProps: 'transform' });
      // Kill timeline cleanly
      if (introAnimation) {
        introAnimation.kill();
      }

      // Reset audio
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }

      // Reset all letters to initial state
      if (logoRef.current) {
        Object.values(logoRef.current).forEach(letter => {
          gsap.set(letter, {
            clearProps: 'all',
            position: '',
            left: '',
            top: '',
            width: '',
            height: '',
            margin: '',
            opacity: 1,
            scale: 1,
            x: 0,
            y: 0,
            rotationY: 0,
            filter: 'none',
            display: '',
          });
        });
        computeConstants();
        setTimeout(() => {
          introAnimation?.pause();
        }, 200);
      }
    }, [introAnimation, computeConstants, audioRef]);

    const getProgress = useCallback(() => introAnimation?.progress() ?? 0, [introAnimation]);
    const isAnimating = useCallback(() => introAnimation?.isActive() ?? false, [introAnimation]);

    useImperativeHandle(
      ref,
      () => ({
        start,
        pause,
        resume,
        seek,
        reset,
        getProgress,
        isAnimating,
      }),
      [start, pause, resume, seek, reset, getProgress, isAnimating]
    );

    useEffect(() => {
      if (autoStart && introAnimation) {
        introAnimation.play();
      }

      return () => {
        pendingStartRef.current = null;
        preRollRef.current?.kill();
        if (introAnimation) {
          introAnimation.kill();
        }
      };
    }, [autoStart, introAnimation]);

    return (
      <AnimationContainer ref={containerRef} className={className} style={style}>
        <div
          ref={backgroundRef}
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: -1,
            background: 'black',
            willChange: 'opacity',
          }}
        />
        <LogoGlyphs ref={logoRef} style={{ visibility: logoVisible ? 'visible' : 'hidden' }} />
      </AnimationContainer>
    );
  }
);

IntroAnimation.displayName = 'LogoAnimated';
