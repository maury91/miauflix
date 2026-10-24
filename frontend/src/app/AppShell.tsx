import { useAppState } from '@app/hooks/useAppState';
import { useIntroController } from '@app/hooks/useIntroController';
import { type AppRoute, navigate, navigateBack, useRoute, useRouteFocus } from '@app/router';
import { IntroAnimation } from '@app/shell/IntroAnimation';
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
import { useCallback, useEffect, useState } from 'react';
import styled from 'styled-components';

const LoadingContainer = styled.div`
  position: fixed;
  inset: 0;
  background-color: #0a0d0f;
  z-index: 999;
`;

export function AppShell() {
  const dispatch = useAppDispatch();
  const route = useRoute();
  const settingsFocus = useRouteFocus();
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const isAdmin = useAppSelector(selectIsAdmin);
  const appState = useAppState();
  const [configurationWizardActive, setConfigurationWizardActive] = useState(false);
  const homeEligible = appState === 'home' && route.type === 'home' && !configurationWizardActive;
  const {
    introPhase,
    introHasStarted,
    introReady,
    booted,
    hasShownScreen,
    logoRef,
    handleIntroComplete,
    handleIntroReady,
    handleLogoCentered,
    handleLogoSettled,
    handleIntroStart,
    handleHomeHydrated,
  } = useIntroController(appState, homeEligible);

  const handleConfigDismiss = useCallback(() => {
    setConfigurationWizardActive(false);
    dispatch(dismissConfigWizard());
  }, [dispatch]);
  const backTo = (parent: AppRoute) => () => navigateBack(parent);

  useEffect(() => {
    if (appState === 'config_wizard' && isAuthenticated && isAdmin) {
      setConfigurationWizardActive(true);
    } else if (!isAuthenticated || !isAdmin) {
      setConfigurationWizardActive(false);
    }
  }, [appState, isAdmin, isAuthenticated]);

  useEffect(() => {
    if (
      appState === 'home' &&
      !isAdmin &&
      (route.type === 'configuration' || route.type === 'storage')
    ) {
      navigate({ type: 'settings' }, { replace: true });
    }
  }, [appState, isAdmin, route]);

  const logoPage =
    homeEligible && introPhase !== 'complete'
      ? introPhase === 'playing' && introHasStarted
        ? 'home'
        : 'intro'
      : (!booted && !homeEligible) || (appState === 'loading' && !hasShownScreen)
        ? 'intro'
        : configurationWizardActive || route.type === 'configuration' || route.type === 'storage'
          ? 'config_wizard'
          : appState;
  const logoMotionDisabled =
    (!booted && !homeEligible) || !hasShownScreen || (homeEligible && introPhase === 'playing');
  const showSharedLogo = !(homeEligible && introPhase === 'playing' && !introHasStarted);
  // The centred logo pulses until the app knows where to go; the intro then takes over.
  const logoPulsing =
    logoPage === 'intro' && !(homeEligible && (introReady || introPhase === 'playing'));

  const renderPage = () => {
    // QR approval remains available before the user has signed in or completed setup.
    if (route.type === 'qrApproval') {
      return <QrApprovalPage key="qr-approval" approvalToken={route.approvalToken} />;
    }
    // Pages fade in once the logo starts moving to them; Home mounts at once behind the intro.
    if (appState === 'loading' || (!booted && !homeEligible)) {
      return <LoadingContainer key="loading" />;
    }
    if (appState === 'initial_setup') return <SetupPage key="setup" />;
    if (appState === 'login') return <LoginPage key="login" />;
    if (appState === 'config') {
      return <ConfigWizardPage key="config" onDismiss={handleConfigDismiss} />;
    }
    if (configurationWizardActive || appState === 'config_wizard') {
      return <ConfigurationWizardPage key="config-wizard" onDismiss={handleConfigDismiss} />;
    }
    if (route.type === 'configuration' && isAuthenticated && isAdmin) {
      return (
        <ConfigWizardPage key="route-configuration" onDismiss={backTo({ type: 'settings' })} />
      );
    }
    if (route.type === 'storage' && isAuthenticated && isAdmin) {
      return <StoragePage key="route-storage" onDismiss={backTo({ type: 'settings' })} />;
    }
    if (route.type === 'settings' && isAuthenticated) {
      return (
        <SettingsPage
          key="settings"
          canConfigure={isAdmin}
          onConfiguration={() => navigate({ type: 'configuration' })}
          canManageStorage={isAdmin}
          onStorage={() => navigate({ type: 'storage' })}
          initialFocus={settingsFocus}
          onDismiss={backTo({ type: 'home' })}
        />
      );
    }
    if (route.type === 'notFound') {
      return (
        <main key="not-found">
          <h1>Page not found</h1>
          <button type="button" onClick={() => navigate({ type: 'home' })}>
            Home
          </button>
        </main>
      );
    }
    const homeInteractive = route.type === 'home' && introPhase === 'complete';
    const homeVisible = route.type === 'home' && (homeEligible || homeInteractive);
    return (
      <div
        key="home"
        aria-hidden={route.type === 'home' && !homeInteractive}
        inert={route.type === 'home' && !homeInteractive}
        style={{ visibility: route.type === 'home' && !homeVisible ? 'hidden' : 'visible' }}
      >
        <HomePage
          route={route}
          interactive={route.type === 'home' ? homeInteractive : true}
          onHydrated={handleHomeHydrated}
        />
      </div>
    );
  };

  return (
    <ErrorBoundary>
      <Logo
        page={logoPage}
        disableMotion={logoMotionDisabled}
        visible={showSharedLogo}
        aboveIntro={homeEligible && (introPhase === 'pending' || introPhase === 'centering')}
        pulsing={logoPulsing}
        onPulseSettled={handleLogoSettled}
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
