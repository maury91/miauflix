/** How long a lost context may take to come back before the surface gives up (ms). */
export const RESTORE_WAIT_MS = 3000;
/** Losses in one surface's life after which it gives up at once (the GPU keeps resetting). */
export const MAX_CONTEXT_LOSSES = 3;

/**
 * When a surface stops waiting for its WebGL context and falls back to the DOM: a loss not
 * restored within RESTORE_WAIT_MS, or the MAX_CONTEXT_LOSSES-th loss. `giveUp` runs once.
 */
export class ContextLossPolicy {
  private losses = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private done = false;

  constructor(
    private readonly giveUp: (reason: string) => void,
    private readonly restoreWaitMs = RESTORE_WAIT_MS,
    private readonly maxLosses = MAX_CONTEXT_LOSSES
  ) {}

  lost() {
    if (this.done) return;
    this.losses++;
    if (this.losses >= this.maxLosses) {
      this.fail(`WebGL context lost ${this.losses} times`);
      return;
    }
    clearTimeout(this.timer);
    this.timer = setTimeout(
      () => this.fail(`WebGL context not restored within ${this.restoreWaitMs} ms`),
      this.restoreWaitMs
    );
  }

  restored() {
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  dispose() {
    clearTimeout(this.timer);
    this.done = true;
  }

  private fail(reason: string) {
    this.dispose();
    this.giveUp(reason);
  }
}
