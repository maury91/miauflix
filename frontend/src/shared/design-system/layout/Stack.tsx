import { createElement, type HTMLAttributes, type ReactNode } from 'react';

import type { Space } from '../tokens';
import * as styles from './stack.css';

/** The elements a layout may render as, so the structure keeps its meaning (a list, a region). */
export type LayoutElement =
  | 'div'
  | 'section'
  | 'nav'
  | 'header'
  | 'footer'
  | 'ul'
  | 'ol'
  | 'li'
  | 'form';

export type StackProps = Omit<HTMLAttributes<HTMLElement>, 'className' | 'style' | 'children'> & {
  children?: ReactNode;
  /** The axis: `column` (default) stacks top to bottom, `row` runs in the text direction. */
  direction?: 'column' | 'row';
  /** Space between the children, a space token only. */
  gap?: Space;
  /** Cross-axis alignment. Defaults to `stretch`. */
  align?: 'start' | 'center' | 'end' | 'stretch' | 'baseline';
  /** Main-axis distribution. Defaults to `start`. */
  justify?: 'start' | 'center' | 'end' | 'between';
  /** `ul`/`ol` for a list of items (each child an `li`), `section` or `nav` for a region. */
  as?: LayoutElement;
};

/**
 * Children along one axis, spaced by a space token. Passive layout: never a tab stop and it never
 * seizes arrow keys; navigation comes from a FocusGroup sharing its axis. A row never wraps (that
 * is Inline). Children size themselves; a child that should fill the rest says so itself.
 */
export function Stack({
  children,
  direction = 'column',
  gap,
  align,
  justify,
  as = 'div',
  ...props
}: StackProps) {
  return createElement(
    as,
    {
      ...props,
      className: styles.stack,
      'data-direction': direction,
      'data-gap': gap,
      'data-align': align,
      'data-justify': justify,
    },
    children
  );
}
