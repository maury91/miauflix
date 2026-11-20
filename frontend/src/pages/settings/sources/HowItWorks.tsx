import { Grid, Heading, Icon, Surface, Text } from '@shared/design-system';
import type { ReactNode } from 'react';

import * as styles from './sources.css';

import FindIcon from '~icons/mdi/format-list-checks';
import InfoIcon from '~icons/mdi/information-outline';
import SearchIcon from '~icons/mdi/magnify';
import WatchIcon from '~icons/mdi/play-circle-outline';

const STEPS = [
  { icon: <SearchIcon />, title: 'Search', text: 'Miauflix checks your enabled sources in order.' },
  {
    icon: <FindIcon />,
    title: 'Find',
    text: 'It looks for available files matching your movie or TV show.',
  },
  {
    icon: <WatchIcon />,
    title: 'Watch',
    text: 'Available results can be used to start playback.',
  },
];

function StepIcon({ children }: { children: ReactNode }) {
  return (
    <span className={styles.stepIcon} aria-hidden="true">
      <Icon size="md">{children}</Icon>
    </span>
  );
}

/** What sources are for, in three steps. Passive: nothing here takes focus. */
export function HowItWorks() {
  return (
    <Surface as="section" border radius="lg" padding="md" aria-labelledby="how-it-works">
      <Grid columns={{ compact: 1, medium: 2, expanded: 4 }} gap="md" align="center">
        <div className={styles.step}>
          <StepIcon>
            <InfoIcon />
          </StepIcon>
          <Heading level={2} variant="heading" id="how-it-works">
            How it works
          </Heading>
        </div>
        {STEPS.map(step => (
          <div key={step.title} className={styles.step}>
            <StepIcon>{step.icon}</StepIcon>
            <div className={styles.stepText}>
              <Heading level={3} variant="label">
                {step.title}
              </Heading>
              <Text variant="caption" tone="secondary">
                {step.text}
              </Text>
            </div>
          </div>
        ))}
      </Grid>
    </Surface>
  );
}
