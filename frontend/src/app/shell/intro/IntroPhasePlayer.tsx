import { Button, Slider } from '@shared/design-system';
import { useCallback, useEffect, useRef, useState } from 'react';

import interfaceBackground from '../../../assets/test-backgrounds/miauwatch-interface.svg';
import type { IntroPhase } from './introPhase';
import { IntroStage, type IntroStageHandle } from './IntroStage';

/**
 * Storybook only: plays intro phases on the stage, with a panel to replay, pause and scrub them.
 * Shared by the stories of each phase.
 */
export const IntroPhasePlayer = ({
  phases,
  autoStart,
  loop,
  lowResourceAnimation,
  showControls = true,
}: {
  phases: readonly IntroPhase[];
  autoStart: boolean;
  /** Replay a moment after it ends. */
  loop: boolean;
  lowResourceAnimation: boolean;
  /** The panel to replay and scrub; the visual tests hide it. */
  showControls?: boolean;
}) => {
  const stageRef = useRef<IntroStageHandle>(null);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [completions, setCompletions] = useState(0);

  /** The automatic replay waiting after the end; a manual action cancels it. */
  const replayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelReplay = useCallback(() => {
    if (replayTimerRef.current !== null) clearTimeout(replayTimerRef.current);
    replayTimerRef.current = null;
  }, []);

  useEffect(() => {
    if (!loop || completions === 0) return undefined;
    replayTimerRef.current = setTimeout(() => {
      replayTimerRef.current = null;
      stageRef.current?.restart();
    }, 1000);
    return cancelReplay;
  }, [loop, completions, cancelReplay]);

  const replay = () => {
    cancelReplay();
    stageRef.current?.restart();
  };
  const pause = () => {
    cancelReplay();
    stageRef.current?.pause();
  };
  const seek = (progress: number) => {
    cancelReplay();
    stageRef.current?.seek(progress);
  };
  // A new timeline (the phases or the TV mode changed): a replay due for the old one must not
  // interrupt it
  const handleReady = (durationSeconds: number) => {
    cancelReplay();
    setDuration(durationSeconds);
  };

  // The visual tests (e2e/logo-animation.storybook.spec.ts) seek through it
  const seekRef = useRef(seek);
  seekRef.current = seek;
  useEffect(() => {
    const testWindow = window as typeof window & { seek?: (progress: number) => void };
    testWindow.seek = progress => seekRef.current(progress);
    return () => {
      delete testWindow.seek;
    };
  }, []);

  return (
    <div>
      {/* The page the intro reveals */}
      <div
        style={{
          width: '100vw',
          height: '100vh',
          backgroundColor: 'rgb(35 43 57)',
          backgroundImage: `url(${interfaceBackground})`,
          backgroundSize: 'contain',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      />
      <IntroStage
        ref={stageRef}
        phases={phases}
        autoStart={autoStart}
        lowResourceAnimation={lowResourceAnimation}
        onProgress={setProgress}
        onReady={handleReady}
        onComplete={() => setCompletions(count => count + 1)}
      />
      <div
        style={{
          display: showControls ? 'flex' : 'none',
          position: 'fixed',
          bottom: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 14px',
          background: 'rgba(40, 40, 40, 0.9)',
          color: 'white',
          borderRadius: '8px',
          fontFamily: 'monospace',
          fontSize: '12px',
          zIndex: 3000,
        }}
      >
        <Button size="sm" onClick={replay}>
          Replay
        </Button>
        <Button size="sm" onClick={pause}>
          Pause
        </Button>
        <Button size="sm" onClick={() => stageRef.current?.resume()}>
          Resume
        </Button>
        <div style={{ width: '280px' }}>
          <Slider
            label="Progress"
            value={progress}
            min={0}
            max={1}
            step={0.001}
            valueText={`${(progress * duration).toFixed(2)}s / ${duration.toFixed(2)}s`}
            onChange={seek}
          />
        </div>
      </div>
    </div>
  );
};
