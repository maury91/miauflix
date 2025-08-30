import type { FC } from 'react';
import { useEffect, useRef, useState } from 'react';

import { useCheckDeviceLoginStatusMutation, useDeviceLoginMutation } from '@/store/api/auth';

import { ErrorMessage } from './ErrorMessage';
import { QRDisplay } from './QRDisplay';
import { LoginSection, SectionTitle } from './Sections';

export const LoginWithQR: FC = () => {
  const [
    getDeviceCode,
    { data: deviceCodeData, isLoading: isDeviceCodeLoading, isError: isDeviceCodeError },
  ] = useDeviceLoginMutation();
  const [checkAuthStatus] = useCheckDeviceLoginStatusMutation();
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const lastAuthStatusCheck = useRef<number>(0);

  // Initialize device login on component mount
  useEffect(() => {
    getDeviceCode();
  }, [getDeviceCode]);

  useEffect(() => {
    if (deviceCodeData) {
      const interval = setInterval(async () => {
        const remainingTime = deviceCodeData
          ? Math.max(
              0,
              Math.floor((new Date(deviceCodeData.expiresAt).getTime() - Date.now()) / 1000)
            )
          : 0;
        setTimeRemaining(remainingTime);
        if (remainingTime <= 0) {
          clearInterval(interval);
        } else if (deviceCodeData) {
          if (Date.now() - lastAuthStatusCheck.current > deviceCodeData.interval * 1000) {
            lastAuthStatusCheck.current = Date.now();
            try {
              const authStatus = await checkAuthStatus({
                deviceCode: deviceCodeData.deviceCode,
              }).unwrap();
              if (authStatus.success) {
                clearInterval(interval);
              } else if (new Date(deviceCodeData.expiresAt).getTime() - Date.now() < 0) {
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
  }, [checkAuthStatus, deviceCodeData]);

  return (
    <LoginSection>
      <SectionTitle>Sign in with QR</SectionTitle>
      {isDeviceCodeError ? (
        <ErrorMessage>Failed to generate QR code</ErrorMessage>
      ) : (
        <QRDisplay
          codeUrl={deviceCodeData?.codeUrl}
          userCode={deviceCodeData?.userCode}
          isLoading={isDeviceCodeLoading}
          timeRemaining={timeRemaining}
        />
      )}
    </LoginSection>
  );
};
