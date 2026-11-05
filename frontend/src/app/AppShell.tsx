import { useAppState } from '@app/hooks/useAppState';
import { useIntroController } from '@app/hooks/useIntroController';
import { useKeyboardClosedAppState } from '@app/hooks/useKeyboardClosedAppState';
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
import { VersionBadge } from '@app/shell/VersionBadge';
import { useMissingProfilePictures } from '@features/profiles/avatar/useMissingProfilePictures';
import ConfigurationWizardPage from '@pages/config/ConfigurationWizardPage';
import ConfigWizardPage from '@pages/config/ConfigWizardPage';
import HomePage from '@pages/home/HomePage';
import LoginPage from '@pages/login/LoginPage';
import ProfileEditorPage from '@pages/profiles/ProfileEditorPage';
import WhosWatchingPage from '@pages/profiles/WhosWatchingPage';
import QrApprovalPage from '@pages/qr/QrApprovalPage';
import SearchPage from '@pages/search/SearchPage';
import SettingsPage from '@pages/settings/SettingsPage';
import SourcesPage from '@pages/settings/SourcesPage';
import StoragePage from '@pages/settings/StoragePage';
import SetupPage from '@pages/setup/SetupPage';
import { ErrorBoundary } from '@shared/components';
import { builtForTizen } from '@shared/config/constants';
import { useKeyboard } from '@shared/hooks/useKeyboard';
import { Logo } from '@shared/ui/logo/Logo';
import { useAppDispatch, useAppSelector } from '@store';
import { dismissConfigWizard } from '@store/slices/appState';
import {
  selectIsAdmin,
  selectIsAuthenticated,
  selectProfiles,
  setSession,
} from '@store/slices/auth';
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

const HOME: AppRoute = { type: 'home' };
const PROFILES: AppRoute = { type: 'profiles' };
const MANAGE_PROFILES: AppRoute = { type: 'manageProfiles' };

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
  const appState = useKeyboardClosedAppState(useAppState());
  const profiles = useAppSelector(selectProfiles);
  // Pictures for looks the server generated, once Home is up (not competing with the intro)
  useMissingProfilePictures(profiles, appState === 'home');
  const [configurationWizardActive, setConfigurationWizardActive] = useState(false);
  /** The profile Who's watching focuses next (one just created). */
  const [profileFocus, setProfileFocus] = useState<string | null>(null);
  const homeEligible = appState === 'home' && route.type === 'home' && !configurationWizardActive;
  const {
    introPhase,
    introHasStarted,
    introReady,
    logoSettled,
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

  const screen = resolveScreen({
    route,
    appState,
    booted,
    homeEligible,
    requiredConfigActive: configurationWizardActive,
    isAdmin,
  });
  const profileScreen =
    screen.kind === 'whosWatching' ||
    screen.kind === 'manageProfiles' ||
    screen.kind === 'newProfile' ||
    screen.kind === 'editProfile';

  const logoPage =
    homeEligible && introPhase !== 'complete'
      ? introPhase === 'playing' && introHasStarted
        ? 'home'
        : 'intro'
      : // Where the login screen has it, whether or not this browser is signed in
        route.type === 'qrApproval'
        ? 'login'
        : (!booted && !homeEligible) || (appState === 'loading' && !hasShownScreen)
          ? 'intro'
          : // Profile pages carry the logo in the corner, as Home does
            profileScreen
            ? 'home'
            : configurationWizardActive ||
                route.type === 'configuration' ||
                route.type === 'storage'
              ? 'config_wizard'
              : appState;
  const logoMotionDisabled =
    (!booted && !homeEligible) || !hasShownScreen || (homeEligible && introPhase === 'playing');
  const showSharedLogo = !(homeEligible && introPhase === 'playing' && !introHasStarted);
  // The centred logo pulses until the app knows where to go; the intro then takes over.
  const logoPulsing =
    logoPage === 'intro' && !(homeEligible && (introReady || introPhase === 'playing'));

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
      case 'whosWatching':
        return (
          <WhosWatchingPage
            key="whos-watching"
            focusUserId={profileFocus}
            onSelect={profile => {
              setProfileFocus(null);
              dispatch(setSession(profile.session));
              if (!screen.startup) navigateBack(HOME);
              else if (route.type === 'profiles') navigate(HOME, { replace: true });
            }}
            onEdit={() => undefined}
            onAdd={() => navigate({ type: 'newProfile' })}
            onManage={() => navigate({ type: 'manageProfiles' })}
            onDone={() => undefined}
            onBack={screen.startup ? undefined : () => navigateBack(HOME)}
          />
        );
      case 'manageProfiles':
        return (
          <WhosWatchingPage
            key="manage-profiles"
            mode="manage"
            focusUserId={profileFocus}
            onSelect={() => undefined}
            onEdit={profile => {
              setProfileFocus(profile.user.id);
              navigate({ type: 'editProfile', userId: profile.user.id });
            }}
            onAdd={() => undefined}
            onManage={() => undefined}
            onDone={() => navigateBack(PROFILES)}
          />
        );
      case 'newProfile':
        return (
          <ProfileEditorPage
            key="new-profile"
            onDone={userId => {
              setProfileFocus(userId);
              navigateBack(PROFILES);
            }}
            onCancel={() => navigateBack(PROFILES)}
          />
        );
      case 'editProfile': {
        const profile = profiles.find(({ user }) => user.id === screen.userId);
        if (!profile) return <Redirect key="redirect" to={{ type: 'manageProfiles' }} />;
        // Opened from Home's profile panel it returns there; from Manage profiles, to that list.
        const editParent = getRouteParent()?.type === 'home' ? HOME : MANAGE_PROFILES;
        return (
          <ProfileEditorPage
            key={`edit-profile-${profile.user.id}`}
            profile={profile}
            onDone={() => navigateBack(editParent)}
            onCancel={() => navigateBack(editParent)}
          />
        );
      }
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
      case 'sources':
        return <SourcesPage key="route-sources" onDismiss={backTo({ type: 'settings' })} />;
      case 'settings':
        return (
          <SettingsPage
            key="settings"
            canConfigure={isAdmin}
            onConfiguration={() => navigate({ type: 'configuration' })}
            canManageStorage={isAdmin}
            onStorage={() => navigate({ type: 'storage' })}
            canManageSources={isAdmin}
            onSources={() => navigate({ type: 'sources' })}
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
      {/* Home, details and player (`media`) stay chrome-free; the intro and redirects show nothing. */}
      {!['media', 'loading', 'redirect'].includes(screen.kind) && <VersionBadge />}
      {homeEligible && introPhase !== 'complete' && (
        <IntroAnimation
          ref={logoRef}
          autoStart={false}
          // No blur or layer hints on the TV, as the legacy app did
          lowResourceAnimation={builtForTizen}
          // On the TV the letters show, under the identical settled logo, before the audio starts:
          // painting them on the first beat stalled it for about 250 ms
          logoVisible={introPhase === 'playing' || (builtForTizen && logoSettled)}
          onStart={handleIntroStart}
          onReady={handleIntroReady}
          onComplete={handleIntroComplete}
        />
      )}
    </ErrorBoundary>
  );
}

export default AppShell;
