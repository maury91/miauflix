import type { ReactNode } from 'react';

import { Button } from '../button/Button';
import type { ControlSize } from '../tokens';
import { panelId, tabId } from './tabIds';
import * as styles from './tabs.css';

export interface TabItem<Id extends string = string> {
  id: Id;
  /** Visible label; comes from the feature (i18n). Never wraps. */
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface TabsProps<Id extends string = string> {
  /** Prefix for the tab and panel ids; pass the same value to each TabPanel. */
  id: string;
  /** The tablist's accessible name. */
  label: string;
  items: readonly TabItem<Id>[];
  /** The tab whose panel is shown. */
  selectedId: Id;
  /** Confirm or a press on a tab. Focus alone never selects (manual activation, no fetch on repeat). */
  onSelect: (id: Id) => void;
  /** The tab holding virtual focus (white fill), from the navigation layer. */
  focusedId?: Id;
  /** Called when the pointer moves onto a tab. */
  onPointerFocus?: (id: Id) => void;
  /**
   * Horizontal: Left/Right move between tabs, the panel's direction enters the selected panel.
   * Vertical mirrors the axis (style guide, section 9).
   */
  orientation?: 'horizontal' | 'vertical';
  size?: ControlSize;
}

/**
 * A tablist of pill Buttons: the selected tab is translucent, the focused one white. Selection
 * changes only on Confirm or a press, so moving across tabs on TV never loads each panel.
 */
export function Tabs<Id extends string = string>({
  id,
  label,
  items,
  selectedId,
  onSelect,
  focusedId,
  onPointerFocus,
  orientation = 'horizontal',
  size = 'md',
}: TabsProps<Id>) {
  return (
    <div
      role="tablist"
      aria-label={label}
      aria-orientation={orientation}
      className={styles.tablist}
      data-orientation={orientation}
    >
      {items.map(item => {
        const selected = item.id === selectedId;
        return (
          <Button
            key={item.id}
            id={tabId(id, item.id)}
            role="tab"
            aria-selected={selected}
            aria-controls={panelId(id, item.id)}
            // Assistive technology reaches the tablist through its selected tab
            tabIndex={selected ? 0 : -1}
            size={size}
            icon={item.icon}
            selected={selected}
            focused={item.id === focusedId}
            disabled={item.disabled}
            fullWidth={orientation === 'vertical'}
            onMouseMove={() => onPointerFocus?.(item.id)}
            onClick={() => {
              if (!selected) onSelect(item.id);
            }}
          >
            {item.label}
          </Button>
        );
      })}
    </div>
  );
}

export interface TabPanelProps {
  /** The Tabs' `id`. */
  tabsId: string;
  /** The tab this panel belongs to. */
  tab: string;
  /** Whether its tab is selected. Hidden panels stay mounted, keeping their state. */
  selected: boolean;
  children: ReactNode;
}

/** The content of one tab, labelled by it. Not a focus target itself. */
export function TabPanel({ tabsId, tab, selected, children }: TabPanelProps) {
  return (
    <div
      role="tabpanel"
      id={panelId(tabsId, tab)}
      aria-labelledby={tabId(tabsId, tab)}
      hidden={!selected}
      className={styles.panel}
    >
      {children}
    </div>
  );
}
