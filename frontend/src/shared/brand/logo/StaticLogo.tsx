import { useT } from '../../i18n';
import { brandLogoUrl } from './brandLogo';
import * as styles from './staticLogo.css';

/**
 * The logo of a page outside the signed-in app (sign-in, setup, the configuration wizard): a plain
 * image in the page's own layout. It never moves; the shared Logo is hidden meanwhile.
 * `centred` (default) heads a centred page; `corner` sits where the signed-in pages have the logo.
 */
export function StaticLogo({ placement = 'centred' }: { placement?: 'centred' | 'corner' }) {
  const t = useT();
  return (
    <img
      className={placement === 'corner' ? styles.corner : styles.centred}
      src={brandLogoUrl}
      alt={t('common.logo')}
    />
  );
}
