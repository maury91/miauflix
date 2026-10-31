import { LoginWithEmail } from '@features/auth/ui/login/LoginWithEmail';
import { LoginWithQR } from '@features/auth/ui/login/LoginWithQR';
import { IS_TIZEN } from '@shared/config/constants';
import { selectWindowSize } from '@store/slices/measurements';
import { motion } from 'framer-motion';
import type { FC } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
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
  const { width: windowWidth } = useSelector(selectWindowSize);
  // A remote moves right from the show-password toggle to the QR's new-code button, and back
  const toggleRef = useRef<HTMLButtonElement>(null);
  const refreshRef = useRef<HTMLButtonElement>(null);
  const focusRefresh = () => {
    if (!refreshRef.current) return false;
    refreshRef.current.focus();
    return true;
  };
  const focusToggle = () => toggleRef.current?.focus();

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
        <LoginWithEmail
          showTitle={showQR}
          autoFocus={IS_TIZEN}
          toggleRef={toggleRef}
          onRightFromToggle={focusRefresh}
        />
        {showQR && <LoginWithQR refreshRef={refreshRef} onLeaveRefresh={focusToggle} />}
      </LoginContent>

      <BottomInstructions>
        <RemoteIcon aria-hidden="true" />
        Use remote to navigate and focus
      </BottomInstructions>
    </LoginContainer>
  );
};

export default LoginPage;
