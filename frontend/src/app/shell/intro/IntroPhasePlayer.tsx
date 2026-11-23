import { Button, Slider } from '@shared/design-system';
import { useEffect, useRef, useState } from 'react';

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
}: {
  phases: readonly IntroPhase[];
  autoStart: boolean;
  /** Replay a moment after it ends. */
  loop: boolean;
  lowResourceAnimation: boolean;
}) => {
  const stageRef = useRef<IntroStageHandle>(null);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [completions, setCompletions] = useState(0);

  // The visual tests (e2e/logo-animation.storybook.spec.ts) seek through it
  useEffect(() => {
    const testWindow = window as typeof window & { seek?: (progress: number) => void };
    testWindow.seek = progress => stageRef.current?.seek(progress);
    return () => {
      delete testWindow.seek;
    };
  }, []);

  useEffect(() => {
    if (!loop || completions === 0) return undefined;
    const timer = setTimeout(() => stageRef.current?.restart(), 1000);
    return () => clearTimeout(timer);
  }, [loop, completions]);

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
        onReady={setDuration}
        onComplete={() => setCompletions(count => count + 1)}
      />
      <div
        style={{
          position: 'fixed',
          bottom: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
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
        <Button size="sm" onClick={() => stageRef.current?.restart()}>
          Replay
        </Button>
        <Button size="sm" onClick={() => stageRef.current?.pause()}>
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
            onChange={value => stageRef.current?.seek(value)}
          />
        </div>
      </div>
    </div>
  );
};
