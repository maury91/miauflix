import { type AnchorHTMLAttributes, forwardRef, type ReactNode } from 'react';

import { type NavigableProps, useNavFocus } from '../navFocus';
import { useSurfaceContext } from '../surface';
import * as styles from './link.css';

export type LinkProps = Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  'className' | 'style' | 'children' | 'href'
> &
  NavigableProps & {
    /** Where it goes. A link always has one; an action without a destination is a Button. */
    href: string;
    /** The visible text, which is also its name. From the feature (i18n). */
    children: ReactNode;
    /** `inline` inside running text (inherits its type); `standalone` on its own line. */
    variant?: 'inline' | 'standalone';
    /** Opens in a new tab or window, with a safe `rel`. Say so in the text or `aria-description`. */
    external?: boolean;
    /** Virtual focus (outline), from the navigation layer. */
    focused?: boolean;
    /** Called when the pointer moves onto the link. */
    onPointerFocus?: () => void;
  };

/**
 * A native anchor: the browser handles activation, opening in a new tab and the context menu.
 * Route changes use links where practical; the feature's router can handle `onClick`.
 */
export const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  {
    children,
    variant = 'inline',
    external = false,
    focused = false,
    onPointerFocus,
    onMouseMove,
    navId,
    ...props
  },
  forwardedRef
) {
  const surface = useSurfaceContext();
  const nav = useNavFocus(navId, { focused }, forwardedRef);
  return (
    <a
      {...props}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      ref={nav.ref}
      className={styles.link}
      data-variant={variant}
      data-surface={surface}
      data-focused={nav.focused || undefined}
      onMouseMove={event => {
        nav.onPointerFocus();
        onPointerFocus?.();
        onMouseMove?.(event);
      }}
    >
      {children}
    </a>
  );
});
