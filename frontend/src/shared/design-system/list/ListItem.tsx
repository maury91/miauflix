import type { MouseEvent, ReactNode } from 'react';

import * as styles from './list.css';
import { useListItemRole } from './listContext';

interface ListItemContentProps {
  /** Short and always present; the primary part's accessible name. */
  title: ReactNode;
  /** Supporting text under the title. Wraps; never truncated. */
  description?: ReactNode;
  /** Decorative leading visual: icon, avatar or artwork. */
  leading?: ReactNode;
  /** Short facts at the end of the primary part (a duration, a date, a status). */
  metadata?: ReactNode;
  /**
   * Trailing IconButtons (size `md`), siblings of the primary part, each with its own `focused`.
   * Right moves from the row into them, Left back (style guide, section 9).
   */
  trailing?: ReactNode;
  /**
   * Virtual focus on the primary part, owned by the navigation layer. Shown as the outline around
   * the row; DOM focus never changes the look.
   */
  focused?: boolean;
  /** Called when the pointer moves onto the primary part, so the navigation layer can focus it. */
  onPointerFocus?: () => void;
  /** The current item (the active server, the playing episode): a quiet fill and `aria-current`. */
  selected?: boolean;
}

type ListItemSemanticsProps =
  | {
      /** Makes the primary part a button. */
      onClick: (event: MouseEvent<HTMLButtonElement>) => void;
      href?: undefined;
      disabled?: boolean;
    }
  | {
      /** Makes the primary part a link. */
      href: string;
      onClick?: undefined;
      disabled?: undefined;
    }
  | {
      /** Without `onClick` or `href` the row is passive: only its trailing actions act. */
      onClick?: undefined;
      href?: undefined;
      disabled?: undefined;
    };

export type ListItemProps = ListItemContentProps & ListItemSemanticsProps;

const isInTrailing = (event: MouseEvent) =>
  event.target instanceof Element && event.target.closest('[data-list-trailing]') !== null;

/**
 * One row: leading visual, title and description, metadata, and trailing actions. Its semantics
 * come from its props: a button (`onClick`), a link (`href`) or passive. Trailing actions are
 * siblings of the primary part, never nested in it. Generic: features adapt their data (episodes,
 * providers, notifications) into these slots instead of adding props.
 */
export function ListItem({
  title,
  description,
  leading,
  metadata,
  trailing,
  focused = false,
  onPointerFocus,
  selected = false,
  onClick,
  href,
  disabled = false,
}: ListItemProps) {
  const role = useListItemRole();
  const content = (
    <>
      {leading && (
        <span className={styles.leading} aria-hidden="true">
          {leading}
        </span>
      )}
      <span className={styles.text}>
        <span className={styles.title}>{title}</span>
        {description && <span className={styles.description}>{description}</span>}
      </span>
      {metadata && <span className={styles.metadata}>{metadata}</span>}
    </>
  );

  let primaryPart: ReactNode;
  if (onClick) {
    primaryPart = (
      <button
        type="button"
        className={styles.primary}
        disabled={disabled}
        aria-current={selected || undefined}
        onClick={onClick}
      >
        {content}
      </button>
    );
  } else if (href !== undefined) {
    primaryPart = (
      <a className={styles.primary} href={href} aria-current={selected || undefined}>
        {content}
      </a>
    );
  } else {
    primaryPart = <div className={styles.primary}>{content}</div>;
  }

  return (
    <div
      role={role}
      className={styles.row}
      data-focused={focused || undefined}
      data-selected={selected || undefined}
      data-disabled={disabled || undefined}
      data-interactive={onClick || href !== undefined ? true : undefined}
      data-trailing={trailing ? true : undefined}
      onMouseMove={event => {
        // Trailing actions focus themselves
        if (!isInTrailing(event)) onPointerFocus?.();
      }}
    >
      {primaryPart}
      {trailing && (
        <div className={styles.trailing} data-list-trailing>
          {trailing}
        </div>
      )}
    </div>
  );
}
