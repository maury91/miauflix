import { useAppState } from '@app/hooks/useAppState';
import { IntroAnimation, type LogoAnimationHandle } from '@app/shell/IntroAnimation';
import ConfigurationWizardPage from '@pages/config/ConfigurationWizardPage';
import ConfigWizardPage from '@pages/config/ConfigWizardPage';
import HomePage from '@pages/home/HomePage';
import LoginPage from '@pages/login/LoginPage';
import SetupPage from '@pages/setup/SetupPage';
import { ErrorBoundary } from '@shared/components';
import { Logo } from '@shared/ui/logo/Logo';
import { useAppDispatch, useAppSelector } from '@store';
import { dismissConfigWizard } from '@store/slices/appState';
import { selectIsAdmin, selectIsAuthenticated } from '@store/slices/auth';
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
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const isAdmin = useAppSelector(selectIsAdmin);
  const [introComplete, setIntroComplete] = useState(false);
  const [configurationWizardActive, setConfigurationWizardActive] = useState(false);
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
    setConfigurationWizardActive(false);
    dispatch(dismissConfigWizard());
  }, [dispatch]);

  useEffect(() => {
    if (appState === 'config_wizard' && isAuthenticated && isAdmin) {
      setConfigurationWizardActive(true);
    } else if (!isAuthenticated || !isAdmin) {
      setConfigurationWizardActive(false);
    }
  }, [appState, isAdmin, isAuthenticated]);

  const renderPage = () => {
    if (configurationWizardActive) {
      return <ConfigurationWizardPage key="config-wizard" onDismiss={handleConfigDismiss} />;
    }
    switch (appState) {
      case 'loading':
        return <LoadingContainer key="loading" />;
      case 'initial_setup':
        return <SetupPage key="setup" />;
      case 'login':
        return <LoginPage key="login" />;
      case 'config':
        return <ConfigWizardPage key="config" onDismiss={handleConfigDismiss} />;
      case 'config_wizard':
        return <ConfigurationWizardPage key="config-wizard" onDismiss={handleConfigDismiss} />;
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
