/**
 * Hands `apply` the latest value at most once per burst of changes, outside React (no render per
 * change). A change after `delayMs` without one applies on the next task, after the change that
 * caused it has painted; changes in quicker succession (a held key) apply once they pause for
 * `delayMs`. With `delayMs` 0 every value applies at once, synchronously.
 */
export function createCoalescer<T>(delayMs: number, apply: (value: T) => void) {
  let lastChange = Number.NEGATIVE_INFINITY;
  let timer: number | undefined;
  let latest: T;
  const flush = () => {
    timer = undefined;
    apply(latest);
  };
  return {
    push(value: T) {
      latest = value;
      if (delayMs <= 0) {
        apply(value);
        return;
      }
      const now = performance.now();
      const quiet = now - lastChange >= delayMs;
      lastChange = now;
      window.clearTimeout(timer);
      timer = window.setTimeout(flush, quiet ? 0 : delayMs);
    },
    /** Applies a pending value now (the user left or opened something). */
    flush() {
      if (timer === undefined) return;
      window.clearTimeout(timer);
      flush();
    },
    cancel() {
      window.clearTimeout(timer);
      timer = undefined;
    },
  };
}
