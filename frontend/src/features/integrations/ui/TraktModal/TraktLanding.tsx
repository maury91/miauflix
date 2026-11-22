import { Icon, Message, Stack, Text } from '@shared/design-system';
import { useT } from '@shared/i18n';

import * as styles from './traktModal.css';

import BookmarkIcon from '~icons/mdi/bookmark-outline';
import ProgressIcon from '~icons/mdi/progress-clock';
import StarIcon from '~icons/mdi/star-outline';

const BENEFITS = [
  { icon: <BookmarkIcon />, label: 'integrations.benefit.watchlist' },
  { icon: <ProgressIcon />, label: 'integrations.benefit.progress' },
  { icon: <StarIcon />, label: 'integrations.benefit.recommendations' },
] as const;

/** What connecting Trakt brings, and why starting failed if it did. */
export function TraktLanding({ error }: { error: string | null }) {
  const t = useT();
  return (
    <Stack gap="md">
      <Text variant="label">{t('integrations.withTrakt')}</Text>
      <ul className={styles.benefits} aria-label={t('integrations.benefits')}>
        {BENEFITS.map(benefit => (
          <li key={benefit.label} className={styles.benefit}>
            <Icon size="lg">{benefit.icon}</Icon>
            <Text as="span">{t(benefit.label)}</Text>
          </li>
        ))}
      </ul>
      {error && (
        <Message tone="danger" toneLabel={t('common.error')} live="assertive">
          {error}
        </Message>
      )}
    </Stack>
  );
}
