import { createElement, type HTMLAttributes, type ReactNode } from 'react';

import type { Space } from '../tokens';
import * as styles from './inline.css';
import type { LayoutElement } from './Stack';

export type InlineProps = Omit<HTMLAttributes<HTMLElement>, 'className' | 'style' | 'children'> & {
  children?: ReactNode;
  /** Space between items along a line, a space token only. Defaults to `xs`. */
  gap?: Space;
  /** Space between wrapped lines, when it differs from `gap`. */
  rowGap?: Space;
  /** Alignment within a line. Defaults to `center`. */
  align?: 'start' | 'center' | 'end' | 'baseline';
  /** Distribution along a line. Defaults to `start`. */
  justify?: 'start' | 'center' | 'end' | 'between';
  /** `ul`/`ol` for a list of items (each child an `li`). */
  as?: LayoutElement;
};

/**
 * A row that wraps onto more lines when it runs out of room: chips, badges, metadata, a few short
 * actions. Items keep their own size and are never stretched or hard-styled. Passive layout:
 * never a tab stop and it never seizes arrow keys; a wrapped group navigates by its rendered rows
 * (style guide, section 10). Use Stack for a row that must stay on one line.
 */
export function Inline({
  children,
  gap = 'xs',
  rowGap,
  align = 'center',
  justify,
  as = 'div',
  ...props
}: InlineProps) {
  return createElement(
    as,
    {
      ...props,
      className: styles.inline,
      'data-gap': gap,
      'data-row-gap': rowGap === gap ? undefined : rowGap,
      'data-align': align,
      'data-justify': justify,
    },
    children
  );
}
