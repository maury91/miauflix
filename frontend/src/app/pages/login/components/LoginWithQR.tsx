import { QRCodeSVG } from 'qrcode.react';
import type { FC } from 'react';
import { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';

import { Spinner } from '@/components/Spinner';
import { useCheckDeviceLoginStatusMutation, useDeviceLoginMutation } from '@/store/api/auth';

import { formatCode } from '../utils/formatCode';
import { formatTimeRemaining } from '../utils/formatTimeRemaining';
import { ErrorMessage } from './ErrorMessage';
import { LoginSection, SectionTitle } from './Sections';

const QRSection = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
`;

const QRCodeContainer = styled.div`
  background-color: white;
  padding: 20px;
  border-radius: 8px;
  margin-bottom: 20px;
  display: flex;
  justify-content: center;
  align-items: center;
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

export const LoginWithQR: FC = () => {
  const [getDeviceCode, { data: deviceCodeData, isLoading: isDeviceCodeLoading }] =
    useDeviceLoginMutation();
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
      <QRSection>
        {isDeviceCodeLoading ? (
          <Spinner text="Generating QR code" />
        ) : deviceCodeData ? (
          <>
            <QRCodeContainer>
              <QRCodeSVG
                value={deviceCodeData.codeUrl}
                size={140}
                level="M"
                aria-label="Login QR code"
              />
            </QRCodeContainer>
            <QRInstructions>Scan with phone to sign in</QRInstructions>
            <UserCode>
              <UserCodeText>{formatCode(deviceCodeData.userCode)}</UserCodeText>
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
          </>
        ) : (
          <ErrorMessage>Failed to generate QR code</ErrorMessage>
        )}
      </QRSection>
    </LoginSection>
  );
};
