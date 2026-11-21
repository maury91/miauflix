import { formatTimeRemaining } from '@features/auth/lib/formatTimeRemaining';
import type { ProviderAuthorization } from '@miauflix/service-contracts';
import { Message, PairingPanel } from '@shared/design-system';
import { visuallyHidden } from '@shared/design-system/a11y.css';
import { useEffect, useState } from 'react';
import QRCode from 'react-qr-code';

import * as styles from './traktModal.css';

interface AuthorizationProps {
  authorization: ProviderAuthorization;
  activationUrl: string;
  error: string | null;
  copied: boolean;
}

/** The seconds left until `expiresAt`, ticking each second and stopping at zero. */
function useSecondsRemaining(expiresAt: number) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    setNow(Date.now());
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return;
    const timer = window.setInterval(() => {
      const currentTime = Date.now();
      setNow(currentTime);
      if (currentTime >= expiresAt) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);
  return Math.max(0, Math.ceil((expiresAt - now) / 1000));
}

/**
 * Trakt's device authorization as a PairingPanel: the QR code to scan, or the code to enter on
 * Trakt, and how long it lasts. The dialog's actions open Trakt and copy the code.
 */
export function TraktAuthorization({
  authorization,
  activationUrl,
  error,
  copied,
}: AuthorizationProps) {
  const secondsRemaining = useSecondsRemaining(Date.parse(authorization.expiresAt));
  return (
    <>
      <PairingPanel
        title="Scan the QR code"
        instructions={`Or open ${authorization.verificationUrl} and enter this code.`}
        state={secondsRemaining > 0 ? 'ready' : 'expired'}
        loadingLabel="Getting a code"
        qr={
          <QRCode
            className={styles.qrCode}
            value={activationUrl}
            size={300}
            level="M"
            aria-label="Scan to connect your Trakt account"
          />
        }
        userCode={authorization.userCode}
        userCodeLabel="Code"
        status={
          secondsRemaining > 0
            ? `Code expires in ${formatTimeRemaining(secondsRemaining)}`
            : 'Code expired'
        }
        message={
          error ? (
            <Message tone="danger" toneLabel="Error" live="assertive">
              {error}
            </Message>
          ) : undefined
        }
      />
      <span className={visuallyHidden} role="status">
        {copied ? 'Code copied' : ''}
      </span>
    </>
  );
}
