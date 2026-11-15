import { createElement, type HTMLAttributes, type ReactNode } from 'react';

import type { LayoutElement } from '../layout/Stack';
import { SurfaceContextProvider } from '../surface';
import type { Radius, Space } from '../tokens';
import * as styles from './surfacePanel.css';

export type SurfaceProps = Omit<
  HTMLAttributes<HTMLElement>,
  // Static: a Surface never acts, so no pointer or key handlers
  'className' | 'style' | 'children' | 'onClick' | 'onKeyDown' | 'onKeyUp' | 'tabIndex' | 'role'
> & {
  children?: ReactNode;
  /** The surface ladder: `surface` (cards, panels) or `raised` (a panel over another surface). */
  level?: 'surface' | 'raised';
  /** A `borderSubtle` hairline around it. */
  border?: boolean;
  /** A radius token; `md` by default. */
  radius?: Radius;
  /** Inner space, a space token only. */
  padding?: Space;
  /** The element that keeps the content's meaning (`section`, `article`, `li`). */
  as?: LayoutElement;
};

/**
 * A passive container from the surface ladder: background, optional hairline, radius and padding.
 * It is solid, so actions inside it take the solid look even over artwork. There is no generic
 * Card: compose a Surface with layout, and give actions their own controls.
 */
export function Surface({
  children,
  level = 'surface',
  border = false,
  radius = 'md',
  padding,
  as = 'div',
  ...props
}: SurfaceProps) {
  return createElement(
    as,
    {
      ...props,
      className: styles.surface,
      'data-level': level,
      'data-border': border || undefined,
      'data-radius': radius,
      'data-padding': padding,
    },
    <SurfaceContextProvider value="solid">{children}</SurfaceContextProvider>
  );
}
