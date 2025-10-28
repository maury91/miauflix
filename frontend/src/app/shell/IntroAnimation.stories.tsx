import type { Meta, StoryObj } from '@storybook/react-vite';
import { useCallback, useEffect, useRef, useState } from 'react';

import { IntroAnimation, type LogoAnimationHandle } from './IntroAnimation';

const meta: Meta<typeof IntroAnimation> = {
  title: 'Animations/Intro Animation',
  component: IntroAnimation,
  parameters: {
    layout: 'fullscreen',
    backgrounds: {
      default: 'dark',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Intro animation
export const Intro: Story = {
  render: () => {
    const animationRef = useRef<LogoAnimationHandle>(null);
    const [isComplete, setIsComplete] = useState(false);

    return (
      <div>
        <div
          style={{
            width: '100vw',
            height: '100vh',
            background: 'url(/src/assets/test-backgrounds/miauflix-interface.svg)',
            backgroundSize: 'contain',
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'center',
            backgroundColor: 'rgb(35 43 57)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontSize: '24px',
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <button
              style={{
                padding: '10px 20px',
                background: '#db202c',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                marginTop: '20px',
                fontSize: '3vh',
              }}
              onClick={() => setIsComplete(false)}
            >
              Replay Intro
            </button>
          </div>
        </div>
        {!isComplete && (
          <IntroAnimation
            autoStart={true}
            duration={2.5}
            delay={1}
            ref={animationRef}
            onComplete={() => setIsComplete(true)}
            lowResourceAnimation={false}
          />
        )}
      </div>
    );
  },
};

// Interactive Controls Story - Full parameter control via Storybook Controls
interface InteractiveControlsArgs {
  autoStart: boolean;
  duration: number;
  delay: number;
  seekPosition: number;
  backgroundColor: string;
  backgroundImage: boolean;
  showInfo: boolean;
  lowResourceAnimation: boolean;
}

type InteractiveControlsStory = StoryObj<InteractiveControlsArgs>;

export const InteractiveControls: InteractiveControlsStory = {
  args: {
    autoStart: false,
    duration: 2.5,
    delay: 1.0,
    seekPosition: 0,
    backgroundColor: '#5b8bec',
    backgroundImage: true,
    showInfo: true,
    lowResourceAnimation: false,
  },
  argTypes: {
    autoStart: {
      control: 'boolean',
      description: 'Whether to start the animation automatically',
    },
    duration: {
      control: { type: 'range', min: 0.5, max: 10, step: 0.1 },
      description: 'Animation duration in seconds',
    },
    delay: {
      control: { type: 'range', min: 0, max: 5, step: 0.1 },
      description: 'Delay before animation starts (seconds)',
    },
    seekPosition: {
      control: { type: 'range', min: 0, max: 1, step: 0.01 },
      description: 'Seek to specific animation progress (0-1)',
    },
    backgroundColor: {
      control: 'color',
      description: 'Background color',
    },
    backgroundImage: {
      control: 'boolean',
      description: 'Use Miauflix streaming interface background',
    },
    showInfo: {
      control: 'boolean',
      description: 'Show info panel',
    },
    lowResourceAnimation: {
      control: 'boolean',
      description: 'Enable low resource mode (skips blur effects)',
    },
  },
  render: args => {
    const logoRef = useRef<LogoAnimationHandle>(null);
    const [currentProgress, setCurrentProgress] = useState(0);
    const [isAnimating, setIsAnimating] = useState(false);
    const previousSeekPosition = useRef(0);

    const seek = useCallback((progress: number) => {
      if (logoRef.current) {
        logoRef.current.seek(progress);
        previousSeekPosition.current = progress;
      }
    }, []);

    // @ts-expect-error - this is a custom property for testing
    window.seek = seek;

    const onReady = useCallback(() => {
      seek(args.seekPosition);
    }, [args.seekPosition, seek]);

    // Track animation progress
    useEffect(() => {
      const interval = setInterval(() => {
        if (logoRef.current) {
          setCurrentProgress(logoRef.current.getProgress());
          setIsAnimating(logoRef.current.isAnimating());
        }
      }, 100);

      return () => clearInterval(interval);
    }, []);

    // Handle seeking when seekPosition changes
    useEffect(() => {
      if (logoRef.current && args.seekPosition !== previousSeekPosition.current) {
        seek(args.seekPosition);
      }
    }, [args.seekPosition, seek]);

    // Handle autoStart changes
    useEffect(() => {
      if (args.autoStart && logoRef.current) {
        logoRef.current.start();
      }
    }, [args.autoStart]);

    return (
      <div>
        <div
          style={{
            width: '100vw',
            height: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: args.backgroundImage ? 'rgb(35 43 57)' : args.backgroundColor,
            backgroundImage: args.backgroundImage
              ? 'url(/src/assets/test-backgrounds/miauflix-interface.svg)'
              : 'none',
            backgroundSize: 'contain',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            fontSize: '7vw',
          }}
        >
          <IntroAnimation
            ref={logoRef}
            autoStart={false} // Controlled manually
            onReady={onReady}
            lowResourceAnimation={args.lowResourceAnimation}
          />
        </div>

        {/* Control Panel Overlay */}
        <div
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            color: 'white',
            padding: '15px',
            borderRadius: '8px',
            fontFamily: 'monospace',
            fontSize: '14px',
            zIndex: 3000,
            minWidth: '200px',
            display: args.showInfo ? 'block' : 'none',
          }}
        >
          <div style={{ marginBottom: '10px', fontWeight: 'bold' }}>Animation Status</div>
          <div>Progress: {Math.round(currentProgress * 100)}%</div>
          <div>Duration: {args.duration}s</div>
          <div>Delay: {args.delay}s</div>
          <div>Status: {isAnimating ? 'Running' : 'Paused'}</div>
          <div>Low resource mode: {args.lowResourceAnimation ? 'Enabled' : 'Disabled'}</div>

          <div style={{ marginTop: '15px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              style={{
                padding: '5px 10px',
                background: '#db202c',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
              }}
              onClick={() => logoRef.current?.start()}
            >
              Start
            </button>
            <button
              style={{
                padding: '5px 10px',
                background: '#666',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
              }}
              onClick={() => logoRef.current?.pause()}
            >
              Pause
            </button>
            <button
              style={{
                padding: '5px 10px',
                background: '#666',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
              }}
              onClick={() => logoRef.current?.resume()}
            >
              Resume
            </button>
            <button
              style={{
                padding: '5px 10px',
                background: '#333',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
              }}
              onClick={() => logoRef.current?.reset()}
            >
              Reset
            </button>
          </div>
        </div>
      </div>
    );
  },
};
