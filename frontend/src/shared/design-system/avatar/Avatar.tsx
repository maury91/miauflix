import type { ReactNode } from 'react';

import { useImageStatus } from '../artwork/useImageStatus';
import * as styles from './avatar.css';

export interface AvatarProps {
  /** Whose avatar: its accessible name, and the source of the default fallback letter. */
  name: string;
  /** Picture URL. Absent, loading or failing, the fallback shows. */
  src?: string | null;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'fill';
  /** `contain` for pictures with their own shape (a profile's Plushie). */
  fit?: 'cover' | 'contain';
  /** The fallback's background, such as a profile colour. A final value, set inline. */
  color?: string;
  /** Custom fallback content instead of the name's first letter. Decorative. */
  fallback?: ReactNode;
  /** Hidden from assistive technology when the name is shown next to it (a tile, a row). */
  decorative?: boolean;
}

/** The first user-perceived letter, so an emoji or accented letter is not cut in half. */
const initial = (name: string) => Array.from(name.trim())[0] ?? '';

/** A passive circle with a person's or profile's picture, or a fallback. Never focusable. */
export function Avatar({
  name,
  src,
  size = 'md',
  fit = 'cover',
  color,
  fallback,
  decorative = false,
}: AvatarProps) {
  const { status, imageProps } = useImageStatus(src);
  const semantics = decorative
    ? ({ 'aria-hidden': true } as const)
    : ({ role: 'img', 'aria-label': name } as const);
  return (
    <span
      {...semantics}
      className={styles.avatar}
      data-size={size}
      data-fit={fit}
      data-status={status}
      style={color ? { backgroundColor: color } : undefined}
    >
      {status !== 'loaded' && (
        <span className={styles.fallback} aria-hidden="true">
          {fallback ?? initial(name)}
        </span>
      )}
      {src && status !== 'failed' && (
        <img
          {...imageProps}
          key={src}
          className={styles.image}
          src={src}
          alt=""
          decoding="async"
          draggable={false}
        />
      )}
    </span>
  );
}
