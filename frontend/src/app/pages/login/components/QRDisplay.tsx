import type { FC } from 'react';
import QRCode from 'react-qr-code';
import styled from 'styled-components';

import { Spinner } from '@/components/Spinner';

import { formatCode } from '../utils/formatCode';
import { formatTimeRemaining } from '../utils/formatTimeRemaining';

const QRSection = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
`;

const QRCodeContainer = styled.div<{ $size: number; $isLoading?: boolean }>`
  background-color: ${props => (props.$isLoading ? 'transparent' : 'white')};
  padding: 20px;
  border-radius: 8px;
  margin-bottom: 20px;
  display: flex;
  justify-content: center;
  align-items: center;
  width: ${props => props.$size + 40}px;
  height: ${props => props.$size + 40}px;
  border: ${props => (props.$isLoading ? '1px solid #333' : 'none')};
`;

const QRInstructions = styled.div`
  text-align: center;
  font-size: 13px;
  color: #cccccc;
  line-height: 1.5;
`;

const UserCodeText = styled.div`
  font-size: 16px;
  font-weight: 600;
  text-align: center;
  color: white;
`;

const UserCode = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  width: 240px;
  justify-content: space-between;
  border: 1px solid #555;
  border-radius: 8px;
  padding: 8px 16px;
  background-color: #0b1113;
  margin-top: 10px;
`;

const ExpiryText = styled.div`
  color: #cccccc;
  font-size: 14px;
  text-align: center;
`;

// Skeleton components for loading state
const SkeletonText = styled.div<{ width?: string }>`
  height: 16px;
  width: ${props => props.width || '100%'};
  background: linear-gradient(90deg, #333 25%, #555 50%, #333 75%);
  background-size: 200% 100%;
  animation: skeleton-loading 1.5s infinite;
  border-radius: 4px;

  @keyframes skeleton-loading {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }
`;

const SkeletonInstructions = styled(SkeletonText)`
  height: 13px;
  margin: 0 auto 10px;
`;

const SkeletonUserCode = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  width: 240px;
  justify-content: space-between;
  border: 1px solid #555;
  border-radius: 8px;
  padding: 8px 16px;
  background-color: #0b1113;
  margin-top: 10px;
`;

export interface QRDisplayProps {
  /** Size of the QR code in pixels */
  qrSize?: number;
  /** Loading state - shows spinner and skeleton when true */
  isLoading?: boolean;
  /** The URL to encode in the QR code */
  codeUrl?: string;
  /** The user code to display below the QR code */
  userCode?: string;
  /** Time remaining in seconds before the code expires */
  timeRemaining?: number;
  /** Instructions text to show below QR code */
  instructions?: string;
}

/**
 * Pure component for displaying a QR code with user code and expiry information.
 * Supports loading state with spinner and skeleton elements.
 */
export const QRDisplay: FC<QRDisplayProps> = props => {
  const {
    qrSize = 140,
    isLoading = false,
    codeUrl = '',
    userCode = '',
    timeRemaining = 0,
    instructions = 'Scan with phone to sign in',
  } = props;

  if (isLoading) {
    return (
      <QRSection>
        <QRCodeContainer $size={qrSize} $isLoading={true}>
          <Spinner size={Math.min(qrSize * 0.4, 48)} />
        </QRCodeContainer>
        <SkeletonInstructions width="180px" />
        <SkeletonUserCode>
          <SkeletonText width="120px" />
          <SkeletonText width="80px" />
        </SkeletonUserCode>
      </QRSection>
    );
  }

  return (
    <QRSection>
      <QRCodeContainer $size={qrSize}>
        <QRCode value={codeUrl} size={qrSize} level="M" aria-label="Login QR code" />
      </QRCodeContainer>
      <QRInstructions>{instructions}</QRInstructions>
      <UserCode>
        <UserCodeText>{formatCode(userCode)}</UserCodeText>
        <ExpiryText>
          {timeRemaining > 0 ? (
            <>
              Expires in <code>{formatTimeRemaining(timeRemaining)}</code>
            </>
          ) : (
            'Code expired'
          )}
        </ExpiryText>
      </UserCode>
    </QRSection>
  );
};
