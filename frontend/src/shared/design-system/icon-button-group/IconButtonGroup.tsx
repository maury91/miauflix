import { useActiveIdWithin } from '@shared/navigation/hooks';
import { FocusGroup } from '@shared/navigation/NavigationProvider';
import { useId } from 'react';

import { IconButton, type IconButtonProps } from '../icon-button/IconButton';
import { joinIds } from '../ids';
import * as styles from './iconButtonGroup.css';

export type IconButtonGroupItem = Omit<
  IconButtonProps,
  'focused' | 'size' | 'tooltip' | 'tooltipPlacement' | 'tooltipAlign' | 'onMouseMove'
> & {
  /** Stable identity, used for focus. */
  id: string;
  /** Shown in the shared slot while this button is focused; `label` when not given. */
  description?: string;
};

export interface IconButtonGroupProps {
  /** The group's accessible name, e.g. "Title actions". */
  label: string;
  items: readonly IconButtonGroupItem[];
  size?: IconButtonProps['size'];
  /** Horizontal by default: Left/Right move between buttons, the rest leaves the group. */
  orientation?: 'horizontal' | 'vertical';
  /** Where the shared description sits. Default below. */
  descriptionPlacement?: 'above' | 'below';
  /** The item holding virtual focus. The slot shows its description; empty when none is focused. */
  focusedId?: string;
  /** Called when the pointer moves onto a button, so the navigation layer can focus it. */
  onPointerFocus?: (id: string) => void;
  /**
   * Registers the buttons as a group with the navigation layer (each `<navId>:<item id>`), which
   * then also drives the shared slot. See NavigableProps.
   */
  navId?: string;
}

/**
 * IconButtons sharing one description slot instead of individual tooltips (style guide, 8.3 B).
 * The slot shows the focused button's description, changes in place as focus moves, and is empty
 * when focus is elsewhere; its height is always reserved. It is not a focus target and not a live
 * region. Movement (no wrapping, remembered child on re-entry) belongs to the navigation layer.
 */
export function IconButtonGroup({
  label,
  items,
  size,
  orientation = 'horizontal',
  descriptionPlacement = 'below',
  focusedId: focusedIdProp,
  onPointerFocus,
  navId,
}: IconButtonGroupProps) {
  const slotId = useId();
  const itemNavId = (id: string) => (navId === undefined ? undefined : `${navId}:${id}`);
  const activeId = useActiveIdWithin(navId);
  const focusedId =
    focusedIdProp ?? items.find(item => activeId !== null && itemNavId(item.id) === activeId)?.id;
  const focusedItem = items.find(item => item.id === focusedId && !item.disabled);
  const description = focusedItem ? (focusedItem.description ?? focusedItem.label) : undefined;

  return (
    <FocusGroup id={navId} layout={orientation} disabled={navId === undefined}>
      <div className={styles.group} data-description={descriptionPlacement}>
        <div
          role="group"
          aria-label={label}
          className={styles.buttons}
          data-orientation={orientation}
        >
          {items.map(({ id, description: itemDescription, ...item }) => {
            const focused = id === focusedItem?.id;
            // The slot adds to the name only when it says something else
            const describes =
              focused && itemDescription !== undefined && itemDescription !== item.label;
            return (
              <span key={id} className={styles.item}>
                <IconButton
                  {...item}
                  size={size}
                  focused={focused}
                  navId={itemNavId(id)}
                  aria-describedby={joinIds(item['aria-describedby'], describes && slotId)}
                  onMouseMove={() => onPointerFocus?.(id)}
                />
              </span>
            );
          })}
        </div>
        <div id={slotId} className={styles.slot}>
          {description && (
            <span key={focusedItem?.id} className={styles.slotText}>
              {description}
            </span>
          )}
        </div>
      </div>
    </FocusGroup>
  );
}
