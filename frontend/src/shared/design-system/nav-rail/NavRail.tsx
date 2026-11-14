import { type ButtonHTMLAttributes, type ReactNode, useId } from 'react';

import { visuallyHidden } from '../a11y.css';
import * as actionStyles from '../action/action.css';
import { Badge } from '../badge/Badge';
import { joinIds } from '../ids';
import { SurfaceContextProvider } from '../surface';
import * as styles from './navRail.css';

export interface NavRailProps {
  /** The navigation landmark's name, from the feature (i18n). */
  label: string;
  /**
   * Labels shown. On TV the rail expands while it holds focus; compact, labels stay the items'
   * accessible names. Expanding overlays the page, it never reflows it.
   */
  expanded?: boolean;
  /** NavItems from the top. */
  children: ReactNode;
  /** NavItems pinned to the bottom (Settings, or Back on inner pages). */
  end?: ReactNode;
}

/**
 * The app's navigation column: Home destinations, or the on-screen Back on inner pages (kept on
 * every platform, alongside the remote's Back key). Its items are inverted-fill actions; the
 * current route is separate from focus.
 */
export function NavRail({ label, expanded = false, children, end }: NavRailProps) {
  return (
    <SurfaceContextProvider value="solid">
      <nav aria-label={label} className={styles.rail} data-expanded={expanded || undefined}>
        <div className={styles.panel}>
          <div className={styles.items}>{children}</div>
          {end && <div className={`${styles.items} ${styles.end}`}>{end}</div>}
        </div>
      </nav>
    </SurfaceContextProvider>
  );
}

export type NavItemProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'color' | 'className' | 'style' | 'children'
> & {
  /** Decorative icon; the label names the item. */
  icon: ReactNode;
  /** Visible when the rail is expanded, always the accessible name. */
  label: string;
  /** The current route: translucent fill and `aria-current="page"`. Never shown in brand red. */
  current?: boolean;
  /** Virtual focus (white fill), from the navigation layer. */
  focused?: boolean;
  /** A short count formatted by the feature ("3", "99+"). */
  badge?: string;
  /** What the badge means, read after the name ("3 unread"). Required with `badge`. */
  badgeLabel?: string;
};

/** One destination or action in a NavRail. */
export function NavItem({
  icon,
  label,
  current = false,
  focused = false,
  badge,
  badgeLabel,
  type = 'button',
  'aria-describedby': callerDescribedBy,
  ...props
}: NavItemProps) {
  const badgeId = useId();
  return (
    <button
      {...props}
      type={type}
      className={`${actionStyles.action} ${styles.navItem}`}
      data-surface="solid"
      data-size="md"
      data-focused={focused || undefined}
      data-selected={current || undefined}
      aria-current={current ? 'page' : undefined}
      aria-describedby={joinIds(callerDescribedBy, badge && badgeLabel && badgeId)}
    >
      <span className={styles.icon} aria-hidden="true">
        {icon}
      </span>
      <span className={styles.label}>{label}</span>
      {badge && (
        <span className={styles.badge} aria-hidden="true">
          <Badge kind="count">{badge}</Badge>
        </span>
      )}
      {badge && badgeLabel && (
        // Hidden from the name, still read as the description
        <span id={badgeId} className={visuallyHidden} aria-hidden="true">
          {badgeLabel}
        </span>
      )}
    </button>
  );
}
