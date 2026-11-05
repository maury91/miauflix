import type { PlushieViewer } from 'plushies/viewer';
import { memo, useEffect, useRef } from 'react';
import styled from 'styled-components';

import type { PlushieLook } from './look';
import { loadPlushies } from './runtime';

const Stage = styled.div`
  position: relative;
  width: 100%;
  height: 100%;

  canvas {
    display: block;
    width: 100% !important;
    height: 100% !important;
  }
`;

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export interface PlushieLiveProps {
  look: PlushieLook;
  /** Blink, breathe and, now and then, hop or glance around on its own. */
  animated?: boolean;
  /** Each change makes the Plushie hop (e.g. when its card is focused). */
  hopSignal?: number;
  className?: string;
  onError?: () => void;
}

/** A live 3D Plushie filling its container. */
export const PlushieLive = memo(function PlushieLive({
  look,
  animated = false,
  hopSignal = 0,
  className,
  onError,
}: PlushieLiveProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<PlushieViewer | null>(null);
  const lookRef = useRef(look);
  lookRef.current = look;
  const animatedRef = useRef(animated);
  animatedRef.current = animated;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    let disposed = false;
    loadPlushies()
      .then(({ THREE, viewer }) => {
        const stage = stageRef.current;
        if (disposed || !stage) return;
        viewRef.current = viewer.mountPlushie(stage, THREE, {
          ...lookRef.current,
          idle: animatedRef.current && !prefersReducedMotion(),
          maxPixelRatio: 1.5,
        });
      })
      .catch(() => onErrorRef.current?.());
    return () => {
      disposed = true;
      viewRef.current?.dispose();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    viewRef.current?.restyle(look);
  }, [look]);

  useEffect(() => {
    const motion = animated && !prefersReducedMotion();
    viewRef.current?.setIdle(motion);
    if (!motion) return undefined;
    // Now and then a little gesture, at a different moment for each Plushie.
    let timer: number;
    const schedule = () => {
      timer = window.setTimeout(
        () => {
          const view = viewRef.current;
          const gesture = Math.random();
          if (view) {
            if (gesture < 0.5) void view.hop(18);
            else if (gesture < 0.8) void view.squish(0.12);
            else void view.look(Math.random() * 2 - 1, Math.random() - 0.5, 0.4);
          }
          schedule();
        },
        6000 + Math.random() * 6000
      );
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, [animated]);

  useEffect(() => {
    if (!hopSignal || prefersReducedMotion()) return;
    void viewRef.current?.hop();
  }, [hopSignal]);

  return <Stage ref={stageRef} className={className} aria-hidden="true" data-plushie="" />;
});
