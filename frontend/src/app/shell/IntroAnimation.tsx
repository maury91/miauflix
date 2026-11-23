import { forwardRef, useCallback, useImperativeHandle, useRef } from 'react';

import { blinkPhase } from './intro/blinkPhase';
import { collapsePhase } from './intro/collapsePhase';
import { expandPhase } from './intro/expandPhase';
import type { IntroPhase } from './intro/introPhase';
import { IntroStage, type IntroStageHandle } from './intro/IntroStage';

/** The intro, in order: the wordmark collapses into its M, which blinks, then expands. */
const INTRO_PHASES: readonly IntroPhase[] = [collapsePhase, blinkPhase, expandPhase];

export interface LogoAnimationHandle {
  /** Play the intro from the start, its sound included. */
  start: () => void;
  pause: () => void;
  resume: () => void;
  /** Show a point of the intro, 0 to 1, paused and silent. */
  seek: (progress: number) => void;
  /** Back to the first frame, paused. */
  reset: () => void;
  getProgress: () => number;
}

interface IntroAnimationProps {
  /** The timeline is built: `start` can play it. */
  onReady?: () => void;
  /** The expansion begins: the page starts showing through the M (the corner logo can take over). */
  onStart?: () => void;
  onComplete?: () => void;
  /** A TV: no blur. */
  lowResourceAnimation?: boolean;
  /** Keep the wordmark hidden while the identical shared logo sits on top of it. */
  logoVisible?: boolean;
}

/** The app's intro, on Home's first showing: IntroStage playing the three phases. */
export const IntroAnimation = forwardRef<LogoAnimationHandle, IntroAnimationProps>(
  ({ onReady, onStart, onComplete, lowResourceAnimation = false, logoVisible = true }, ref) => {
    const stageRef = useRef<IntroStageHandle>(null);
    const startRef = useRef(onStart);
    startRef.current = onStart;
    const readyRef = useRef(onReady);
    readyRef.current = onReady;

    const handlePhaseStart = useCallback((phase: IntroPhase) => {
      if (phase === expandPhase) startRef.current?.();
    }, []);
    const handleReady = useCallback(() => readyRef.current?.(), []);

    useImperativeHandle(
      ref,
      () => ({
        start: () => stageRef.current?.restart(),
        pause: () => stageRef.current?.pause(),
        resume: () => stageRef.current?.resume(),
        seek: progress => stageRef.current?.seek(progress),
        reset: () => stageRef.current?.seek(0),
        getProgress: () => stageRef.current?.getProgress() ?? 0,
      }),
      []
    );

    return (
      <IntroStage
        ref={stageRef}
        phases={INTRO_PHASES}
        lowResourceAnimation={lowResourceAnimation}
        logoVisible={logoVisible}
        onReady={handleReady}
        onPhaseStart={handlePhaseStart}
        onComplete={onComplete}
      />
    );
  }
);

IntroAnimation.displayName = 'IntroAnimation';
