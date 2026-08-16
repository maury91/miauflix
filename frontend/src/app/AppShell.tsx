import { useAppState } from '@app/hooks/useAppState';
import { IntroAnimation, type LogoAnimationHandle } from '@app/shell/IntroAnimation';
import ConfigWizardPage from '@pages/config/ConfigWizardPage';
import HomePage from '@pages/home/HomePage';
import LoginPage from '@pages/login/LoginPage';
import SetupPage from '@pages/setup/SetupPage';
import { ErrorBoundary } from '@shared/components';
import { Logo } from '@shared/ui/logo/Logo';
import { useAppDispatch } from '@store';
import { dismissConfigWizard } from '@store/slices/appState';
import { AnimatePresence, MotionConfig } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import styled from 'styled-components';

const INTRO_AUTO_START_DELAY = 0.1;

const LoadingContainer = styled.div`
  position: fixed;
  inset: 0;
  background-color: #0a0d0f;
  z-index: 999;
`;

export function AppShell() {
  const dispatch = useAppDispatch();
  const [introComplete, setIntroComplete] = useState(false);
  const logoRef = useRef<LogoAnimationHandle>(null);
  const appState = useAppState();

  const handleIntroComplete = useCallback(() => {
    setIntroComplete(true);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('miauflix:intro:animation:complete'));

      // Expose a flag for automated tests that wait for the intro animation to finish
      window._miauflixAnimationComplete = true;
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !logoRef.current) {
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      logoRef.current?.start();
    }, INTRO_AUTO_START_DELAY * 1000);

    return () => window.clearTimeout(timeout);
  }, []);

  const handleConfigDismiss = useCallback(() => {
    dispatch(dismissConfigWizard());
  }, [dispatch]);

  const renderPage = () => {
    switch (appState) {
      case 'loading':
        return <LoadingContainer key="loading" />;
      case 'initial_setup':
        return <SetupPage key="setup" />;
      case 'login':
        return <LoginPage key="login" />;
      case 'config':
        return <ConfigWizardPage key="config" onDismiss={handleConfigDismiss} />;
      case 'home':
      default:
        return <HomePage key="home" />;
    }
  };

  return (
    <ErrorBoundary>
      <Logo page={appState} />
      <MotionConfig transition={{ duration: 0.5 }}>
        <AnimatePresence initial={false} mode="wait">
          {renderPage()}
        </AnimatePresence>
      </MotionConfig>

      {!introComplete && (
        <IntroAnimation ref={logoRef} autoStart={false} onComplete={handleIntroComplete} />
      )}
    </ErrorBoundary>
  );
}

export default AppShell;
