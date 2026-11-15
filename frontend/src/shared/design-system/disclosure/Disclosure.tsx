import { FocusGroup } from '@shared/navigation/NavigationProvider';
import { createElement, type ReactNode, useId, useState } from 'react';

import { type NavigableProps, useNavFocus } from '../navFocus';
import * as styles from './disclosure.css';

import ChevronIcon from '~icons/mdi/chevron-down';

export type DisclosureProps = NavigableProps & {
  /** The header, which also names the content region. From the feature (i18n). */
  title: string;
  /** One line under the title, read as the trigger's description. */
  description?: string;
  /** Heading level in the page outline; the trigger sits inside the heading. */
  headingLevel?: 2 | 3 | 4;
  /** Controlled state; leave unset to let the Disclosure keep its own. */
  expanded?: boolean;
  /** Initial state when uncontrolled. */
  defaultExpanded?: boolean;
  /** Called with the requested state on Confirm or a press. */
  onExpandedChange?: (expanded: boolean) => void;
  /**
   * A few actions about the section ("Reset"), beside the header. They are siblings of the
   * trigger, never inside it.
   */
  actions?: ReactNode;
  disabled?: boolean;
  /** Virtual focus on the trigger (outline), from the navigation layer. */
  focused?: boolean;
  /** Called when the pointer moves onto the trigger. */
  onPointerFocus?: () => void;
  /**
   * The content. It is mounted only while expanded, so its controls join the enclosing group then
   * and never take focus while hidden.
   */
  children: ReactNode;
};

/**
 * A header that shows or hides the content under it: a button inside a heading with
 * `aria-expanded`, controlling a region it names. Confirm or a press toggles; arrows never do.
 * Several in a column compose an accordion; which ones stay open is the feature's call.
 */
export function Disclosure({
  title,
  description,
  headingLevel = 3,
  expanded: expandedProp,
  defaultExpanded = false,
  onExpandedChange,
  actions,
  disabled = false,
  focused = false,
  onPointerFocus,
  navId,
  children,
}: DisclosureProps) {
  const id = useId();
  const [ownExpanded, setOwnExpanded] = useState(defaultExpanded);
  const expanded = expandedProp ?? ownExpanded;
  const panelId = `${id}-panel`;
  const trigger = (
    <Trigger
      id={id}
      panelId={panelId}
      title={title}
      description={description}
      expanded={expanded}
      disabled={disabled}
      focused={focused}
      navId={navId}
      onPointerFocus={onPointerFocus}
      onToggle={() => {
        if (expandedProp === undefined) setOwnExpanded(!expanded);
        onExpandedChange?.(!expanded);
      }}
    />
  );

  return (
    <div className={styles.disclosure}>
      {/* One row: Right reaches the actions, Up/Down leave for the content and the next header */}
      <FocusGroup layout="horizontal">
        <div className={styles.header}>
          {createElement(`h${headingLevel}`, { className: styles.heading }, trigger)}
          {actions && <div className={styles.actions}>{actions}</div>}
        </div>
      </FocusGroup>
      <div
        id={panelId}
        role="region"
        aria-labelledby={`${id}-title`}
        className={styles.panel}
        hidden={!expanded}
      >
        {expanded && children}
      </div>
    </div>
  );
}

/** Rendered inside the header's group, so it registers there beside the actions. */
function Trigger({
  id,
  panelId,
  title,
  description,
  expanded,
  disabled,
  focused,
  navId,
  onPointerFocus,
  onToggle,
}: {
  id: string;
  panelId: string;
  title: string;
  description?: string;
  expanded: boolean;
  disabled: boolean;
  focused: boolean;
  navId?: string;
  onPointerFocus?: () => void;
  onToggle: () => void;
}) {
  const nav = useNavFocus<HTMLButtonElement>(navId, { focused, disabled });
  return (
    <button
      ref={nav.ref}
      id={`${id}-trigger`}
      type="button"
      className={styles.trigger}
      disabled={disabled}
      aria-expanded={expanded}
      aria-controls={panelId}
      aria-labelledby={`${id}-title`}
      aria-describedby={description ? `${id}-description` : undefined}
      data-focused={nav.focused || undefined}
      onMouseMove={() => {
        nav.onPointerFocus();
        onPointerFocus?.();
      }}
      onClick={onToggle}
    >
      <span className={styles.chevron} aria-hidden="true">
        <ChevronIcon />
      </span>
      <span className={styles.text}>
        <span id={`${id}-title`} className={styles.title}>
          {title}
        </span>
        {description && (
          <span id={`${id}-description`} className={styles.description}>
            {description}
          </span>
        )}
      </span>
    </button>
  );
}
