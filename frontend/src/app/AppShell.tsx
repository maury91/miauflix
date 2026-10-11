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
import {
  beginIntroCentering,
  beginIntroPlayback,
  cancelIntro,
  closeSettings,
  completeIntro,
  dismissConfigWizard,
  openSettingsConfiguration,
  openSettingsStorage,
  returnToSettings,
  selectIntroPhase,
  selectSettingsInitialFocus,
  selectSettingsPage,
} from '@store/slices/appState';
import { selectIsAdmin, selectIsAuthenticated } from '@store/slices/auth';
import { AnimatePresence, MotionConfig } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import styled from 'styled-components';

const LoadingContainer = styled.div`
  position: fixed;
  inset: 0;
  background-color: #0a0d0f;
  z-index: 999;
`;

type IdleWindow = Window & {
  requestIdleCallback?: (callback: () => void) => number;
  cancelIdleCallback?: (handle: number) => void;
};

function scheduleWhenIdle(callback: () => void): () => void {
  const idleWindow = window as IdleWindow;
  if (idleWindow.requestIdleCallback) {
    const handle = idleWindow.requestIdleCallback(callback);
    return () => idleWindow.cancelIdleCallback?.(handle);
  }

  const handle = window.setTimeout(callback, 50);
  return () => window.clearTimeout(handle);
}

export function AppShell() {
  const dispatch = useAppDispatch();
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const isAdmin = useAppSelector(selectIsAdmin);
  const introPhase = useAppSelector(selectIntroPhase);
  const settingsPage = useAppSelector(selectSettingsPage);
  const settingsInitialFocus = useAppSelector(selectSettingsInitialFocus);
  const appState = useAppState();
  const [configurationWizardActive, setConfigurationWizardActive] = useState(false);
  const [homeHydrated, setHomeHydrated] = useState(false);
  const [introAnimationReady, setIntroAnimationReady] = useState(false);
  const [logoCentered, setLogoCentered] = useState(false);
  const [introHasStarted, setIntroHasStarted] = useState(false);
  const logoRef = useRef<LogoAnimationHandle>(null);
  const hasShownScreenRef = useRef(false);
  const introPhaseRef = useRef(introPhase);
  const isQrApproval =
    typeof window !== 'undefined' && window.location.pathname.startsWith('/auth/qr/');
  const homeEligible = appState === 'home' && !isQrApproval && !configurationWizardActive;
  const homeEligibleRef = useRef(homeEligible);
  introPhaseRef.current = introPhase;
  homeEligibleRef.current = homeEligible;

  const handleIntroComplete = useCallback(() => {
    if (!homeEligibleRef.current || introPhaseRef.current !== 'playing') return;
    introPhaseRef.current = 'complete';
    dispatch(completeIntro());

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('miauflix:intro:animation:complete'));

      // Expose a flag for automated tests that wait for the intro animation to finish
      window._miauflixAnimationComplete = true;
    }
  }, [dispatch]);

  useEffect(() => {
    if (homeEligible) {
      if (introPhase === 'pending') {
        setLogoCentered(!hasShownScreenRef.current);
      }
      dispatch(beginIntroCentering());
    } else {
      setHomeHydrated(false);
      setIntroAnimationReady(false);
      setLogoCentered(false);
      setIntroHasStarted(false);
      if (introPhase === 'centering' || introPhase === 'playing') {
        dispatch(cancelIntro());
      }
    }
  }, [dispatch, homeEligible, introPhase]);

  useEffect(() => {
    if (
      introPhase !== 'centering' ||
      !homeEligible ||
      !homeHydrated ||
      !introAnimationReady ||
      !logoCentered
    ) {
      return undefined;
    }

    return scheduleWhenIdle(() => {
      if (homeEligibleRef.current && introPhaseRef.current === 'centering') {
        dispatch(beginIntroPlayback());
      }
    });
  }, [dispatch, homeEligible, homeHydrated, introAnimationReady, introPhase, logoCentered]);

  const handleIntroReady = useCallback(() => {
    if (homeEligibleRef.current && introPhaseRef.current !== 'complete') {
      setIntroAnimationReady(true);
    }
  }, []);

  const handleLogoCentered = useCallback(() => {
    if (homeEligibleRef.current && introPhaseRef.current === 'centering') {
      setLogoCentered(true);
    }
  }, []);

  useEffect(() => {
    if (homeEligible && introPhase === 'playing' && homeHydrated && introAnimationReady) {
      logoRef.current?.start();
    }
  }, [homeEligible, homeHydrated, introAnimationReady, introPhase]);

  const handleIntroStart = useCallback(() => {
    if (homeEligibleRef.current && introPhaseRef.current === 'playing') {
      setIntroHasStarted(true);
    }
  }, []);

  const handleHomeHydrated = useCallback(() => {
    setHomeHydrated(true);
  }, []);

  const handleConfigDismiss = useCallback(() => {
    setConfigurationWizardActive(false);
    dispatch(dismissConfigWizard());
  }, [dispatch]);

  const logoPage =
    homeEligible && introPhase !== 'complete'
      ? introPhase === 'playing' && introHasStarted
        ? 'home'
        : 'intro'
      : appState === 'loading' && !hasShownScreenRef.current
        ? 'intro'
        : configurationWizardActive ||
            settingsPage === 'configuration' ||
            settingsPage === 'storage'
          ? 'config_wizard'
          : appState;
  const logoMotionDisabled =
    !hasShownScreenRef.current || (homeEligible && introPhase === 'playing');
  const showSharedLogo = !(homeEligible && introPhase === 'playing' && !introHasStarted);

  useEffect(() => {
    if (appState !== 'loading') hasShownScreenRef.current = true;
  }, [appState]);

  useEffect(() => {
    if (appState === 'config_wizard' && isAuthenticated && isAdmin) {
      setConfigurationWizardActive(true);
    } else if (!isAuthenticated || !isAdmin) {
      setConfigurationWizardActive(false);
    }
  }, [appState, isAdmin, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated && settingsPage) dispatch(closeSettings());
  }, [dispatch, isAuthenticated, settingsPage]);

  const renderPage = () => {
    if (isQrApproval) {
      return <QrApprovalPage key="qr-approval" />;
    }
    if (configurationWizardActive) {
      return <ConfigurationWizardPage key="config-wizard" onDismiss={handleConfigDismiss} />;
    }
    if (settingsPage && isAuthenticated && appState === 'home') {
      if (settingsPage === 'configuration' && isAdmin) {
        return (
          <ConfigWizardPage
            key="settings-configuration"
            onDismiss={() => dispatch(returnToSettings('configuration'))}
          />
        );
      }
      if (settingsPage === 'storage' && isAdmin) {
        return (
          <StoragePage
            key="settings-storage"
            onDismiss={() => {
              dispatch(returnToSettings('storage'));
            }}
          />
        );
      }
      return (
        <SettingsPage
          key="settings"
          canConfigure={isAdmin}
          onConfiguration={() => dispatch(openSettingsConfiguration())}
          canManageStorage={isAdmin}
          onStorage={() => dispatch(openSettingsStorage())}
          initialFocus={settingsInitialFocus}
          onDismiss={() => dispatch(closeSettings())}
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
      default: {
        const homeInteractive = introPhase === 'complete';
        const homeVisible = homeEligible || homeInteractive;
        return (
          <div
            key="home"
            aria-hidden={!homeInteractive}
            inert={!homeInteractive}
            style={{ visibility: homeVisible ? 'visible' : 'hidden' }}
          >
            <HomePage interactive={homeInteractive} onHydrated={handleHomeHydrated} />
          </div>
        );
      }
    }
  };

  return (
    <ErrorBoundary>
      <Logo
        page={logoPage}
        disableMotion={logoMotionDisabled}
        visible={showSharedLogo}
        aboveIntro={homeEligible && (introPhase === 'pending' || introPhase === 'centering')}
        onPositionTransitionEnd={handleLogoCentered}
      />
      <MotionConfig transition={{ duration: 0.5 }}>
        <AnimatePresence initial={false} mode="wait">
          {renderPage()}
        </AnimatePresence>
      </MotionConfig>

      {homeEligible && introPhase !== 'complete' && (
        <IntroAnimation
          ref={logoRef}
          autoStart={false}
          logoVisible={introPhase === 'playing'}
          onStart={handleIntroStart}
          onReady={handleIntroReady}
          onComplete={handleIntroComplete}
        />
      )}
    </ErrorBoundary>
  );
}

export default AppShell;
