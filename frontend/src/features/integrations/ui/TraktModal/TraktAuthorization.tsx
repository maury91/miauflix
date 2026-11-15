import { formatTimeRemaining } from '@features/auth/lib/formatTimeRemaining';
import type { ProviderAuthorization } from '@miauflix/service-contracts';
import { Button } from '@shared/ui/button/Button';
import { useEffect, useState } from 'react';
import QRCode from 'react-qr-code';
import styled from 'styled-components';

import { Copy } from './TraktModal.styles';

import CopyIcon from '~icons/mdi/content-copy';
import ExternalIcon from '~icons/mdi/open-in-new';

const ActivationInstructions = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) 92px minmax(0, 1.11fr);
  align-items: start;
  margin-top: 44px;

  @media (max-width: 600px) {
    grid-template-columns: minmax(0, 1fr);
    gap: 24px;
  }
`;

const Option = styled.div`
  min-width: 0;
`;

const Step = styled.div`
  display: flex;
  align-items: center;
  gap: 20px;
  min-height: 42px;
  color: #f5f6f8;
  font-size: 22px;
  line-height: 1.3;
  strong {
    font-weight: 700;
  }
`;

const StepNumber = styled.span`
  display: grid;
  place-items: center;
  flex: 0 0 42px;
  height: 42px;
  border-radius: 50%;
  background: linear-gradient(120deg, #ff263c, #eb0030);
  font-size: 24px;
  font-weight: 600;
`;

const QRPanel = styled.div`
  box-sizing: border-box;
  width: 100%;
  margin: 12px 0 0 8px;
  padding: 17px;
  border-radius: 12px;
  background: #fff;
  line-height: 0;
  svg {
    display: block;
    width: 100%;
    height: auto;
  }

  @media (max-width: 600px) {
    width: min(100%, 300px);
    margin: 12px auto 0;
  }
`;

const Divider = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  align-self: stretch;
  gap: 20px;
  min-height: 384px;
  color: #bac1ca;
  font-size: 22px;
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
  gap: 8px;
  margin-top: 18px;
  padding: 9px 12px 9px 24px;
  border-radius: 12px;
  background: linear-gradient(120deg, #202428, #191d21);
`;

const Code = styled.code`
  min-width: 0;
  color: #f5f6f8;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: clamp(20px, 2.2vw, 30px);
  letter-spacing: 0.08em;
  overflow-wrap: anywhere;
`;

const OpenArea = styled.div`
  margin-top: 28px;
`;

const Expiry = styled.p`
  margin: 12px 0 0;
  color: #bac1ca;
  font-size: 16px;
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

/** Display device authorization links, QR/code controls, and a countdown clamped to zero at expiry. */
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
            <Button
              iconOnly
              color="secondary"
              data-modal-action="1"
              aria-label="Copy Trakt code"
              onClick={onCopyCode}
            >
              <CopyIcon aria-hidden="true" />
            </Button>
          </CodePanel>
          <Expiry role="timer" aria-live="off">
            {secondsRemaining > 0
              ? `Code expires in ${formatTimeRemaining(secondsRemaining)}`
              : 'Code expired'}
          </Expiry>
          <OpenArea>
            <Button
              fullWidth
              color="primary"
              data-modal-action="0"
              onClick={() => window.open(activationUrl, '_blank', 'noopener,noreferrer')}
            >
              <ExternalIcon aria-hidden="true" />
              Open Trakt
            </Button>
          </OpenArea>
        </Option>
      </ActivationInstructions>
      {error && <Copy role="alert">{error}</Copy>}
      <CopyStatus role="status">{copied ? 'Code copied' : ''}</CopyStatus>
    </>
  );
}
