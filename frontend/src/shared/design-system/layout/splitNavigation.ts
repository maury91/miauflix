import type { GridDirection } from './gridNavigation';
import { type WindowClass, windowClasses } from './windowClass';

export type SplitPane = 'start' | 'end';

/** The first window class with the panes side by side; below it they stack. */
export type SplitStackBelow = Exclude<WindowClass, 'compact'>;

/** Whether a split is stacked in a window class (TV is `large`, so never stacked there). */
export function isSplitStacked(windowClass: WindowClass, stackBelow: SplitStackBelow): boolean {
  return windowClasses.indexOf(windowClass) < windowClasses.indexOf(stackBelow);
}

/**
 * The pane a direction leads to from a pane, or null when the move leaves the split (the
 * navigation layer then tries the split's own neighbours). Side by side, Left/Right cross between
 * the panes (mirrored for right-to-left text) and Up/Down stay inside them; stacked, Up/Down cross.
 */
export function stepSplit(
  from: SplitPane,
  direction: GridDirection,
  { stacked = false, rtl = false }: { stacked?: boolean; rtl?: boolean } = {}
): SplitPane | null {
  let towardEnd: boolean;
  if (stacked) {
    if (direction !== 'up' && direction !== 'down') return null;
    towardEnd = direction === 'down';
  } else {
    if (direction !== 'left' && direction !== 'right') return null;
    towardEnd = (direction === 'right') !== rtl;
  }
  const to: SplitPane = towardEnd ? 'end' : 'start';
  return to === from ? null : to;
}

/** The last focused item of each pane. */
export type SplitPaneMemory = Readonly<Partial<Record<SplitPane, string>>>;

/** Records the item focused in a pane, for the next time the pane is entered. */
export function rememberPaneFocus(
  memory: SplitPaneMemory,
  pane: SplitPane,
  id: string
): SplitPaneMemory {
  return memory[pane] === id ? memory : { ...memory, [pane]: id };
}

/**
 * Where focus lands entering a pane: its last focused item while it is still there and eligible,
 * else the pane's own default entry, else its first item. Undefined for an empty pane, which the
 * navigation layer skips.
 */
export function paneEntry(
  memory: SplitPaneMemory,
  pane: SplitPane,
  items: readonly string[],
  defaultEntry?: string
): string | undefined {
  const remembered = memory[pane];
  if (remembered !== undefined && items.includes(remembered)) return remembered;
  if (defaultEntry !== undefined && items.includes(defaultEntry)) return defaultEntry;
  return items[0];
}

/** The pane holding an element, from the `data-pane` SplitLayout puts on each pane. */
export function paneOf(element: Element | null): SplitPane | null {
  const pane = element?.closest('[data-pane]')?.getAttribute('data-pane');
  return pane === 'start' || pane === 'end' ? pane : null;
}
