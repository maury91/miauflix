import { LOGIN_NAV } from '@features/auth/ui/login/loginNav';
import { LoginWithEmail } from '@features/auth/ui/login/LoginWithEmail';
import { LoginWithQR } from '@features/auth/ui/login/LoginWithQR';
import { Icon, Inline, SplitLayout, Surface, Text } from '@shared/design-system';
import { FocusScope, NavigationProvider } from '@shared/navigation';
import { selectWindowSize } from '@store/slices/measurements';
import { motion } from 'framer-motion';
import type { FC } from 'react';
import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';

import * as styles from './loginPage.css';

import RemoteIcon from '~icons/mdi/remote';

/** The QR panel needs room beside the form; phones sign in with email only. */
const QR_MIN_WIDTH = 720;

/**
 * Sign in: the email form and, on wide screens, the QR pairing panel beside it. The screen is one
 * navigation scope: the form and the panel are vertical groups side by side, so Right from the
 * form reaches the panel (when it has an action) and Left comes back.
 */
const LoginPage: FC = () => {
  const [showQR, setShowQR] = useState(false);
  const { width: windowWidth } = useSelector(selectWindowSize);

  useEffect(() => {
    setShowQR(windowWidth > QR_MIN_WIDTH);
  }, [windowWidth]);

  const form = (
    <Surface padding="lg" radius="lg" border>
      <LoginWithEmail showTitle={showQR} />
    </Surface>
  );

  return (
    <motion.div
      className={styles.page}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      <NavigationProvider>
        <FocusScope id={LOGIN_NAV.scope} layout="horizontal" initialId={LOGIN_NAV.email}>
          <div className={styles.content}>
            {showQR ? (
              <SplitLayout
                stackBelow="medium"
                gap="lg"
                start={form}
                end={<LoginWithQR focusAfterNewCode={LOGIN_NAV.password} />}
              />
            ) : (
              form
            )}
          </div>
        </FocusScope>
      </NavigationProvider>

      <div className={styles.legend}>
        <Inline gap="sm" justify="center">
          <Icon>
            <RemoteIcon />
          </Icon>
          <Text variant="caption" tone="secondary">
            Use remote to navigate and focus
          </Text>
        </Inline>
      </div>
    </motion.div>
  );
};

export default LoginPage;
