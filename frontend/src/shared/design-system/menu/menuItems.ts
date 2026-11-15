import type { ReactNode } from 'react';

export interface MenuAction {
  id: string;
  /** From the feature (i18n). */
  label: string;
  /** Decorative icon before the label. */
  icon?: ReactNode;
  /** Navigates instead of acting: rendered as a link. */
  href?: string;
  disabled?: boolean;
}

export interface MenuSeparator {
  type: 'separator';
  id: string;
}

export type MenuEntry = MenuAction | MenuSeparator;

export const isSeparator = (entry: MenuEntry): entry is MenuSeparator =>
  'type' in entry && entry.type === 'separator';

/** The next enabled action from `current` in `step`'s direction, clamped at the ends. */
export function stepAction(
  entries: readonly MenuEntry[],
  current: string | null,
  step: 1 | -1
): string | null {
  const actions = entries.filter((entry): entry is MenuAction => !isSeparator(entry));
  const enabled = actions.filter(action => !action.disabled);
  if (enabled.length === 0) return null;
  const index = current === null ? -1 : actions.findIndex(action => action.id === current);
  if (index === -1) return (step === 1 ? enabled[0] : enabled[enabled.length - 1]).id;
  for (let next = index + step; next >= 0 && next < actions.length; next += step) {
    if (!actions[next].disabled) return actions[next].id;
  }
  return current;
}
