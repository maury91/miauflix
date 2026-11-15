import { FocusGroup } from '@shared/navigation/NavigationProvider';
import type { ReactNode } from 'react';

import { visuallyHidden } from '../../a11y.css';
import { ActionGroup } from '../../action-group/ActionGroup';
import { Stack } from '../../layout/Stack';
import { ProgressSpinner } from '../../progress/Progress';
import { Surface } from '../../surface-panel/Surface';
import { Heading, Text } from '../../text/Text';
import * as styles from './pairingPanel.css';

export interface PairingPanelProps {
  /** "Sign in with your phone". From the feature (i18n), like every text here. */
  title: string;
  /** What to do: scan the code, or open the address and type the code. */
  instructions?: string;
  /**
   * `loading` while the first code is requested, `ready` with a code, `expired` once it ran out (the
   * feature then offers a new one in `actions`).
   */
  state: 'loading' | 'ready' | 'expired';
  /** The code to scan, drawn by the feature (a QR code with its own accessible name). */
  qr?: ReactNode;
  /** Names the spinner while loading ("Getting a code"). */
  loadingLabel: string;
  /** The code to type on another device. */
  userCode?: string;
  /** What the code is, for assistive technology ("Code"). */
  userCodeLabel?: string;
  /** Where it stands ("Expires in 4:32"). Not a live region: a ticking timer would never be quiet. */
  status?: string;
  /** A Message: the code expired, the request failed, signed in. */
  message?: ReactNode;
  /** Buttons ("Get a new code"), primary first. */
  actions?: ReactNode;
  /** The panel's navigation group (vertical); generated if absent. */
  navId?: string;
}

/** Spells a code out for assistive technology, one character at a time. */
const spelled = (code: string) => code.split('').join(' ');

/**
 * Pairing another device: a code to scan, a code to type, how long it lasts and what to do when
 * it runs out. Layout only: the auth feature owns requesting codes, polling and expiry, and passes
 * the state in. It sits beside the login form as a panel of its own.
 */
export function PairingPanel({
  title,
  instructions,
  state,
  qr,
  loadingLabel,
  userCode,
  userCodeLabel,
  status,
  message,
  actions,
  navId,
}: PairingPanelProps) {
  return (
    <FocusGroup id={navId} layout="vertical">
      <Surface padding="lg" radius="lg" as="section" aria-label={title}>
        <div className={styles.panel}>
          <Stack gap="md" align="center">
            <Heading level={2} variant="heading" align="center">
              {title}
            </Heading>
            {instructions && (
              <Text tone="secondary" align="center">
                {instructions}
              </Text>
            )}
            <div className={styles.qr} data-state={state}>
              {state === 'loading' ? <ProgressSpinner label={loadingLabel} size="lg" /> : qr}
            </div>
            {userCode && state !== 'loading' && (
              <p className={styles.code}>
                <span aria-hidden="true">{userCode}</span>
                <span className={visuallyHidden}>
                  {userCodeLabel ? `${userCodeLabel}: ${spelled(userCode)}` : spelled(userCode)}
                </span>
              </p>
            )}
            {status && (
              <Text variant="caption" tone="secondary" align="center">
                {status}
              </Text>
            )}
            {message && <div className={`${styles.block} ${styles.message}`}>{message}</div>}
            {actions && (
              <div className={styles.block}>
                <ActionGroup align="center">{actions}</ActionGroup>
              </div>
            )}
          </Stack>
        </div>
      </Surface>
    </FocusGroup>
  );
}
