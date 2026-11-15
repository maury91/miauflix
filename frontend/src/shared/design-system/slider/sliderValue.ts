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
  const steps = step > 0 ? Math.round((value - min) / step) : 0;
  // Fixed to the step's precision, so 0.1 steps never drift to 0.30000000000000004
  const snapped = Number((min + steps * step).toFixed(Math.max(decimals(step), decimals(min))));
  // The highest value on the grid, when `max` is not on it
  const top = step > 0 ? min + Math.floor((max - min) / step) * step : max;
  return Math.min(Math.max(snapped, min), Number(top.toFixed(decimals(step))));
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
