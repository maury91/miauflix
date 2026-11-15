import type { HTMLAttributes, ReactNode } from 'react';

import type { Space } from '../tokens';
import * as styles from './splitLayout.css';
import type { SplitStackBelow } from './splitNavigation';

export type SplitLayoutProps = Omit<
  HTMLAttributes<HTMLDivElement>,
  'className' | 'style' | 'children'
> & {
  /** The first pane: the rail, the form, the preview. First in reading order, also stacked. */
  start: ReactNode;
  /** The second pane: the content, the pairing panel, the settings. */
  end: ReactNode;
  /**
   * The start pane's share side by side: `rail` a fixed 20rem (search's keyboard), `narrow`
   * 37.5% (the profile editor's preview), `even` half each (login's form and pairing panel).
   */
  split?: 'rail' | 'narrow' | 'even';
  /**
   * The first window class with the panes side by side; below it they stack, start on top. TV is
   * `large`, so a TV screen is always side by side. Resolve it with `isSplitStacked` and
   * `useWindowClass` for navigation.
   */
  stackBelow?: SplitStackBelow;
  /** Space between the panes, a space token only. */
  gap?: Space;
  /** The panes' alignment side by side. Defaults to stretching both to the taller one. */
  align?: 'stretch' | 'start' | 'center';
  /**
   * Fills the parent's height: side by side each pane clips, to hold its own ScrollArea; stacked,
   * the split scrolls as one column.
   */
  fill?: boolean;
  /** Names the panes as regions, when each is a distinct part of the screen. From the feature (i18n). */
  startLabel?: string;
  endLabel?: string;
};

/**
 * Two panes, side by side from a window class up and stacked below it: rail and content, form and
 * pairing panel, preview and settings. Passive layout: never a tab stop and it never seizes arrow
 * keys. The navigation layer crosses between the panes with `stepSplit` and enters each one at its
 * last focused item with `paneEntry`, so moving back to a pane lands where the user left it. Each
 * pane carries `data-pane` (see `paneOf`).
 */
export function SplitLayout({
  start,
  end,
  split = 'even',
  stackBelow = 'expanded',
  gap = 'xl',
  align = 'stretch',
  fill = false,
  startLabel,
  endLabel,
  ...props
}: SplitLayoutProps) {
  const pane = (name: 'start' | 'end', label: string | undefined, children: ReactNode) => (
    <div
      className={styles.pane}
      data-pane={name}
      role={label ? 'region' : undefined}
      aria-label={label}
    >
      {children}
    </div>
  );
  return (
    <div
      {...props}
      className={styles.root}
      data-split={split}
      data-stack-below={stackBelow}
      data-gap={gap}
      data-align={align === 'stretch' ? undefined : align}
      data-fill={fill || undefined}
    >
      {pane('start', startLabel, start)}
      {pane('end', endLabel, end)}
    </div>
  );
}
