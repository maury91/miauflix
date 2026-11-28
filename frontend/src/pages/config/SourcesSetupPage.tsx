import { ActionGroup, Button } from '@shared/design-system';
import { useT } from '@shared/i18n';
import type { FC } from 'react';

import { SourcesSetup } from './components/SourcesSetup';

const NAV = { done: 'sources-setup-done' } as const;

interface Props {
  onDismiss: () => void;
}

/**
 * Shown to an admin while no source is on, when the setup wizard didn't ask (a server configured
 * from its environment skips it): the same choice as the wizard's Sources step.
 */
const SourcesSetupPage: FC<Props> = ({ onDismiss }) => {
  const t = useT();
  return (
    <SourcesSetup
      actions={({ enabledCount }) => (
        <ActionGroup>
          <Button navId={NAV.done} onClick={onDismiss}>
            {enabledCount === 0 ? t('config.sources.later') : t('config.sources.continue')}
          </Button>
        </ActionGroup>
      )}
    />
  );
};

export default SourcesSetupPage;
