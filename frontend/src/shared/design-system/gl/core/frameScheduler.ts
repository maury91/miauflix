/**
 * The frame loop: frames run in requestAnimationFrame only while something asks for them (an
 * animation, a load, a change), and each frame's background work (uploads, text, bakes) shares
 * one time budget.
 */

export interface FrameClock {
  request(callback: (time: number) => void): number;
  cancel(handle: number): void;
  now(): number;
}

export const browserClock: FrameClock = {
  request: callback => requestAnimationFrame(callback),
  cancel: handle => cancelAnimationFrame(handle),
  now: () => performance.now(),
};

/** Kinds of background work, each timed for the stats. */
export type FrameWork = 'upload' | 'text' | 'bake';

/**
 * The time a frame gives to background work. Each kind still gets its first item (a frame never
 * stalls a queue), then items while time is left; whatever runs first spends from the same pool.
 */
export class FrameBudget {
  /** ms spent per kind this frame. */
  readonly spent: Record<FrameWork, number> = { upload: 0, text: 0, bake: 0 };
  private readonly started: number;

  constructor(
    private readonly clock: Pick<FrameClock, 'now'>,
    readonly ms: number
  ) {
    this.started = clock.now();
  }

  /** ms left (negative once over). */
  left() {
    return this.ms - (this.clock.now() - this.started);
  }

  /** Whether the next item of a kind may run: its first one always, others while time is left. */
  allows(done: number) {
    return done === 0 || this.left() > 0;
  }

  /** Runs one item of `kind`, timing it. */
  run<T>(kind: FrameWork, work: () => T): T {
    const start = this.clock.now();
    try {
      return work();
    } finally {
      this.spent[kind] += this.clock.now() - start;
    }
  }
}

export interface FrameSchedulerOptions {
  /**
   * Draws one frame. Returns true while it wants another (animating, work left). An error is
   * reported and the loop goes on: one bad frame must not stop it (the canvas would keep a
   * cleared frame).
   */
  frame: (time: number, budget: FrameBudget) => boolean;
  onError?: (error: unknown) => void;
  /** The frame's budget for background work (ms). */
  budgetMs: number;
  clock?: FrameClock;
}

export class FrameScheduler {
  private handle = 0;
  private disposed = false;
  private readonly clock: FrameClock;

  constructor(private readonly options: FrameSchedulerOptions) {
    this.clock = options.clock ?? browserClock;
  }

  /** Asks for a frame (one at most is pending). */
  invalidate = () => {
    if (this.handle || this.disposed) return;
    this.handle = this.clock.request(this.run);
  };

  get pending() {
    return this.handle !== 0;
  }

  dispose() {
    this.disposed = true;
    if (this.handle) this.clock.cancel(this.handle);
    this.handle = 0;
  }

  private run = (time: number) => {
    this.handle = 0;
    if (this.disposed) return;
    let again: boolean;
    try {
      again = this.options.frame(time, new FrameBudget(this.clock, this.options.budgetMs));
    } catch (error) {
      this.options.onError?.(error);
      again = true;
    }
    if (again) this.invalidate();
  };
}
