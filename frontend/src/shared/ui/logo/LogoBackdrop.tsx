import * as styles from './logoBackdrop.css';

/**
 * A solid strip behind the corner logo, for pages that scroll under it (settings, profiles). Put
 * it in the page's positioned root; the page's rail takes z-index 2 to stay on top of it.
 */
export function LogoBackdrop() {
  return <div className={styles.backdrop} aria-hidden="true" />;
}
