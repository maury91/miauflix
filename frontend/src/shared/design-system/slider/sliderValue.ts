export interface SliderRange {
  min: number;
  max: number;
  /** The value grid: every value is `min` plus a whole number of steps. */
  step: number;
}

const decimals = (value: number) => {
  const text = String(value);
  const point = text.indexOf('.');
  return point === -1 ? 0 : text.length - point - 1;
};

/** Snaps a value to the range's step grid and clamps it to the limits. */
export function snapSliderValue(value: number, { min, max, step }: SliderRange): number {
  if (!Number.isFinite(value)) return min;
  // Fixed to the precision of the step and `min`, so 0.1 steps never drift to 0.30000000000000004
  const precision = Math.max(decimals(step), decimals(min));
  const steps = step > 0 ? Math.round((value - min) / step) : 0;
  const snapped = Number((min + steps * step).toFixed(precision));
  // The highest value on the grid, when `max` is not on it. The quotient is rounded first, so a
  // floating-point error (0.3 / 0.1 = 2.9999999999999996) never drops a maximum that is on it
  const quotient = step > 0 ? Number(((max - min) / step).toFixed(9)) : 0;
  const top = step > 0 ? min + Math.floor(quotient) * step : max;
  return Math.min(Math.max(snapped, min), Number(top.toFixed(precision)));
}

/**
 * The value after one adjustment: `amount` (the key step) towards `direction`, on the grid and
 * within the limits. At a limit it stays there: a slider clamps, it never lets the key exit.
 */
export function stepSliderValue(
  value: number,
  direction: -1 | 1,
  range: SliderRange,
  amount = range.step
): number {
  return snapSliderValue(snapSliderValue(value, range) + direction * amount, range);
}

/** Where a value sits along the range, from 0 to 1. */
export function sliderShare(value: number, { min, max }: Pick<SliderRange, 'min' | 'max'>) {
  if (!(max > min) || !Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, (value - min) / (max - min)));
}
