import { useClaimQrLoginMutation, useCreateQrLoginMutation } from '@features/auth/api/auth.api';
import type { FC } from 'react';
import { useEffect, useRef, useState } from 'react';

import { ErrorMessage } from './ErrorMessage';
import { QRDisplay } from './QRDisplay';
import { LoginSection, SectionTitle } from './Sections';

export const LoginWithQR: FC = () => {
  const [createQrLogin, { data: qrData, isLoading: isQrLoading, isError: isQrError }] =
    useCreateQrLoginMutation();
  const [claimQrLogin] = useClaimQrLoginMutation();
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const lastAuthStatusCheck = useRef<number>(0);

  useEffect(() => {
    createQrLogin();
  }, [createQrLogin]);

  useEffect(() => {
    if (qrData) {
      const interval = setInterval(async () => {
        const remainingTime = qrData
          ? Math.max(0, Math.floor((new Date(qrData.expiresAt).getTime() - Date.now()) / 1000))
          : 0;
        setTimeRemaining(remainingTime);
        if (remainingTime <= 0) {
          clearInterval(interval);
        } else if (qrData) {
          if (Date.now() - lastAuthStatusCheck.current > qrData.pollInterval * 1000) {
            lastAuthStatusCheck.current = Date.now();
            try {
              const authStatus = await claimQrLogin({
                requestId: qrData.requestId,
                claimToken: qrData.claimToken,
              }).unwrap();
              if ('session' in authStatus) {
                clearInterval(interval);
              } else if (new Date(qrData.expiresAt).getTime() - Date.now() < 0) {
                clearInterval(interval);
              }
            } catch (error) {
              console.error('Error checking auth status:', error);
            }
          }
        }
      }, 1000);

      return () => {
        clearInterval(interval);
      };
    }
    return () => {};
  }, [claimQrLogin, qrData]);

  return (
    <LoginSection>
      <SectionTitle>Sign in with QR</SectionTitle>
      {isQrError ? (
        <ErrorMessage>Failed to generate QR code</ErrorMessage>
      ) : (
        <QRDisplay
          codeUrl={qrData ? new URL(qrData.approvalPath, window.location.origin).toString() : ''}
          isLoading={isQrLoading}
          timeRemaining={timeRemaining}
        />
      )}
    </LoginSection>
  );
};
