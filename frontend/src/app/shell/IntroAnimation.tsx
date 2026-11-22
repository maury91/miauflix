import { brandLogoUrl } from '@shared/brand/logo/brandLogo';
import { centeredLogoSize } from '@shared/brand/logo/logo.css';
import { useT } from '@shared/i18n';
import { gsap } from 'gsap';
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';

import * as styles from './introAnimation.css';

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
/** How much the wordmark grows on the meow. */
const EXPANSION_SCALE = 10;

const useIntroAnimationAudio = () => {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const audio = new Audio(`${import.meta.env.BASE_URL}assets/pam-pam-meow.mp3`);
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
    const t = useT();
    const logoRef = useRef<HTMLImageElement>(null);
    /** The "pam pam" pulses that lead into the expansion. */
    const preRollRef = useRef<gsap.core.Timeline | null>(null);
    /** A start() waiting for the audio; reset and unmount drop it, pause marks it paused. */
    const pendingStartRef = useRef<{ paused: boolean } | null>(null);
    const audioRef = useIntroAnimationAudio();
    // A TV rasterizes in software: a pulse without a layer of its own repaints the whole screen
    // every frame, and a layer GSAP creates as the pulse starts costs a full-screen raster (about
    // 250 ms) that swallowed the 50 ms swell. Created ahead, before the audio, the layer is painted
    // once and the compositor scales it. Keep it through the expansion to avoid another full-screen raster.
    const preparePulseLayer = useCallback(() => {
      if (lowResourceAnimation && containerRef.current)
        containerRef.current.style.willChange = 'transform';
    }, [lowResourceAnimation]);

    const [introAnimation, setIntroAnimation] = useState<gsap.core.Timeline | null>(null);
    useEffect(() => {
      const logo = logoRef.current;
      const background = backgroundRef.current;
      if (!logo || !background) return undefined;

      const context = gsap.context(() => {
        if (lowResourceAnimation) gsap.set(logo, { z: 0.01 });
        const animation = gsap.timeline({ delay, paused: true });
        animation.fromTo(
          logo,
          { scale: 1, opacity: 1 },
          {
            scale: EXPANSION_SCALE,
            duration,
            ease: 'expoScale(1, 10)',
            force3D: true,
          },
          0
        );
        animation.to(logo, { opacity: 0, duration: duration * 0.4 }, duration * 0.6);

        // Blur effect (skip on Tizen for performance)
        if (!lowResourceAnimation) {
          animation.fromTo(
            logo,
            { filter: 'blur(0px)' },
            { filter: 'blur(10px)', duration: duration * 0.6, ease: 'power2.inOut' },
            duration * 0.35
          );
        }

        // Fade out the container
        animation.fromTo(
          background,
          { opacity: 1 },
          { opacity: 0, duration: duration * 0.4 },
          duration * (lowResourceAnimation ? 0.6 : 0.4)
        );

        preparePulseLayer();
        setIntroAnimation(animation);
      });

      return () => context.revert();
    }, [delay, duration, lowResourceAnimation, preparePulseLayer]);

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
      preparePulseLayer();
      introAnimation?.pause(0, true);

      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    }, [introAnimation, audioRef, preparePulseLayer]);

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
      };
    }, [autoStart, introAnimation]);

    useEffect(() => {
      if (introAnimation) onReady?.();
    }, [introAnimation, onReady]);

    return (
      <div
        ref={containerRef}
        className={className ? `${styles.container} ${className}` : styles.container}
        style={style}
        data-low-resource={lowResourceAnimation || undefined}
      >
        <div
          ref={backgroundRef}
          aria-hidden="true"
          style={{
            position: 'absolute',
            // Not `inset`: the TV's Chromium 69 doesn't know it, and Home showed through
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            zIndex: -1,
            background: 'black',
            willChange: 'opacity',
          }}
        />
        <img
          ref={logoRef}
          className={centeredLogoSize}
          src={brandLogoUrl}
          alt={t('common.logo')}
          style={{ visibility: logoVisible ? 'visible' : 'hidden' }}
        />
      </div>
    );
  }
);

IntroAnimation.displayName = 'LogoAnimated';
