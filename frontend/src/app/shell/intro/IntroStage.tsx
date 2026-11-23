import { SplitLogo } from '@shared/brand/logo/SplitLogo';
import { getSplitLogoParts } from '@shared/brand/logo/splitLogoParts';
import { useT } from '@shared/i18n';
import { gsap } from 'gsap';
import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';

import type { IntroPhase } from './introPhase';
import * as styles from './introStage.css';
import { useIntroAudio } from './useIntroAudio';

export interface IntroStageHandle {
  /** Play from the start. */
  restart: () => void;
  pause: () => void;
  resume: () => void;
  /** Jump to a point of the whole intro, 0 to 1, and stay paused there. */
  seek: (progress: number) => void;
  getProgress: () => number;
  /** Length of all the phases together (seconds). */
  getDuration: () => number;
}

interface IntroStageProps {
  /** The phases to play, in order. */
  phases: readonly IntroPhase[];
  autoStart?: boolean;
  lowResourceAnimation?: boolean;
  onComplete?: () => void;
  onProgress?: (progress: number) => void;
  /** The phases' timeline is built (again, when they change); the handle can seek it. */
  onReady?: (durationSeconds: number) => void;
  /** A phase begins playing (not when seeking past it). */
  onPhaseStart?: (phase: IntroPhase) => void;
  /** Hide the wordmark (not the black screen), e.g. while an identical logo sits on top of it. */
  logoVisible?: boolean;
}

/**
 * The intro: the wordmark, drawn in parts (SplitLogo), on a black screen, animated by a sequence
 * of phases (collapse, blink, expand), each a GSAP timeline played after the previous one.
 */
export const IntroStage = forwardRef<IntroStageHandle, IntroStageProps>(
  (
    {
      phases,
      autoStart = false,
      lowResourceAnimation = false,
      logoVisible = true,
      onComplete,
      onProgress,
      onReady,
      onPhaseStart,
    },
    ref
  ) => {
    const t = useT();
    const backdropRef = useRef<HTMLDivElement>(null);
    const logoRef = useRef<HTMLDivElement>(null);
    const svgRef = useRef<SVGSVGElement>(null);
    const [timeline, setTimeline] = useState<gsap.core.Timeline | null>(null);
    const timelineRef = useRef<gsap.core.Timeline | null>(null);
    const audio = useIntroAudio(timelineRef);

    const callbacksRef = useRef({ onComplete, onProgress, onReady, onPhaseStart });
    callbacksRef.current = { onComplete, onProgress, onReady, onPhaseStart };

    useLayoutEffect(() => {
      const backdrop = backdropRef.current;
      const logo = logoRef.current;
      const parts = svgRef.current && getSplitLogoParts(svgRef.current);
      if (!backdrop || !logo || !parts) return undefined;

      const context = gsap.context(() => {
        const master = gsap.timeline({
          paused: true,
          onUpdate: () => callbacksRef.current.onProgress?.(master.progress()),
          onComplete: () => callbacksRef.current.onComplete?.(),
        });
        for (const phase of phases) {
          master.call(() => callbacksRef.current.onPhaseStart?.(phase));
          master.add(
            phase({
              backdrop,
              logo,
              parts,
              lowResource: lowResourceAnimation,
              startAudio: audio.start,
            })
          );
        }
        // Draw the first frame now, not when playback starts
        master.progress(0, true);
        timelineRef.current = master;
        setTimeline(master);
      });
      return () => {
        audio.stop();
        timelineRef.current = null;
        setTimeline(null);
        context.revert();
      };
    }, [phases, lowResourceAnimation, audio]);

    useLayoutEffect(() => {
      if (!timeline) return;
      callbacksRef.current.onReady?.(timeline.duration());
      if (autoStart) {
        audio.stop();
        timeline.play(0);
      }
    }, [autoStart, timeline, audio]);

    useImperativeHandle(
      ref,
      () => ({
        restart: () => {
          audio.stop();
          timeline?.play(0);
        },
        pause: () => {
          timeline?.pause();
          audio.pause();
        },
        resume: () => {
          audio.resume();
          if (!audio.isHolding()) timeline?.resume();
        },
        // Scrubbing is silent: callbacks (the sound's start) are skipped
        seek: progress => {
          audio.stop();
          if (!timeline) return;
          timeline.pause().progress(Math.max(0, Math.min(1, progress)), true);
          // Suppressed with the other callbacks
          callbacksRef.current.onProgress?.(timeline.progress());
        },
        getProgress: () => timeline?.progress() ?? 0,
        getDuration: () => timeline?.duration() ?? 0,
      }),
      [timeline, audio]
    );

    return (
      <div className={styles.stage}>
        <div ref={backdropRef} className={styles.backdrop} aria-hidden="true" />
        <div
          ref={logoRef}
          className={styles.logo}
          style={{ visibility: logoVisible ? 'visible' : 'hidden' }}
        >
          <SplitLogo ref={svgRef} className={styles.svg} title={t('common.logo')} faceFrame />
        </div>
      </div>
    );
  }
);

IntroStage.displayName = 'IntroStage';
