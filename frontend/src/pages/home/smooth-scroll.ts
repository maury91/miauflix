/**
 * Animated scrolling for Home's rows and row list.
 *
 * The scroll position follows its target like a critically damped spring: it moves quickly,
 * slows into place and never overshoots. A new target set mid-animation keeps the current speed,
 * so quick key presses (or a held key) blend into one continuous motion instead of restarting.
 */

/** How strongly the position is pulled to its target (1/s); ~300ms to settle. */
const STIFFNESS = 20;
/** Close enough (px, px/s) to stop animating and land exactly on the target. */
const REST_DISTANCE = 0.5;
const REST_SPEED = 10;
/** Longer frame gaps (a busy main thread, a background tab) are treated as this long (s). */
const MAX_FRAME_S = 0.1;
/** The first frame counts as one ordinary frame (s), however long the render before it took. */
const FIRST_FRAME_S = 1 / 60;

export interface SpringState {
  position: number;
  velocity: number;
}

/** Advance a critically damped spring by `seconds`; exact for any frame length. */
export function stepSpring(state: SpringState, target: number, seconds: number): SpringState {
  const offset = state.position - target;
  const decay = Math.exp(-STIFFNESS * seconds);
  const drift = (state.velocity + STIFFNESS * offset) * seconds;
  return {
    position: target + (offset + drift) * decay,
    velocity: (state.velocity - STIFFNESS * drift) * decay,
  };
}

export function isAtRest(state: SpringState, target: number): boolean {
  return Math.abs(state.position - target) < REST_DISTANCE && Math.abs(state.velocity) < REST_SPEED;
}

export interface SmoothScroller {
  /** Animate to `target` (clamped to the scrollable range); `instant` jumps there. */
  scrollTo: (target: number, options?: { instant?: boolean }) => void;
  /** Stop animating where the scroll position is now. */
  stop: () => void;
  /** Stop and release the element's listeners. */
  dispose: () => void;
}

const prefersReducedMotion = () =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Drive `element`'s scroll position on one axis. Scrolling with a wheel, touch or the scrollbar
 * stops the animation, so the user's own scrolling always wins.
 */
export function createSmoothScroller(element: HTMLElement, axis: 'x' | 'y'): SmoothScroller {
  const property = axis === 'x' ? 'scrollLeft' : 'scrollTop';
  let state: SpringState | null = null;
  let target = 0;
  let frame = 0;
  /** Time of the previous animation frame; null until the animation's first frame. */
  let lastTime: number | null = null;

  const maxScroll = () =>
    axis === 'x'
      ? element.scrollWidth - element.clientWidth
      : element.scrollHeight - element.clientHeight;

  const stop = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    state = null;
    lastTime = null;
  };

  const tick = (time: number) => {
    if (!state) return;
    // The key press that starts an animation usually re-renders Home; timing from the press
    // would turn that render into a jump on the first painted frame.
    const seconds =
      lastTime === null
        ? FIRST_FRAME_S
        : Math.min(MAX_FRAME_S, Math.max(0, (time - lastTime) / 1000));
    lastTime = time;
    state = stepSpring(state, target, seconds);
    if (isAtRest(state, target)) {
      element[property] = target;
      stop();
      return;
    }
    element[property] = state.position;
    frame = requestAnimationFrame(tick);
  };

  const userScrollEvents = ['wheel', 'touchstart', 'pointerdown'] as const;
  userScrollEvents.forEach(event => element.addEventListener(event, stop, { passive: true }));

  return {
    scrollTo(next, { instant = false } = {}) {
      target = Math.max(0, Math.min(next, Math.max(0, maxScroll())));
      if (instant || prefersReducedMotion() || typeof requestAnimationFrame !== 'function') {
        stop();
        element[property] = target;
        return;
      }
      if (state) return; // Already animating: the running spring heads for the new target.
      state = { position: element[property], velocity: 0 };
      if (isAtRest(state, target)) {
        state = null;
        return;
      }
      frame = requestAnimationFrame(tick);
    },
    stop,
    dispose() {
      stop();
      userScrollEvents.forEach(event => element.removeEventListener(event, stop));
    },
  };
}
