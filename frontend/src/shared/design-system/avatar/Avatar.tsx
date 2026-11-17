import type { ReactNode } from 'react';

import { useImageStatus } from '../artwork/useImageStatus';
import * as styles from './avatar.css';

export interface AvatarProps {
  /** Whose avatar: its accessible name. */
  name: string;
  /**
   * The picture. An avatar is always a picture, never initials. Absent (still being fetched), the
   * colour and placeholder show.
   */
  src?: string | null;
  /**
   * A picture the feature draws itself (a profile's live, animated Plushie), filling the circle in
   * place of `src`. Decorative: the avatar's name and semantics stay the same.
   */
  picture?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'fill';
  /** `contain` for pictures with their own shape (a profile's Plushie). */
  fit?: 'cover' | 'contain';
  /** Shown behind the picture while it loads (or if it fails), such as a profile colour. Set inline. */
  color?: string;
  /** Decorative content over that colour until the picture shows, such as a Plushie silhouette. */
  placeholder?: ReactNode;
  /** Hidden from assistive technology when the name is shown next to it (a tile, a row). */
  decorative?: boolean;
}

/**
 * A passive circle with a person's or profile's picture. Until the picture has loaded the circle
 * keeps its size and shows its colour and placeholder, so loading never leaves a hole. Never
 * focusable.
 */
export function Avatar({
  name,
  src,
  picture,
  size = 'md',
  fit = 'cover',
  color,
  placeholder,
  decorative = false,
}: AvatarProps) {
  const image = useImageStatus(src);
  const status = picture ? 'loaded' : image.status;
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
      style={color && status !== 'loaded' ? { backgroundColor: color } : undefined}
    >
      {placeholder && status !== 'loaded' && (
        <span className={styles.placeholder} aria-hidden="true">
          {placeholder}
        </span>
      )}
      {picture ? (
        <span className={styles.picture} aria-hidden="true">
          {picture}
        </span>
      ) : (
        src &&
        status !== 'failed' && (
          <img
            {...image.imageProps}
            key={src}
            className={styles.image}
            src={src}
            alt=""
            decoding="async"
            draggable={false}
          />
        )
      )}
    </span>
  );
}
