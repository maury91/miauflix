import type { ReactNode } from 'react';

import type { ControlSize } from '../tokens';
import * as styles from './icon.css';

export type IconProps = {
  /** The SVG icon (an `~icons/...` component). It fills the box and draws in `currentColor`. */
  children: ReactNode;
  /** A control size's icon size, or `inherit` (1em) to match the surrounding text. */
  size?: ControlSize | 'inherit';
} & (
  | {
      /** Meaningful on its own (a status with no text beside it): named as an image. */
      label: string;
    }
  | {
      /** Decorative (the default): hidden from assistive technology. */
      label?: undefined;
    }
);

/**
 * A standalone icon with the shared sizes. Icons inside Buttons, fields and list rows are sized by
 * those components; use this one beside text or as a status. Never a focus target.
 */
export function Icon({ children, size = 'inherit', label }: IconProps) {
  return (
    <span
      className={styles.icon}
      data-size={size === 'inherit' ? undefined : size}
      {...(label === undefined ? { 'aria-hidden': true } : { role: 'img', 'aria-label': label })}
    >
      {children}
    </span>
  );
}
