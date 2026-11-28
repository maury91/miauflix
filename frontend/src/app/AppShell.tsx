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
} from '@app/router';
import { type AppScreen, resolveScreen } from '@app/screens';
import { IntroAnimation } from '@app/shell/IntroAnimation';
import { VersionBadge } from '@app/shell/VersionBadge';
import { useMissingProfilePictures } from '@features/profiles/avatar/useMissingProfilePictures';
import ConfigurationWizardPage from '@pages/config/ConfigurationWizardPage';
import ConfigWizardPage from '@pages/config/ConfigWizardPage';
import SourcesSetupPage from '@pages/config/SourcesSetupPage';
import { selectMediaBoxSizes } from '@pages/home/home-layout';
import HomePage from '@pages/home/HomePage';
import LoginPage from '@pages/login/LoginPage';
import PreferencesPage from '@pages/preferences/PreferencesPage';
import ProfileEditorPage from '@pages/profiles/ProfileEditorPage';
import WhosWatchingPage from '@pages/profiles/WhosWatchingPage';
import QrApprovalPage from '@pages/qr/QrApprovalPage';
import SearchPage from '@pages/search/SearchPage';
import SourcesPage from '@pages/settings/SourcesPage';
import StoragePage from '@pages/settings/StoragePage';
import SetupPage from '@pages/setup/SetupPage';
import { Logo, type LogoPosition } from '@shared/brand/logo/Logo';
import { ErrorBoundary } from '@shared/components';
import { builtForTizen } from '@shared/config/constants';
import { useKeyboard } from '@shared/hooks/useKeyboard';
import { useAppDispatch, useAppSelector } from '@store';
import { dismissConfigWizard, dismissSourcesPrompt } from '@store/slices/appState';
import {
  selectIsAdmin,
  selectIsAuthenticated,
  selectProfiles,
  setSession,
} from '@store/slices/auth';
import { AnimatePresence, MotionConfig } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';

import { NotFoundScreen } from './shell/NotFoundScreen';
import * as styles from './appShell.css';

/** Replace a route that is not allowed, without mounting its page. */
function Redirect({ to }: { to: AppRoute }) {
  useEffect(() => {
    navigate(to, { replace: true });
  }, [to]);
  return <LoadingContainer />;
}

const HOME: AppRoute = { type: 'home' };
/** Screens with a static logo of their own instead of the shared, moving one. */
const STATIC_LOGO_SCREENS: ReadonlySet<AppScreen['kind']> = new Set([
  'qrApproval',
  'setup',
  'login',
  'optionalConfig',
  'requiredConfig',
  'sourcesSetup',
]);
const PROFILES: AppRoute = { type: 'profiles' };

function LoadingContainer() {
  return <div className={styles.loading} />;
}

export function AppShell() {
  const dispatch = useAppDispatch();
  const route = useRoute();
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const isAdmin = useAppSelector(selectIsAdmin);
  const appState = useKeyboardClosedAppState(useAppState());
  const profiles = useAppSelector(selectProfiles);
  // Pictures for looks the server generated, once Home is up (not competing with the intro)
  useMissingProfilePictures(profiles, appState === 'home');
  const [configurationWizardActive, setConfigurationWizardActive] = useState(false);
  const [sourcesSetupActive, setSourcesSetupActive] = useState(false);
  /** The profile Who's watching focuses next (one just created). */
  const [profileFocus, setProfileFocus] = useState<string | null>(null);
  const homeEligible =
    appState === 'home' &&
    route.type === 'home' &&
    !configurationWizardActive &&
    !sourcesSetupActive;
  const logoWasHiddenRef = useRef(false);
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
  } = useIntroController(appState, homeEligible, logoWasHiddenRef);
  // Home's logo lines up with its cards: their margin follows from the window size alone
  const { margin: homeLeft } = useAppSelector(selectMediaBoxSizes);

  const handleConfigDismiss = useCallback(() => {
    setConfigurationWizardActive(false);
    dispatch(dismissConfigWizard());
  }, [dispatch]);
  const handleSourcesDismiss = useCallback(() => {
    setSourcesSetupActive(false);
    dispatch(dismissSourcesPrompt());
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
  // Opened once no source is on (not over the wizard, which asks itself), and kept until
  // dismissed: turning a source on must not take the page away
  useEffect(() => {
    if (appState === 'sources_setup' && !configurationWizardActive) setSourcesSetupActive(true);
    else if (!isAuthenticated || !isAdmin) setSourcesSetupActive(false);
  }, [appState, configurationWizardActive, isAdmin, isAuthenticated]);

  const screen = resolveScreen({
    route,
    appState,
    booted,
    homeEligible,
    requiredConfigActive: configurationWizardActive,
    sourcesSetupActive,
    isAdmin,
  });
  // The shared logo belongs to the signed-in pages and moves between them. It starts centred
  // (pulsing while loading); sign-in, setup and the configuration wizard draw their own, static.
  const logoPosition: LogoPosition =
    homeEligible && introPhase !== 'complete'
      ? introPhase === 'playing' && introHasStarted
        ? 'home'
        : 'intro'
      : screen.kind === 'loading'
        ? 'intro'
        : STATIC_LOGO_SCREENS.has(screen.kind)
          ? 'none'
          : screen.kind === 'media' || screen.kind === 'notFound'
            ? route.type === 'movieDetails' || route.type === 'showDetails'
              ? 'details'
              : 'home'
            : screen.kind === 'redirect' && screen.to.type === 'home'
              ? 'home'
              : 'inner';
  useEffect(() => {
    logoWasHiddenRef.current = logoPosition === 'none';
  }, [logoPosition]);
  // The loading logo is an element of its own: when the app opens on a page, that page's logo
  // takes its place rather than sliding there from the centre. From then on one logo moves between
  // pages, and to the centre for Home's intro (after choosing a profile, say).
  // Recorded once committed: a discarded render must not retire the loading logo
  const [leftLoadingLogo, setLeftLoadingLogo] = useState(false);
  useEffect(() => {
    if (logoPosition !== 'intro') setLeftLoadingLogo(true);
  }, [logoPosition]);
  const logoElement = leftLoadingLogo || logoPosition !== 'intro' ? 'page' : 'loading';
  const logoMotionDisabled =
    (!booted && !homeEligible) || !hasShownScreen || (homeEligible && introPhase === 'playing');
  const showSharedLogo = !(homeEligible && introPhase === 'playing' && !introHasStarted);
  // The centred logo pulses until the app knows where to go; the intro then takes over.
  const logoPulsing =
    logoPosition === 'intro' && !(homeEligible && (introReady || introPhase === 'playing'));

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
            onEdit={profile => {
              setProfileFocus(profile.user.id);
              navigate({ type: 'editProfile', userId: profile.user.id });
            }}
            onAdd={() => navigate({ type: 'newProfile' })}
            onBack={screen.startup ? undefined : () => navigateBack(HOME)}
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
        if (!profile) return <Redirect key="redirect" to={PROFILES} />;
        // Opened from Home's profile panel it returns there; from Who's watching, to that list.
        const editParent = getRouteParent()?.type === 'home' ? HOME : PROFILES;
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
        return <ConfigWizardPage key="config" onDismiss={handleConfigDismiss} staticLogo />;
      case 'requiredConfig':
        return (
          <ConfigurationWizardPage
            key="config-wizard"
            onDismiss={handleConfigDismiss}
            onSourcesChosen={() => dispatch(dismissSourcesPrompt())}
          />
        );
      case 'sourcesSetup':
        return <SourcesSetupPage key="sources-setup" onDismiss={handleSourcesDismiss} />;
      case 'configuration':
        return <ConfigWizardPage key="route-configuration" onDismiss={backTo(HOME)} />;
      case 'storage':
        return <StoragePage key="route-storage" onDismiss={backTo(HOME)} />;
      case 'sources':
        return <SourcesPage key="route-sources" onDismiss={backTo(HOME)} />;
      case 'search':
        return <SearchPage key="search" onDismiss={backTo({ type: 'home' })} />;
      case 'preferences':
        return <PreferencesPage key="preferences" onDismiss={backTo(HOME)} />;
      case 'redirect':
        return <Redirect key="redirect" to={screen.to} />;
      case 'notFound':
        return <NotFoundScreen key="not-found" />;
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
        key={logoElement}
        position={logoPosition}
        homeLeft={homeLeft}
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
          // No blur on the TV
          lowResourceAnimation={builtForTizen}
          // On the TV the wordmark shows, under the identical settled logo, before the intro
          // starts: painting it on the first frame stalled it for about 250 ms
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
