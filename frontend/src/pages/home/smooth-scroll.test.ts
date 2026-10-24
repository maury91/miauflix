import { afterEach, describe, expect, it, vi } from 'vitest';

import { createSmoothScroller, isAtRest, stepSpring } from './smooth-scroll';

const settle = (start: { position: number; velocity: number }, target: number, frames: number) => {
  let state = start;
  const positions: number[] = [];
  for (let frame = 0; frame < frames; frame += 1) {
    state = stepSpring(state, target, 1 / 60);
    positions.push(state.position);
  }
  return { state, positions };
};

describe('stepSpring', () => {
  it('reaches the target without overshooting', () => {
    const { state, positions } = settle({ position: 0, velocity: 0 }, 400, 60);
    expect(isAtRest(state, 400)).toBe(true);
    expect(Math.max(...positions)).toBeLessThanOrEqual(400);
    positions
      .slice(1)
      .forEach((position, index) => expect(position).toBeGreaterThanOrEqual(positions[index]));
  });

  it('keeps its speed when the target moves mid-animation, so two moves blend into one', () => {
    const halfway = settle({ position: 0, velocity: 0 }, 400, 6).state;
    const retargeted = stepSpring(halfway, 800, 1 / 60);
    expect(halfway.velocity).toBeGreaterThan(0);
    expect(retargeted.velocity).toBeGreaterThan(halfway.velocity * 0.5);
    const { state, positions } = settle(retargeted, 800, 60);
    expect(isAtRest(state, 800)).toBe(true);
    positions
      .slice(1)
      .forEach((position, index) => expect(position).toBeGreaterThanOrEqual(positions[index]));
  });

  it('gives the same result for one long frame as for many short ones', () => {
    const once = stepSpring({ position: 0, velocity: 0 }, 400, 0.1);
    const many = settle({ position: 0, velocity: 0 }, 400, 6).state;
    expect(once.position).toBeCloseTo(many.position, 6);
  });
});

describe('createSmoothScroller', () => {
  afterEach(() => vi.unstubAllGlobals());

  const setup = () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      frames.push(callback)
    );
    vi.stubGlobal('cancelAnimationFrame', () => {});
    const element = document.createElement('div');
    Object.defineProperties(element, {
      scrollWidth: { value: 5000 },
      clientWidth: { value: 1000 },
    });
    const runFrame = (time: number) => frames.shift()?.(time);
    return { element, frames, runFrame, scroller: createSmoothScroller(element, 'x') };
  };

  it('starts with an ordinary frame, however long the render before it took', () => {
    const { element, runFrame, scroller } = setup();
    scroller.scrollTo(400);
    runFrame(5_000);
    const oneFrame = stepSpring({ position: 0, velocity: 0 }, 400, 1 / 60).position;
    expect(element.scrollLeft).toBeCloseTo(oneFrame, 0);
  });

  it('lands exactly on the target, and heads for a new target without restarting', () => {
    const { element, frames, runFrame, scroller } = setup();
    scroller.scrollTo(400);
    runFrame(0);
    runFrame(16);
    scroller.scrollTo(800);
    expect(frames).toHaveLength(1);
    for (let time = 32; frames.length; time += 16) runFrame(time);
    expect(element.scrollLeft).toBe(800);
  });

  it('clamps targets to the scrollable range', () => {
    const { element, frames, runFrame, scroller } = setup();
    scroller.scrollTo(99_999);
    for (let time = 0; frames.length; time += 16) runFrame(time);
    expect(element.scrollLeft).toBe(4000);
  });
});
