import { Icon, Message, Stack, Text } from '@shared/design-system';

import * as styles from './traktModal.css';

import BookmarkIcon from '~icons/mdi/bookmark-outline';
import ProgressIcon from '~icons/mdi/progress-clock';
import StarIcon from '~icons/mdi/star-outline';

const BENEFITS = [
  { icon: <BookmarkIcon />, label: 'Sync your watchlist' },
  { icon: <ProgressIcon />, label: 'Track your progress' },
  { icon: <StarIcon />, label: 'Get movie recommendations' },
];

/** What connecting Trakt brings, and why starting failed if it did. */
export function TraktLanding({ error }: { error: string | null }) {
  return (
    <Stack gap="md">
      <Text variant="label">With Trakt you can:</Text>
      <ul className={styles.benefits} aria-label="Trakt benefits">
        {BENEFITS.map(benefit => (
          <li key={benefit.label} className={styles.benefit}>
            <Icon size="lg">{benefit.icon}</Icon>
            <Text as="span">{benefit.label}</Text>
          </li>
        ))}
      </ul>
      {error && (
        <Message tone="danger" toneLabel="Error" live="assertive">
          {error}
        </Message>
      )}
    </Stack>
  );
}
