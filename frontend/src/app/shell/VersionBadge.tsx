import * as styles from './versionBadge.css';

/** Set at build time from the root package version and commit (see vite.config.ts). */
const APP_VERSION: string = import.meta.env['VITE_APP_VERSION'] ?? '';

/** The running version, in the corner of every screen but Home, Details and Player. */
export function VersionBadge() {
  if (!APP_VERSION) return null;
  return (
    <div className={styles.badge} data-testid="app-version">
      Miauflix v{APP_VERSION}
    </div>
  );
}
