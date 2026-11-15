import { useSurfaceContext } from '../surface';
import type { Space } from '../tokens';
import * as styles from './divider.css';

export interface DividerProps {
  /** `horizontal` between stacked content; `vertical` between items in a row (fills its height). */
  orientation?: 'horizontal' | 'vertical';
  /** Room on both sides of the line, a space token. None by default. */
  spacing?: Space;
  /**
   * Purely visual: hidden from assistive technology. Leave it off when the line separates
   * sections a reader should know apart.
   */
  decorative?: boolean;
}

/**
 * A hairline separating groups of content. Passive: never a focus target and no part of
 * navigation. Horizontal, it is an `hr`; vertical, a `separator` with its orientation.
 */
export function Divider({ orientation = 'horizontal', spacing, decorative = false }: DividerProps) {
  const surface = useSurfaceContext();
  const common = {
    className: styles.divider,
    'data-orientation': orientation,
    'data-spacing': spacing,
    'data-surface': surface,
  };
  if (decorative) return <span {...common} aria-hidden="true" />;
  if (orientation === 'horizontal') return <hr {...common} />;
  return <span {...common} role="separator" aria-orientation="vertical" />;
}
