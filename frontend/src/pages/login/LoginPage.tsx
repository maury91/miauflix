import { LoginWithEmail } from '@features/auth/ui/login/LoginWithEmail';
import { LoginWithQR } from '@features/auth/ui/login/LoginWithQR';
import { useWindowSize } from '@shared/hooks/useWindowSize';
import { motion } from 'framer-motion';
import type { FC } from 'react';
import { useEffect, useState } from 'react';
import styled from 'styled-components';

import RemoteIcon from '~icons/mdi/remote';

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
        <RemoteIcon aria-hidden="true" />
        Use remote to navigate and focus
      </BottomInstructions>
    </LoginContainer>
  );
};

export default LoginPage;
