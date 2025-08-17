import { motion } from 'framer-motion';
import type { FC } from 'react';
import { useEffect, useState } from 'react';
import styled from 'styled-components';

import { useWindowSize } from '@/app/hooks/useWindowSize';

import { LoginWithEmail } from './components/LoginWithEmail';
import { LoginWithQR } from './components/LoginWithQR';

const LoginContainer = styled(motion.div)`
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background-color: #0a0d0f;
  color: white;
  font-family: 'Poppins', sans-serif;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 1000;
`;

const LoginContent = styled.div`
  display: flex;
  gap: 24px;
  align-items: flex-start;
  max-width: 900px;
  width: 100%;
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

const LoginPage: FC = () => {
  // Email login state
  const [showQR, setShowQR] = useState(false);
  const { width: windowWidth } = useWindowSize();

  useEffect(() => {
    setShowQR(windowWidth > 720);
  }, [windowWidth]);

  return (
    <LoginContainer
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      <LoginContent>
        {/* Email Login Section */}
        <LoginWithEmail showTitle={showQR} />
        {showQR && <LoginWithQR />}
      </LoginContent>

      <BottomInstructions>
        <RemoteIcon />
        Use remote to navigate and focus
      </BottomInstructions>
    </LoginContainer>
  );
};

export default LoginPage;
