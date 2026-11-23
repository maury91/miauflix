import { beginTraktAssociation } from '@features/integrations/api/trakt.api';
import type { ProviderAuthorization } from '@miauwatch/service-contracts';
import { Button, Dialog, Stack } from '@shared/design-system';
import { useT } from '@shared/i18n';
import { useOptionalNavigation } from '@shared/navigation';
import { useEffect, useRef, useState } from 'react';

import { TraktAuthorization } from './TraktAuthorization';
import { TraktLanding } from './TraktLanding';
import * as styles from './traktModal.css';
import { useTraktAuthorizationPolling } from './useTraktAuthorizationPolling';

import TraktIcon from '~icons/cib/trakt';
import CopyIcon from '~icons/mdi/content-copy';
import ExternalIcon from '~icons/mdi/open-in-new';

const TRAKT_NAV = {
  begin: 'trakt-begin',
  dismiss: 'trakt-dismiss',
  open: 'trakt-open',
  copy: 'trakt-copy',
} as const;

interface TraktConnectModalProps {
  sessionId: string;
  onConnected: () => void;
  onDismiss: (permanent: boolean) => void;
}

/**
 * Run the Trakt device authorization flow and report connection success to the caller, as a
 * Dialog under the page's navigation layer. onDismiss receives true for “Don’t ask again” and
 * false when the dialog is closed (its close button, the scrim or Back).
 */
export function TraktModal({ sessionId, onConnected, onDismiss }: TraktConnectModalProps) {
  const t = useT();
  const [authorization, setAuthorization] = useState<ProviderAuthorization | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activationUrl = authorization
    ? `${authorization.verificationUrl.replace(/\/$/, '')}/${encodeURIComponent(authorization.userCode)}`
    : '';

  useTraktAuthorizationPolling({ authorization, sessionId, onConnected, onError: setError });

  // Once the code arrives, its first action replaces the ones that asked for it
  const navigation = useOptionalNavigation();
  // Only when it first arrives: `navigation` changes on every render, and later renders (Copy
  // code, polling errors) must leave focus where it is
  const focusedAuthorization = useRef(false);
  const hasAuthorization = authorization !== null;
  useEffect(() => {
    if (!hasAuthorization) {
      focusedAuthorization.current = false;
      return;
    }
    if (focusedAuthorization.current || !navigation) return;
    focusedAuthorization.current = true;
    navigation.focus(TRAKT_NAV.open);
  }, [hasAuthorization, navigation]);

  const copyCode = async () => {
    if (!authorization) return;
    try {
      await navigator.clipboard.writeText(authorization.userCode);
      setCopied(true);
    } catch {
      setError(t('integrations.copyFailed'));
    }
  };

  const begin = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await beginTraktAssociation(sessionId);
      if ('error' in result) {
        setError(result.error.data);
        return;
      }
      setAuthorization(result.data);
    } catch (error) {
      setError(error instanceof Error ? error.message : t('integrations.startFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      size="lg"
      title={t('integrations.title')}
      description={t('integrations.description')}
      onDismiss={() => onDismiss(false)}
      closeLabel={t('integrations.close')}
      actions={
        authorization ? (
          <>
            <Button
              navId={TRAKT_NAV.open}
              icon={<ExternalIcon />}
              onClick={() => window.open(activationUrl, '_blank', 'noopener,noreferrer')}
            >
              {t('integrations.openTrakt')}
            </Button>
            <Button navId={TRAKT_NAV.copy} icon={<CopyIcon />} onClick={() => void copyCode()}>
              {t('integrations.copyCode')}
            </Button>
          </>
        ) : (
          <>
            <Button
              navId={TRAKT_NAV.begin}
              icon={<ExternalIcon />}
              loading={busy}
              onClick={() => void begin()}
            >
              {t('integrations.letsGo')}
            </Button>
            <Button navId={TRAKT_NAV.dismiss} onClick={() => onDismiss(true)}>
              {t('integrations.neverAsk')}
            </Button>
          </>
        )
      }
    >
      {authorization ? (
        <TraktAuthorization
          authorization={authorization}
          activationUrl={activationUrl}
          error={error}
          copied={copied}
        />
      ) : (
        <Stack gap="lg">
          <TraktIcon className={styles.mark} aria-hidden="true" />
          <TraktLanding error={error} />
        </Stack>
      )}
    </Dialog>
  );
}
