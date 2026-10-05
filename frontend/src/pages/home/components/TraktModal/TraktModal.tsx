import { beginTraktAssociation } from '@features/integrations/api/trakt.api';
import type { ProviderAuthorization } from '@miauflix/service-contracts';
import { Modal } from '@shared/ui/modal/Modal';
import { useState } from 'react';
import styled from 'styled-components';

import { TraktAuthorization } from './TraktAuthorization';
import { TraktLanding } from './TraktLanding';
import { Copy } from './TraktModal.styles';
import { useTraktAuthorizationPolling } from './useTraktAuthorizationPolling';

import TraktIcon from '~icons/cib/trakt';

const Introduction = styled.div`
  display: grid;
  grid-template-columns: 10rem minmax(0, 1fr);
  align-items: center;
  gap: 0.5rem;

  @media (max-width: 600px) {
    grid-template-columns: 4.5rem minmax(0, 1fr);
    gap: 1rem;
  }
`;

const TraktMark = styled(TraktIcon)`
  color: #ff2547;
  stroke-width: 2;
  aspect-ratio: 1/1;
  width: 1em;
  height: 1em;
  font-size: 6.5rem;
  justify-self: center;
  filter: drop-shadow(0 0 1.5rem rgba(255, 24, 67, 0.5));

  @media (max-width: 600px) {
    font-size: 4.5rem;
  }
`;

const Title = styled.h2`
  margin: 0 0 0.75rem;
  color: #f5f6f8;
  font-size: clamp(1.6rem, 3vw, 2.625rem);
  font-weight: 700;
  line-height: 1.25;
  letter-spacing: 0;
  text-transform: none;

  span {
    color: #fa2449;
  }
`;

interface TraktConnectModalProps {
  sessionId: string;
  onConnected: () => void;
  onDismiss: (permanent: boolean) => void;
}

/**
 * Run the Trakt device authorization flow and report connection success to the caller.
 * onDismiss receives true for “Don’t ask again” and false when the dialog is closed.
 */
export function TraktModal({ sessionId, onConnected, onDismiss }: TraktConnectModalProps) {
  const [authorization, setAuthorization] = useState<ProviderAuthorization | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activationUrl = authorization
    ? `${authorization.verificationUrl.replace(/\/$/, '')}/${encodeURIComponent(authorization.userCode)}`
    : '';

  useTraktAuthorizationPolling({ authorization, sessionId, onConnected, onError: setError });

  const copyCode = async () => {
    if (!authorization) return;
    try {
      await navigator.clipboard.writeText(authorization.userCode);
      setCopied(true);
    } catch {
      setError('Unable to copy the code. Please enter it manually.');
    }
  };

  const begin = async () => {
    setBusy(true);
    setError(null);
    const result = await beginTraktAssociation(sessionId);
    setBusy(false);
    if ('error' in result) {
      setError(result.error.data);
      return;
    }
    setAuthorization(result.data);
  };

  return (
    <Modal
      onClose={() => onDismiss(false)}
      labelledBy="trakt-connect-title"
      describedBy="trakt-connect-description"
      closeLabel="Close Trakt dialog"
    >
      <Introduction>
        <TraktMark aria-hidden="true" />
        <div>
          <Title id="trakt-connect-title">
            Connect <span>Trakt</span>
          </Title>
          <Copy id="trakt-connect-description">
            Connect your Trakt account to your Miauflix account to get started.
          </Copy>
        </div>
      </Introduction>
      {authorization ? (
        <TraktAuthorization
          authorization={authorization}
          activationUrl={activationUrl}
          error={error}
          copied={copied}
          onCopyCode={() => void copyCode()}
        />
      ) : (
        <TraktLanding
          busy={busy}
          error={error}
          onBegin={() => void begin()}
          onDismiss={() => onDismiss(true)}
        />
      )}
    </Modal>
  );
}
