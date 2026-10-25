import { useAppState } from '@app/hooks/useAppState';
import { useIntroController } from '@app/hooks/useIntroController';
import {
  type AppRoute,
  getRouteParent,
  getRouteSnapshot,
  navigate,
  navigateBack,
  useRoute,
  useRouteFocus,
} from '@app/router';
import { resolveScreen } from '@app/screens';
import { IntroAnimation } from '@app/shell/IntroAnimation';
import ConfigurationWizardPage from '@pages/config/ConfigurationWizardPage';
import ConfigWizardPage from '@pages/config/ConfigWizardPage';
import HomePage from '@pages/home/HomePage';
import LoginPage from '@pages/login/LoginPage';
import QrApprovalPage from '@pages/qr/QrApprovalPage';
import SearchPage from '@pages/search/SearchPage';
import SettingsPage from '@pages/settings/SettingsPage';
import StoragePage from '@pages/settings/StoragePage';
import SetupPage from '@pages/setup/SetupPage';
import { ErrorBoundary } from '@shared/components';
import { useKeyboard } from '@shared/hooks/useKeyboard';
import { Logo } from '@shared/ui/logo/Logo';
import { useAppDispatch, useAppSelector } from '@store';
import { dismissConfigWizard } from '@store/slices/appState';
import { selectIsAdmin, selectIsAuthenticated } from '@store/slices/auth';
import { AnimatePresence, MotionConfig } from 'framer-motion';
import { useCallback, useEffect, useState } from 'react';
import styled from 'styled-components';

/** Replace a route that is not allowed, without mounting its page. */
function Redirect({ to }: { to: AppRoute }) {
  useEffect(() => {
    navigate(to, { replace: true });
  }, [to]);
  return <LoadingContainer />;
}

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

  // The remote's Search key opens search from anywhere once signed in.
  useKeyboard({
    enabled: appState === 'home',
    onSearch: () => {
      if (getRouteSnapshot().type !== 'search') navigate({ type: 'search' });
      return true;
    },
  });

  useEffect(() => {
    if (appState === 'config_wizard' && isAuthenticated && isAdmin) {
      setConfigurationWizardActive(true);
    } else if (!isAuthenticated || !isAdmin) {
      setConfigurationWizardActive(false);
    }
  }, [appState, isAdmin, isAuthenticated]);

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

  const screen = resolveScreen({
    route,
    appState,
    booted,
    homeEligible,
    requiredConfigActive: configurationWizardActive,
    isAdmin,
  });

  const renderPage = () => {
    switch (screen.kind) {
      case 'qrApproval':
        return <QrApprovalPage key="qr-approval" approvalToken={screen.approvalToken} />;
      // Pages fade in once the logo starts moving to them; Home mounts at once behind the intro.
      case 'loading':
        return <LoadingContainer key="loading" />;
      case 'setup':
        return <SetupPage key="setup" />;
      case 'login':
        return <LoginPage key="login" />;
      case 'optionalConfig':
        return <ConfigWizardPage key="config" onDismiss={handleConfigDismiss} />;
      case 'requiredConfig':
        return <ConfigurationWizardPage key="config-wizard" onDismiss={handleConfigDismiss} />;
      case 'configuration':
        return (
          <ConfigWizardPage key="route-configuration" onDismiss={backTo({ type: 'settings' })} />
        );
      case 'storage':
        return <StoragePage key="route-storage" onDismiss={backTo({ type: 'settings' })} />;
      case 'settings':
        return (
          <SettingsPage
            key="settings"
            canConfigure={isAdmin}
            onConfiguration={() => navigate({ type: 'configuration' })}
            canManageStorage={isAdmin}
            onStorage={() => navigate({ type: 'storage' })}
            initialFocus={settingsFocus}
            onDismiss={backTo(
              getRouteParent()?.type === 'search' ? { type: 'search' } : { type: 'home' }
            )}
          />
        );
      case 'search':
        return <SearchPage key="search" onDismiss={backTo({ type: 'home' })} />;
      case 'redirect':
        return <Redirect key="redirect" to={screen.to} />;
      case 'notFound':
        return (
          <main key="not-found">
            <h1>Page not found</h1>
            <button type="button" onClick={() => navigate({ type: 'home' })}>
              Home
            </button>
          </main>
        );
      case 'media': {
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
