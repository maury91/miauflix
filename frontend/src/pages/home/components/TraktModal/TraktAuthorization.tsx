import { formatTimeRemaining } from '@features/auth/lib/formatTimeRemaining';
import type { ProviderAuthorization } from '@miauflix/service-contracts';
import { Button } from '@shared/ui/button/Button';
import { useEffect, useState } from 'react';
import QRCode from 'react-qr-code';
import styled from 'styled-components';

import { Action, Copy } from './TraktModal.styles';

import CopyIcon from '~icons/mdi/content-copy';
import ExternalIcon from '~icons/mdi/open-in-new';

const ActivationInstructions = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) 5.75rem minmax(0, 1.11fr);
  align-items: start;
  margin-top: 2.75rem;

  @media (max-width: 600px) {
    grid-template-columns: minmax(0, 1fr);
    gap: 1.5rem;
  }
`;

const Option = styled.div`
  min-width: 0;
`;

const Step = styled.div`
  display: flex;
  align-items: center;
  gap: 1.25rem;
  min-height: 2.625rem;
  color: #f5f6f8;
  font-size: 1.375rem;
  line-height: 1.3;
  strong {
    font-weight: 700;
  }
`;

const StepNumber = styled.span`
  display: grid;
  place-items: center;
  flex: 0 0 2.625rem;
  height: 2.625rem;
  border-radius: 50%;
  background: linear-gradient(120deg, #ff263c, #eb0030);
  font-size: 1.5rem;
  font-weight: 600;
`;

const QRPanel = styled.div`
  box-sizing: border-box;
  width: 100%;
  margin: 0.75rem 0 0 0.5rem;
  padding: 1.0625rem;
  border-radius: 0.75rem;
  background: #fff;
  line-height: 0;
  svg {
    display: block;
    width: 100%;
    height: auto;
  }

  @media (max-width: 600px) {
    width: min(100%, 18.75rem);
    margin: 0.75rem auto 0;
  }
`;

const Divider = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  align-self: stretch;
  gap: 1.25rem;
  min-height: 24rem;
  color: #bac1ca;
  font-size: 1.375rem;
  line-height: 1;
  &::before,
  &::after {
    content: '';
    flex: 1;
    width: 1px;
    background: #ffffff24;
  }

  @media (max-width: 600px) {
    flex-direction: row;
    min-height: 0;
    &::before,
    &::after {
      width: auto;
      height: 1px;
    }
  }
`;

const CodePanel = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-top: 1.125rem;
  padding: 0.5625rem 0.75rem 0.5625rem 1.5rem;
  border-radius: 0.75rem;
  background: linear-gradient(120deg, #202428, #191d21);
`;

const Code = styled.code`
  min-width: 0;
  color: #f5f6f8;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: clamp(1.25rem, 2.2vw, 1.875rem);
  letter-spacing: 0.08em;
  overflow-wrap: anywhere;
`;

const CopyButton = styled(Button)`
  flex: 0 0 3.25rem;
  min-width: 3.25rem;
  min-height: 3.25rem;
  padding: 0;
  border-radius: 0.625rem;
`;

const OpenButton = styled(Action)`
  width: 100%;
  min-width: 0;
  margin-top: 1.75rem;
  font-size: 1.5rem;
`;

const Expiry = styled.p`
  margin: 0.75rem 0 0;
  color: #bac1ca;
  font-size: 1rem;
  text-align: center;
  font-variant-numeric: tabular-nums;
`;

const CopyStatus = styled.span`
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
`;

interface AuthorizationProps {
  authorization: ProviderAuthorization;
  activationUrl: string;
  error: string | null;
  copied: boolean;
  onCopyCode: () => void;
}

export function TraktAuthorization({
  authorization,
  activationUrl,
  error,
  copied,
  onCopyCode,
}: AuthorizationProps) {
  const expiresAt = Date.parse(authorization.expiresAt);
  const [now, setNow] = useState(Date.now);
  const secondsRemaining = Math.max(0, Math.ceil((expiresAt - now) / 1000));

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

  return (
    <>
      <ActivationInstructions>
        <Option>
          <Step>
            <StepNumber>1</StepNumber>
            <strong>Scan the QR code</strong>
          </Step>
          <QRPanel>
            <QRCode
              value={activationUrl}
              size={300}
              level="M"
              aria-label="Scan to connect your Trakt account"
            />
          </QRPanel>
        </Option>
        <Divider>or</Divider>
        <Option>
          <Step>
            <StepNumber>2</StepNumber>
            <strong>Enter this code on Trakt</strong>
          </Step>
          <CodePanel>
            <Code>{authorization.userCode}</Code>
            <CopyButton
              color="secondary"
              data-modal-action="1"
              aria-label="Copy Trakt code"
              onClick={onCopyCode}
            >
              <CopyIcon aria-hidden="true" />
            </CopyButton>
          </CodePanel>
          <Expiry role="timer" aria-live="off">
            {secondsRemaining > 0
              ? `Code expires in ${formatTimeRemaining(secondsRemaining)}`
              : 'Code expired'}
          </Expiry>
          <OpenButton
            color="primary"
            data-modal-action="0"
            onClick={() => window.open(activationUrl, '_blank', 'noopener,noreferrer')}
          >
            <ExternalIcon aria-hidden="true" />
            Open Trakt
          </OpenButton>
        </Option>
      </ActivationInstructions>
      {error && <Copy role="alert">{error}</Copy>}
      <CopyStatus role="status">{copied ? 'Code copied' : ''}</CopyStatus>
    </>
  );
}
