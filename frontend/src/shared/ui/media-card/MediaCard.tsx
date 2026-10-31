import { type ButtonHTMLAttributes, forwardRef, useState } from 'react';

import { builtForTizen } from '../../config/constants';
import * as styles from './MediaCard.css';

export type MediaCardProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'title'> & {
  backdrop: string;
  logo?: string | null;
  /** Accessible name and visible fallback when the logo is unavailable. */
  title: string;
  subtitle?: string | null;
  /** Percentage watched, from 0 to 100. Null omits the track. */
  progress?: number | null;
  focused?: boolean;
  hovered?: boolean;
  width?: number;
  /** Optional contrast gradient over the backdrop. */
  overlay?: boolean;
};

/** Independent artwork control; scales the entire composition on hover and focus. */
export const MediaCard = forwardRef<HTMLButtonElement, MediaCardProps>(function MediaCard(
  {
    backdrop,
    logo,
    title,
    subtitle,
    progress,
    focused = false,
    hovered = false,
    width = 320,
    overlay = true,
    className,
    style,
    ...buttonProps
  },
  ref
) {
  const [failedLogo, setFailedLogo] = useState<string>();
  const hasLogo = Boolean(logo && logo !== failedLogo);
  const logoClassName = builtForTizen ? styles.logo : `${styles.logo} ${styles.logoShadow}`;
  const percent =
    progress == null ? null : Number.isFinite(progress) ? Math.max(0, Math.min(100, progress)) : 0;

  return (
    <button
      {...buttonProps}
      ref={ref}
      type="button"
      className={className ? `${styles.card} ${className}` : styles.card}
      // The only per-card values, inline so no width creates a rule: the width in exact pixels
      // (rows position cards by it, and `18em` can be off by a fraction of a pixel) and the font
      // size every inner length scales with
      style={{ ...style, width: `${width}px`, fontSize: `${width / styles.CARD_WIDTH_EM}px` }}
      data-focused={focused || undefined}
      data-hovered={hovered || undefined}
      aria-label={buttonProps['aria-label'] ?? (subtitle ? `${title} · ${subtitle}` : title)}
    >
      {backdrop && (
        <img className={styles.backdrop} src={backdrop} alt="" decoding="async" draggable={false} />
      )}
      {overlay && <span className={styles.overlay} aria-hidden="true" />}
      {hasLogo && (
        <img
          key={logo}
          className={logoClassName}
          src={logo!}
          decoding="async"
          alt=""
          draggable={false}
          onError={() => setFailedLogo(logo!)}
        />
      )}
      {(!hasLogo || subtitle) && (
        <span className={styles.info}>
          {!hasLogo && <span className={styles.infoLine}>{title}</span>}
          {subtitle && <span className={styles.infoLine}>{subtitle}</span>}
        </span>
      )}
      {percent !== null && (
        <span className={styles.progressTrack} aria-label={`${Math.round(percent)}% watched`}>
          <span className={styles.progressFill} style={{ width: `${percent}%` }} />
        </span>
      )}
    </button>
  );
});
