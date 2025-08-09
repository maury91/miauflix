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

import { Logo, type LogoHandle } from '../ui-elements/logo';
import { mapObject, typedEntries } from '../utils/object';

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
  background-color: black;
`;

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
    },
    ref
  ) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const logoRef = useRef<LogoHandle | null>(null);
    const timelineRef = useRef<gsap.core.Timeline | null>(null);
    const [constants, setConstants] = useState<Record<
      string,
      { box: DOMRect; multiplier: number }
    > | null>(null);

    // Calculate position of the letters, their size, and cache them
    const computeConstants = useCallback(() => {
      if (!logoRef.current) return;

      const letters = logoRef.current;

      const precomputedData = mapObject(
        mapObject(letters, (_, letter) => letter.getBoundingClientRect()),
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
            duration: duration * 0.8,
          },
          duration * 0.3
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
        containerRef.current,
        { backgroundColor: 'rgba(0,0,0,1)' },
        { backgroundColor: 'rgba(0,0,0,0)', duration: duration * 0.4 },
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

    const start = useCallback(() => {
      if (!introAnimation) return;

      introAnimation.play();
    }, [introAnimation]);

    const pause = useCallback(() => {
      if (introAnimation && !introAnimation.paused()) {
        introAnimation.pause();
      }
    }, [introAnimation]);

    const resume = useCallback(() => {
      if (introAnimation && introAnimation.paused()) {
        introAnimation.resume();
      }
    }, [introAnimation]);

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
      // Kill timeline cleanly
      if (introAnimation) {
        introAnimation.kill();
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
    }, [introAnimation, computeConstants]);

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
        if (introAnimation) {
          introAnimation.kill();
        }
      };
    }, [autoStart, introAnimation]);

    return (
      <AnimationContainer ref={containerRef} className={className} style={style}>
        <Logo ref={logoRef} />
      </AnimationContainer>
    );
  }
);

IntroAnimation.displayName = 'LogoAnimated';
