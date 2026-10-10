import { useAppState } from '@app/hooks/useAppState';
import { IntroAnimation, type LogoAnimationHandle } from '@app/shell/IntroAnimation';
import ConfigurationWizardPage from '@pages/config/ConfigurationWizardPage';
import ConfigWizardPage from '@pages/config/ConfigWizardPage';
import HomePage from '@pages/home/HomePage';
import LoginPage from '@pages/login/LoginPage';
import QrApprovalPage from '@pages/qr/QrApprovalPage';
import SettingsPage from '@pages/settings/SettingsPage';
import StoragePage from '@pages/settings/StoragePage';
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
  const [settingsActive, setSettingsActive] = useState(false);
  const [storageActive, setStorageActive] = useState(false);
  const [settingsInitialFocus, setSettingsInitialFocus] = useState<'configuration' | 'storage'>(
    'configuration'
  );
  const [configurationActive, setConfigurationActive] = useState(false);
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

  const logoPage = configurationWizardActive || settingsActive ? 'config_wizard' : appState;

  useEffect(() => {
    if (appState === 'config_wizard' && isAuthenticated && isAdmin) {
      setConfigurationWizardActive(true);
    } else if (!isAuthenticated || !isAdmin) {
      setConfigurationWizardActive(false);
    }
  }, [appState, isAdmin, isAuthenticated]);

  useEffect(() => {
    const openSettings = () => {
      if (isAuthenticated) {
        setConfigurationActive(false);
        setStorageActive(false);
        setSettingsInitialFocus('configuration');
        setSettingsActive(true);
      }
    };
    window.addEventListener('miauflix:settings:open', openSettings);
    return () => window.removeEventListener('miauflix:settings:open', openSettings);
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      setSettingsActive(false);
      setStorageActive(false);
    }
    if (!isAuthenticated || !isAdmin) setConfigurationActive(false);
    if (!isAdmin) setStorageActive(false);
  }, [isAdmin, isAuthenticated]);

  const renderPage = () => {
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/auth/qr/')) {
      return <QrApprovalPage key="qr-approval" />;
    }
    if (configurationWizardActive) {
      return <ConfigurationWizardPage key="config-wizard" onDismiss={handleConfigDismiss} />;
    }
    if (settingsActive && isAuthenticated && appState === 'home') {
      if (configurationActive && isAdmin) {
        return (
          <ConfigWizardPage
            key="settings-configuration"
            onDismiss={() => setConfigurationActive(false)}
          />
        );
      }
      if (storageActive && isAdmin) {
        return (
          <StoragePage
            key="settings-storage"
            onDismiss={() => {
              setStorageActive(false);
              setSettingsInitialFocus('storage');
            }}
          />
        );
      }
      return (
        <SettingsPage
          key="settings"
          canConfigure={isAdmin}
          onConfiguration={() => {
            setSettingsInitialFocus('configuration');
            setConfigurationActive(true);
          }}
          canManageStorage={isAdmin}
          onStorage={() => setStorageActive(true)}
          initialFocus={settingsInitialFocus}
          onDismiss={() => setSettingsActive(false)}
        />
      );
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
      <Logo page={logoPage} />
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
