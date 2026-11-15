import { IS_TV } from '@shared/config/constants';
import type { ReactNode } from 'react';

import * as actionStyles from '../action/action.css';
import { ActionIcon } from '../action/actionInternals';
import { useNavComposite, useNavFocus } from '../navFocus';
import { useSurfaceContext } from '../surface';
import * as styles from './chip.css';

import CheckIcon from '~icons/mdi/check';
import CloseIcon from '~icons/mdi/close';

/** `sm` on the web (dense), `md` on TV. */
export type ChipSize = 'sm' | 'md';
const defaultSize: ChipSize = IS_TV ? 'md' : 'sm';

export interface ChipProps {
  /** Short text from the feature (i18n). */
  children: string;
  size?: ChipSize;
}

/** A passive label in a pill: a genre, a language. Never a focus target. */
export function Chip({ children, size = defaultSize }: ChipProps) {
  const surface = useSurfaceContext();
  return (
    <span className={styles.chip} data-size={size} data-surface={surface}>
      {children}
    </span>
  );
}

export interface FilterChipProps {
  children: string;
  /** Whether the filter applies: translucent fill and a check, `aria-pressed`. */
  selected: boolean;
  /** Confirm or a press toggles it. */
  onSelectedChange: (selected: boolean) => void;
  /** Decorative icon shown while not selected (the check replaces it when selected). */
  icon?: ReactNode;
  /** Virtual focus (white fill), from the navigation layer. */
  focused?: boolean;
  onPointerFocus?: () => void;
  disabled?: boolean;
  size?: ChipSize;
  /** See NavigableProps. A selected filter is where its group is entered. */
  navId?: string;
}

/** A toggleable filter: an inverted-fill action whose selection is carried by fill and check. */
export function FilterChip({
  children,
  selected,
  onSelectedChange,
  icon,
  focused = false,
  onPointerFocus,
  disabled = false,
  size = defaultSize,
  navId,
}: FilterChipProps) {
  const surface = useSurfaceContext();
  const nav = useNavFocus<HTMLButtonElement>(navId, { focused, disabled, selected });
  return (
    <button
      ref={nav.ref}
      type="button"
      className={`${actionStyles.action} ${styles.filter}`}
      data-surface={surface}
      data-size={size}
      data-focused={nav.focused || undefined}
      data-selected={selected || undefined}
      aria-pressed={selected}
      disabled={disabled}
      onMouseMove={() => {
        nav.onPointerFocus();
        onPointerFocus?.();
      }}
      onClick={() => onSelectedChange(!selected)}
    >
      <ActionIcon icon={selected ? <CheckIcon /> : icon} loading={false} />
      <span className={actionStyles.label}>{children}</span>
    </button>
  );
}

export interface RemovableChipProps {
  /** The chip's text, such as a recent search. */
  children: string;
  /** Names the remove action, from the feature (i18n): "Remove “dune”". */
  removeLabel: string;
  onRemove: () => void;
  /** Activating the body (run the search again). Without it the body is not a focus target. */
  onClick?: () => void;
  /** Which part holds virtual focus. Right moves body → remove, edges exit. */
  focusedPart?: 'body' | 'remove';
  onPointerFocus?: (part: 'body' | 'remove') => void;
  size?: ChipSize;
  /** See NavigableProps: a composite of the body (when it acts) and the remove action. */
  navId?: string;
}

/**
 * A removable query: the body and the remove circle are sibling actions in one pill, each with its
 * own white focus fill. After removal the collection focuses the nearest chip.
 */
export function RemovableChip({
  children,
  removeLabel,
  onRemove,
  onClick,
  focusedPart: focusedPartProp,
  onPointerFocus: onPointerFocusProp,
  size = defaultSize,
  navId,
}: RemovableChipProps) {
  const surface = useSurfaceContext();
  const parts: ('body' | 'remove')[] = onClick ? ['body', 'remove'] : ['remove'];
  const { ref, focusedPart, onPointerFocus } = useNavComposite<'body' | 'remove', HTMLSpanElement>(
    navId,
    parts,
    { focusedPart: focusedPartProp, onPointerFocus: onPointerFocusProp }
  );
  const partProps = (part: 'body' | 'remove') => ({
    type: 'button' as const,
    'data-surface': surface,
    'data-size': size,
    'data-focused': focusedPart === part || undefined,
    // Where the navigation layer mirrors DOM focus for this part
    'data-nav-part': part,
    onMouseMove: () => onPointerFocus(part),
  });
  return (
    <span ref={ref} className={styles.removable} data-size={size} data-surface={surface}>
      {onClick ? (
        <button
          {...partProps('body')}
          className={`${actionStyles.action} ${styles.part} ${styles.body}`}
          onClick={onClick}
        >
          <span className={actionStyles.label}>{children}</span>
        </button>
      ) : (
        <span className={`${actionStyles.action} ${styles.part} ${styles.body}`} data-size={size}>
          <span className={actionStyles.label}>{children}</span>
        </span>
      )}
      <button
        {...partProps('remove')}
        className={`${actionStyles.action} ${styles.part} ${styles.remove}`}
        aria-label={removeLabel}
        onClick={onRemove}
      >
        <CloseIcon aria-hidden="true" />
      </button>
    </span>
  );
}
