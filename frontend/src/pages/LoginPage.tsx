import { motion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import React, { useEffect, useState } from 'react';
import styled from 'styled-components';

import { Logo as SVGLogo } from '../app/ui-elements/logo';
import {
  useCheckDeviceLoginStatusMutation,
  useDeviceLoginMutation,
  useLoginMutation,
} from '../store/api/auth';

const LoginContainer = styled(motion.div)`
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background-color: #1a1a1a;
  color: white;
  font-family: 'Poppins', sans-serif;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 1000;
`;

const LogoContainer = styled.div`
  margin-bottom: 60px;

  h1 {
    margin: 0;
    font-size: 48px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 2px;
    color: #db202c;
    display: flex;
    align-items: center;
    height: 60px;
  }
`;

const LoginContent = styled.div`
  display: flex;
  gap: 120px;
  align-items: flex-start;
  max-width: 900px;
  width: 100%;
  padding: 0 40px;
`;

const LoginSection = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
`;

const SectionTitle = styled.h2`
  font-size: 16px;
  font-weight: 400;
  margin-bottom: 25px;
  text-align: center;
  color: #ffffff;
`;

const InputGroup = styled.div`
  margin-bottom: 16px;
  width: 100%;
  max-width: 260px;
`;

const Label = styled.label`
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  color: #cccccc;
`;

const Input = styled.input`
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #555;
  border-radius: 4px;
  background-color: #2a2a2a;
  color: white;
  font-size: 14px;
  font-family: 'Poppins', sans-serif;

  &:focus {
    outline: none;
    border-color: #db202c;
  }

  &::placeholder {
    color: #888;
  }
`;

const ContinueButton = styled.button`
  width: 100%;
  max-width: 260px;
  padding: 10px 12px;
  background-color: #db202c;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
  font-family: 'Poppins', sans-serif;
  cursor: pointer;
  transition: background-color 0.2s;
  margin-top: 8px;

  &:hover {
    background-color: #c01e28;
  }

  &:disabled {
    background-color: #666;
    cursor: not-allowed;
  }
`;

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
  margin: 15px 0 5px 0;
  text-align: center;
  color: white;
`;

const BottomInstructions = styled.div`
  position: absolute;
  bottom: 40px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  color: #666;
`;

const RemoteIcon = styled.div`
  width: 16px;
  height: 16px;
  background-color: #666;
  border-radius: 2px;
  position: relative;

  &::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 8px;
    height: 8px;
    background-color: #333;
    border-radius: 1px;
  }
`;

const ErrorMessage = styled.div`
  color: #ff6b6b;
  font-size: 14px;
  margin-top: 10px;
  text-align: center;
`;

const LoadingText = styled.div`
  color: #cccccc;
  font-size: 14px;
  text-align: center;
  margin-top: 10px;
`;

const LoginPage: React.FC = () => {
  // Email login state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [login, { isLoading: isEmailLoading, error: emailError }] = useLoginMutation();

  // Device login state
  const [getDeviceCode, { data: deviceCodeData, isLoading: isDeviceCodeLoading }] =
    useDeviceLoginMutation();
  const [checkAuthStatus, { data: authStatusData, isLoading: isAuthStatusLoading }] =
    useCheckDeviceLoginStatusMutation();
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [countdownInterval, setCountdownInterval] = useState<NodeJS.Timeout | null>(null);

  // Initialize device login on component mount
  useEffect(() => {
    getDeviceCode();
  }, [getDeviceCode]);

  // Set up countdown timer when device code is received
  useEffect(() => {
    if (deviceCodeData?.expiresAt) {
      const expiresAt = new Date(deviceCodeData.expiresAt).getTime();
      const updateCountdown = () => {
        const now = Date.now();
        const remaining = Math.max(0, Math.floor((expiresAt - now) / 1000));
        setTimeRemaining(remaining);

        if (remaining <= 0) {
          if (countdownInterval) {
            clearInterval(countdownInterval);
            setCountdownInterval(null);
          }
        }
      };

      // Initial update
      updateCountdown();

      // Set up interval for countdown
      const interval = setInterval(updateCountdown, 1000);
      setCountdownInterval(interval);

      return () => {
        clearInterval(interval);
      };
    }
    return () => {};
  }, [deviceCodeData?.expiresAt, countdownInterval]);

  // Set up polling for device login
  useEffect(() => {
    if (deviceCodeData?.deviceCode && !pollingInterval && timeRemaining > 0) {
      const interval = setInterval(() => {
        checkAuthStatus({ deviceCode: deviceCodeData.deviceCode });
      }, deviceCodeData.interval * 1000);
      setPollingInterval(interval);
    }

    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [deviceCodeData, checkAuthStatus, pollingInterval, timeRemaining]);

  // Handle device login completion
  useEffect(() => {
    if (authStatusData) {
      if ('accessToken' in authStatusData) {
        // Success - clear all intervals
        if (pollingInterval) {
          clearInterval(pollingInterval);
          setPollingInterval(null);
        }
        if (countdownInterval) {
          clearInterval(countdownInterval);
          setCountdownInterval(null);
        }
        console.log('Device login successful!', authStatusData);
      } else if ('error' in authStatusData && authStatusData.error !== 'authorization_pending') {
        // Error (not pending) - clear polling interval
        if (pollingInterval) {
          clearInterval(pollingInterval);
          setPollingInterval(null);
        }
        console.error('Device authentication failed:', authStatusData.error);
      }
    }
  }, [authStatusData, pollingInterval, countdownInterval]);

  // Stop polling when code expires
  useEffect(() => {
    if (timeRemaining <= 0 && pollingInterval) {
      clearInterval(pollingInterval);
      setPollingInterval(null);
    }
  }, [timeRemaining, pollingInterval]);

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim() && password.trim()) {
      login({ email, password });
    }
  };

  // Format time remaining as MM:SS
  const formatTimeRemaining = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  return (
    <LoginContainer
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      <LogoContainer>
        <SVGLogo />
      </LogoContainer>

      <LoginContent>
        {/* Email Login Section */}
        <LoginSection>
          <SectionTitle>Sign in with Email</SectionTitle>
          <form
            onSubmit={handleEmailSubmit}
            style={{
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}
          >
            <InputGroup>
              <Label htmlFor="email">Email</Label>
              <Input
                type="email"
                id="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="Enter your email"
                required
              />
            </InputGroup>
            <InputGroup>
              <Label htmlFor="password">Password</Label>
              <Input
                type="password"
                id="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
              />
            </InputGroup>
            <ContinueButton
              type="submit"
              disabled={isEmailLoading || !email.trim() || !password.trim()}
            >
              {isEmailLoading ? 'Signing in...' : 'Continue'}
            </ContinueButton>
            {emailError && (
              <ErrorMessage>
                Error:{' '}
                {typeof emailError === 'object' && 'data' in emailError
                  ? JSON.stringify(emailError.data)
                  : 'Login failed'}
              </ErrorMessage>
            )}
          </form>
        </LoginSection>

        {/* QR Code Login Section */}
        <LoginSection>
          <SectionTitle>Sign in with QR</SectionTitle>
          <QRSection>
            {isDeviceCodeLoading ? (
              <LoadingText>Generating QR code...</LoadingText>
            ) : deviceCodeData ? (
              <>
                <QRCodeContainer>
                  <QRCodeSVG
                    value={deviceCodeData.codeUrl}
                    size={140}
                    level="M"
                    includeMargin={false}
                  />
                </QRCodeContainer>
                <QRInstructions>Scan with phone to sign in</QRInstructions>
                <UserCodeText>{deviceCodeData.userCode}</UserCodeText>
                <QRInstructions>
                  {timeRemaining > 0
                    ? `Expires in ${formatTimeRemaining(timeRemaining)}`
                    : 'Code expired'}
                </QRInstructions>
                {authStatusData &&
                  'error' in authStatusData &&
                  authStatusData.error !== 'authorization_pending' && (
                    <ErrorMessage>
                      Authentication failed: {authStatusData.error as string}
                    </ErrorMessage>
                  )}
              </>
            ) : (
              <ErrorMessage>Failed to generate QR code</ErrorMessage>
            )}
          </QRSection>
        </LoginSection>
      </LoginContent>

      <BottomInstructions>
        <RemoteIcon />
        Use remote to navigate and focus
      </BottomInstructions>
    </LoginContainer>
  );
};

export default LoginPage;
