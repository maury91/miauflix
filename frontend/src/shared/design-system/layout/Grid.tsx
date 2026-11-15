import { createElement, type HTMLAttributes, type ReactNode } from 'react';

import type { Space } from '../tokens';
import * as styles from './grid.css';
import type { LayoutElement } from './Stack';
import { type Responsive, responsiveAttributes } from './windowClass';

export type GridProps = Omit<HTMLAttributes<HTMLElement>, 'className' | 'style' | 'children'> & {
  children?: ReactNode;
  /**
   * Equal columns, 1 to 12: one count, or one per window class from `compact` up (larger classes
   * inherit; TV is `large`). Resolve it with `useWindowClass` for navigation.
   */
  columns: Responsive<number>;
  /** Space between cells, a space token only. */
  gap?: Space;
  /** Space between rows, when it differs from `gap`. */
  rowGap?: Space;
  /** Alignment inside each cell. Defaults to stretching to the row's height. */
  align?: 'start' | 'center' | 'end';
  /** `ul`/`ol` when the cells are a list (each GridItem an `li`). */
  as?: LayoutElement;
};

/**
 * Equal columns with items spanning them, for content laid out in flow: forms, settings, swatches,
 * a keyboard. Passive layout: never a tab stop and it never seizes arrow keys; navigation comes
 * from a FocusGroup using `gridLayout` with the same columns and spans. Media collections whose
 * geometry is known (tile grids) position their items instead, like Carousel.
 */
export function Grid({ children, columns, gap, rowGap, align, as = 'div', ...props }: GridProps) {
  return createElement(
    as,
    {
      ...props,
      className: styles.grid,
      ...responsiveAttributes('columns', columns),
      'data-gap': gap,
      'data-row-gap': rowGap,
      'data-align': align,
    },
    children
  );
}

export type GridItemProps = Omit<
  HTMLAttributes<HTMLElement>,
  'className' | 'style' | 'children'
> & {
  children?: ReactNode;
  /** Columns spanned, per window class like the Grid's columns. Never more than the columns. */
  span?: Responsive<number>;
  as?: LayoutElement;
};

/** A Grid cell spanning columns. Plain children take one column without it. */
export function GridItem({ children, span, as = 'div', ...props }: GridItemProps) {
  return createElement(
    as,
    { ...props, className: styles.item, ...responsiveAttributes('span', span) },
    children
  );
}
