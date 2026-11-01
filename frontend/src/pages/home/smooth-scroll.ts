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
  /**
   * Animate to `target` (clamped to the scrollable range; in `transform` mode only to 0 and up);
   * `instant` jumps there.
   */
  scrollTo: (target: number, options?: { instant?: boolean }) => void;
  /** Stop animating where the scroll position is now. */
  stop: () => void;
  /** Stop and release the element's listeners. */
  dispose: () => void;
  /** The current position: the scroll offset, or the translation in `transform` mode. */
  position: () => number;
}

export interface SmoothScrollerOptions {
  /**
   * Move the element with a `translate3d` transition instead of scrolling it; its parent clips
   * it. Setting a scroll offset makes Chromium lay out the page synchronously, every frame, and
   * even a transform written each frame costs the TV ~12 ms of style, layout and layer updates
   * per frame; a CSS transition runs on the compositor and leaves the main thread free. The
   * caller keeps targets within the element: measuring its width would lay out the page on each
   * move, just after the move's render changed it.
   */
  transform?: boolean;
  /** Called whenever the position comes to rest (`transform` mode has no scroll events). */
  onRest?: () => void;
}

/** The `transform` mode's transition: about as long as the spring takes, decelerating. */
const TRANSITION = 'transform 300ms cubic-bezier(0.25, 0.8, 0.3, 1)';

const prefersReducedMotion = () =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Drive `element`'s scroll position on one axis. Scrolling with a wheel, touch or the scrollbar
 * stops the animation, so the user's own scrolling always wins.
 */
export function createSmoothScroller(
  element: HTMLElement,
  axis: 'x' | 'y',
  { transform = false, onRest }: SmoothScrollerOptions = {}
): SmoothScroller {
  if (transform) return createTransitionScroller(element, axis, onRest);
  const property = axis === 'x' ? 'scrollLeft' : 'scrollTop';
  const read = () => element[property];
  const write = (position: number) => {
    element[property] = position;
  };
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
      write(target);
      stop();
      return;
    }
    write(state.position);
    frame = requestAnimationFrame(tick);
  };

  const userScrollEvents = ['wheel', 'touchstart', 'pointerdown'] as const;
  userScrollEvents.forEach(event => element.addEventListener(event, stop, { passive: true }));

  return {
    scrollTo(next, { instant = false } = {}) {
      target = Math.max(0, Math.min(next, Math.max(0, maxScroll())));
      if (instant || prefersReducedMotion() || typeof requestAnimationFrame !== 'function') {
        stop();
        write(target);
        return;
      }
      if (state) return; // Already animating: the running spring heads for the new target.
      state = { position: read(), velocity: 0 };
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
    position: read,
  };
}

/** `transform` mode (see SmoothScrollerOptions): the compositor animates a CSS transition. */
function createTransitionScroller(
  element: HTMLElement,
  axis: 'x' | 'y',
  onRest: (() => void) | undefined
): SmoothScroller {
  let translation = 0;
  const write = (position: number, transition: string) => {
    element.style.transition = transition;
    element.style.transform =
      axis === 'x' ? `translate3d(${-position}px, 0, 0)` : `translate3d(0, ${-position}px, 0)`;
  };
  const landed = (event: TransitionEvent) => {
    if (event.target === element && event.propertyName === 'transform') onRest?.();
  };
  element.addEventListener('transitionend', landed);

  return {
    scrollTo(next, { instant = false } = {}) {
      const target = Math.max(0, next);
      if (target === translation && !instant) return;
      translation = target;
      if (instant || prefersReducedMotion()) {
        write(target, 'none');
        onRest?.();
        return;
      }
      // A new target mid-transition starts from where the running one has got to.
      write(target, TRANSITION);
    },
    stop() {},
    dispose() {
      element.removeEventListener('transitionend', landed);
    },
    // Where the element is heading: it is there, or will be within the transition.
    position: () => translation,
  };
}
