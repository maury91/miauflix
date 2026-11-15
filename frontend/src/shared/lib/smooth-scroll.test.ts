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

describe('createSmoothScroller in transform mode', () => {
  const setup = () => {
    const track = document.createElement('div');
    // Reading the track's size would lay out the page on each move.
    Object.defineProperty(track, 'scrollWidth', {
      get: () => {
        throw new Error('measured the track');
      },
    });
    const onRest = vi.fn();
    const scroller = createSmoothScroller(track, 'x', { transform: true, onRest });
    const land = (propertyName = 'transform') =>
      track.dispatchEvent(Object.assign(new Event('transitionend'), { propertyName }));
    return { track, scroller, onRest, land };
  };

  it('transitions the track to the target instead of scrolling it, without measuring it', () => {
    const { track, scroller, onRest, land } = setup();
    scroller.scrollTo(4000);

    expect(track.style.transform).toBe('translate3d(-4000px, 0, 0)');
    expect(track.style.transition).toContain('transform 300ms');
    expect(track.scrollLeft).toBe(0);
    expect(scroller.position()).toBe(4000);
    expect(onRest).not.toHaveBeenCalled();

    land('opacity');
    expect(onRest).not.toHaveBeenCalled();
    land();
    expect(onRest).toHaveBeenCalledOnce();
  });

  it('jumps without a transition, reporting rest, and never past the start', () => {
    const { track, scroller, onRest } = setup();
    scroller.scrollTo(-50, { instant: true });
    expect(track.style.transition).toBe('none');
    expect(scroller.position()).toBe(0);
    expect(onRest).toHaveBeenCalledOnce();

    scroller.scrollTo(400, { instant: true });
    expect(track.style.transform).toBe('translate3d(-400px, 0, 0)');
    expect(onRest).toHaveBeenCalledTimes(2);
  });

  it('ignores a target it is already at', () => {
    const { track, scroller } = setup();
    scroller.scrollTo(0);
    expect(track.style.transform).toBe('');
  });
});
