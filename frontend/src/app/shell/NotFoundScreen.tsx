import { navigate } from '@app/router';
import { Button, EmptyState, SurfaceContextProvider } from '@shared/design-system';
import { useT } from '@shared/i18n';
import { FocusScope, NavigationProvider } from '@shared/navigation';

import * as styles from '../appShell.css';

/** An address no screen answers: says so, with the way back Home. */
export function NotFoundScreen() {
  const t = useT();
  return (
    <main className={styles.notFound}>
      <NavigationProvider>
        <SurfaceContextProvider value="solid">
          <FocusScope autoFocus>
            <EmptyState
              heading={t('common.pageNotFound')}
              headingLevel={2}
              actions={
                <Button navId="not-found-home" onClick={() => navigate({ type: 'home' })}>
                  {t('common.home')}
                </Button>
              }
            />
          </FocusScope>
        </SurfaceContextProvider>
      </NavigationProvider>
    </main>
  );
}
