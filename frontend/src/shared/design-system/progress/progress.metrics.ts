import { color, space } from '../tokens';

/**
 * ProgressSpinner's numbers, shared by its CSS (progress.css.ts) and its picture
 * (spinner.art.ts). Lengths are token strings (rem).
 */
export const spinnerMetrics = {
  size: { sm: '1.5rem', md: '2rem', lg: '3rem' },
  /** Between the icon and a shown label. */
  labelGap: space.sm,
  /** A labelled spinner's colour (the icon is the current text colour). */
  labelledColor: color.textSecondary,
  /** One turn (ms), drawn: the icon's own animation is SVG. */
  turnMs: 1000,
} as const;

export type SpinnerSize = keyof typeof spinnerMetrics.size;
