import { configureStore } from '@reduxjs/toolkit';
import { act, render as rtlRender, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { appPage, introControls, homeControls, logoControls, idleControls } = vi.hoisted(() => ({
  appPage: { value: 'login' },
  introControls: {
    ready: null as null | (() => void),
    start: null as null | (() => void),
    started: false,
    delayStart: false,
    complete: null as null | (() => void),
    logoVisible: false,
  },
  homeControls: { hydrated: null as null | (() => void) },
  logoControls: { centered: null as null | (() => void) },
  idleControls: { callback: null as null | (() => void) },
}));

vi.mock('@app/hooks/useAppState', () => ({ useAppState: () => appPage.value }));

vi.mock('@app/shell/IntroAnimation', async () => {
  const React = await import('react');
  const IntroAnimation = React.forwardRef<
    { start: () => void },
    { onReady?: () => void; onStart?: () => void; onComplete: () => void; logoVisible?: boolean }
  >(({ onReady, onStart, onComplete, logoVisible }, ref) => {
    introControls.ready = onReady ?? null;
    introControls.complete = onComplete;
    introControls.logoVisible = logoVisible ?? false;
    React.useImperativeHandle(
      ref,
      () => ({
        start: () => {
          introControls.started = true;
          if (introControls.delayStart) introControls.start = onStart ?? null;
          else onStart?.();
        },
      }),
      [onStart]
    );
    React.useEffect(() => {
      introControls.started = false;
    }, []);
    React.useEffect(() => {
      onReady?.();
    }, [onComplete, onReady]);
    return (
      <div data-testid="intro-animation" data-logo-visible={String(logoVisible ?? false)}>
        Intro Animation
      </div>
    );
  });
  return { IntroAnimation };
});

vi.mock('@shared/ui/logo/Logo', async () => {
  const React = await import('react');
  return {
    Logo: ({
      page,
      disableMotion,
      visible,
      aboveIntro,
      pulsing,
      onPulseSettled,
      onPositionTransitionEnd,
    }: {
      page: string;
      disableMotion?: boolean;
      visible?: boolean;
      aboveIntro?: boolean;
      pulsing?: boolean;
      onPulseSettled?: () => void;
      onPositionTransitionEnd?: () => void;
    }) => {
      logoControls.centered = onPositionTransitionEnd ?? null;
      // The real logo settles at once when it is already at full size.
      React.useEffect(() => {
        if (!pulsing) onPulseSettled?.();
      }, [pulsing, onPulseSettled]);
      return (
        <div
          data-testid="logo"
          data-page={page}
          data-disable-motion={String(disableMotion ?? false)}
          data-visible={String(visible ?? true)}
          data-above-intro={String(aboveIntro ?? false)}
          data-pulsing={String(pulsing ?? false)}
        />
      );
    },
  };
});

vi.mock('@shared/components', () => ({
  ErrorBoundary: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => children,
  MotionConfig: ({ children }: { children: ReactNode }) => children,
  motion: new Proxy({}, { get: () => 'div' }),
}));

vi.mock('@pages/home/HomePage', () => ({
  default: ({ interactive, onHydrated }: { interactive: boolean; onHydrated?: () => void }) => {
    homeControls.hydrated = onHydrated ?? null;
    return <main data-testid="home-page" data-interactive={String(interactive)} />;
  },
}));
vi.mock('@pages/login/LoginPage', () => ({ default: () => <main data-testid="login-page" /> }));
vi.mock('@pages/setup/SetupPage', () => ({ default: () => <main data-testid="setup-page" /> }));
vi.mock('@pages/config/ConfigWizardPage', () => ({
  default: () => <main data-testid="config-page" />,
}));
vi.mock('@pages/config/ConfigurationWizardPage', () => ({
  default: () => <main data-testid="required-config-page" />,
}));

import { appStateSlice } from '@store/slices/appState';
import { authSlice, setCurrentUser, setSession } from '@store/slices/auth';

import { AppShell } from './AppShell';

function renderAppShell(authenticated = false) {
  const store = configureStore({
    reducer: { appState: appStateSlice.reducer, auth: authSlice.reducer },
  });
  if (authenticated) {
    store.dispatch(setSession('test-session'));
    store.dispatch(
      setCurrentUser({
        id: 'test-user',
        email: 'test@example.com',
        displayName: 'Test User',
        role: 'user',
      })
    );
  }
  return rtlRender(<AppShell />, {
    wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
  });
}

/** Let the centred start paint; the logo then moves to the page the app resolved to. */
const finishBoot = () =>
  act(async () => {
    for (let frame = 0; frame < 2; frame += 1)
      await new Promise(resolve => requestAnimationFrame(resolve));
  });

describe('AppShell intro sequence', () => {
  beforeEach(() => {
    appPage.value = 'login';
    introControls.ready = null;
    introControls.start = null;
    introControls.started = false;
    introControls.delayStart = false;
    introControls.complete = null;
    introControls.logoVisible = false;
    homeControls.hydrated = null;
    logoControls.centered = null;
    idleControls.callback = null;
    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: () => void) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    idleWindow.requestIdleCallback = callback => {
      idleControls.callback = callback;
      return 1;
    };
    idleWindow.cancelIdleCallback = () => {};
    window.dispatchEvent = vi.fn();
    window._miauflixAnimationComplete = undefined;
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: () => void) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    delete idleWindow.requestIdleCallback;
    delete idleWindow.cancelIdleCallback;
  });

  it.each([
    ['login', 'login', 'login-page'],
    ['required configuration', 'config_wizard', 'required-config-page'],
    ['first user setup', 'initial_setup', 'setup-page'],
  ])(
    'opens on the pulsing centred logo, then moves it to %s and shows the page',
    async (_name, page, testId) => {
      appPage.value = page;
      renderAppShell();

      const logo = screen.getByTestId('logo');
      expect(logo).toHaveAttribute('data-page', 'intro');
      expect(logo).toHaveAttribute('data-pulsing', 'true');
      expect(logo).toHaveAttribute('data-disable-motion', 'true');
      expect(screen.queryByTestId(testId)).not.toBeInTheDocument();

      await finishBoot();
      expect(logo).toHaveAttribute('data-page', page);
      expect(logo).toHaveAttribute('data-pulsing', 'false');
      expect(logo).toHaveAttribute('data-disable-motion', 'false');
      expect(screen.getByTestId(testId)).toBeInTheDocument();
      expect(screen.queryByTestId('intro-animation')).not.toBeInTheDocument();
      expect(window._miauflixAnimationComplete).toBeUndefined();
    }
  );

  it('keeps Home behind a static black screen until it reports ready', async () => {
    const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent');
    appPage.value = 'config_wizard';
    const view = renderAppShell();
    await finishBoot();

    expect(screen.getByTestId('required-config-page')).toBeInTheDocument();
    expect(screen.queryByTestId('intro-animation')).not.toBeInTheDocument();

    appPage.value = 'home';
    act(() => view.rerender(<AppShell />));

    expect(screen.getByTestId('logo')).toHaveAttribute('data-page', 'intro');
    expect(screen.getByTestId('logo')).toHaveAttribute('data-above-intro', 'true');
    expect(screen.getByTestId('logo')).toHaveAttribute('data-disable-motion', 'false');
    expect(screen.getByTestId('home-page')).toHaveAttribute('data-interactive', 'false');
    expect(screen.getByTestId('home-page').parentElement).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByTestId('home-page').parentElement).toHaveStyle({ visibility: 'visible' });
    expect(screen.getByTestId('intro-animation')).toBeInTheDocument();
    expect(screen.getByTestId('intro-animation')).toHaveAttribute('data-logo-visible', 'false');
    expect(introControls.started).toBe(false);

    act(() => homeControls.hydrated?.());
    expect(screen.getByTestId('intro-animation')).toBeInTheDocument();
    expect(introControls.started).toBe(false);
    act(() => logoControls.centered?.());
    expect(introControls.started).toBe(false);
    act(() => idleControls.callback?.());
    expect(introControls.started).toBe(true);
    expect(screen.getByTestId('home-page')).toHaveAttribute('data-interactive', 'false');
    expect(screen.getByTestId('home-page').parentElement).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByTestId('home-page').parentElement).toHaveAttribute('inert');
    expect(screen.getByTestId('home-page').parentElement).toHaveStyle({ visibility: 'visible' });
    act(() => introControls.complete?.());

    expect(window._miauflixAnimationComplete).toBe(true);
    expect(screen.getByTestId('home-page')).toHaveAttribute('data-interactive', 'true');
    expect(screen.getByTestId('home-page').parentElement).toHaveAttribute('aria-hidden', 'false');
    expect(screen.getByTestId('home-page').parentElement).toHaveStyle({ visibility: 'visible' });
    expect(dispatchEventSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'miauflix:intro:animation:complete' })
    );
  });

  it('plays the intro before Home when an authenticated session is already available', () => {
    introControls.delayStart = true;
    appPage.value = 'home';
    renderAppShell(true);

    expect(screen.getByTestId('logo')).toHaveAttribute('data-page', 'intro');
    expect(screen.getByTestId('intro-animation')).toBeInTheDocument();
    expect(screen.getByTestId('home-page')).toHaveAttribute('data-interactive', 'false');
    expect(screen.getByTestId('home-page').parentElement).toHaveAttribute('aria-hidden', 'true');
    expect(introControls.started).toBe(false);

    act(() => homeControls.hydrated?.());
    expect(screen.getByTestId('intro-animation')).toBeInTheDocument();
    act(() => idleControls.callback?.());
    expect(introControls.started).toBe(true);
    expect(screen.getByTestId('intro-animation')).toHaveAttribute('data-logo-visible', 'true');
    expect(screen.getByTestId('logo')).toHaveAttribute('data-page', 'intro');
    expect(screen.getByTestId('logo')).toHaveAttribute('data-disable-motion', 'true');
    expect(introControls.start).not.toBeNull();
    act(() => introControls.start?.());
    expect(screen.getByTestId('logo')).toHaveAttribute('data-page', 'home');
    expect(screen.getByTestId('logo')).toHaveAttribute('data-disable-motion', 'true');
    expect(screen.getByTestId('home-page')).toHaveAttribute('data-interactive', 'false');
    expect(screen.getByTestId('home-page').parentElement).toHaveStyle({ visibility: 'visible' });
    act(() => introControls.complete?.());
    expect(screen.getByTestId('logo')).toHaveAttribute('data-page', 'home');
    expect(window._miauflixAnimationComplete).toBe(true);
    expect(screen.getByTestId('home-page')).toHaveAttribute('data-interactive', 'true');
  });

  it('starts at the centered logo during a cold authenticated load and reveals Home logo in place', () => {
    appPage.value = 'loading';
    const view = renderAppShell(true);

    expect(screen.getByTestId('logo')).toHaveAttribute('data-page', 'intro');
    expect(screen.queryByTestId('intro-animation')).not.toBeInTheDocument();

    appPage.value = 'home';
    act(() => view.rerender(<AppShell />));
    expect(screen.getByTestId('logo')).toHaveAttribute('data-page', 'intro');
    expect(screen.getByTestId('home-page')).toHaveAttribute('data-interactive', 'false');
    expect(screen.getByTestId('intro-animation')).toBeInTheDocument();
    act(() => homeControls.hydrated?.());
    act(() => idleControls.callback?.());

    expect(screen.getByTestId('intro-animation')).toBeInTheDocument();
    expect(screen.getByTestId('logo')).toHaveAttribute('data-page', 'home');
    expect(screen.getByTestId('home-page')).toHaveAttribute('data-interactive', 'false');
    expect(screen.getByTestId('home-page').parentElement).toHaveStyle({ visibility: 'visible' });
    act(() => introControls.complete?.());
    expect(screen.getByTestId('logo')).toHaveAttribute('data-page', 'home');
  });

  it('keeps the logo centred and pulsing while the initial checks are unresolved', async () => {
    appPage.value = 'loading';
    const view = renderAppShell();
    await finishBoot();

    expect(screen.getByTestId('logo')).toHaveAttribute('data-page', 'intro');
    expect(screen.getByTestId('logo')).toHaveAttribute('data-pulsing', 'true');

    appPage.value = 'login';
    act(() => view.rerender(<AppShell />));
    await finishBoot();
    expect(screen.getByTestId('logo')).toHaveAttribute('data-page', 'login');
    expect(screen.getByTestId('logo')).toHaveAttribute('data-pulsing', 'false');
    expect(screen.getByTestId('logo')).toHaveAttribute('data-disable-motion', 'false');
  });

  it('stops the loading pulse when the logged-in intro takes over', () => {
    appPage.value = 'home';
    renderAppShell(true);

    expect(screen.getByTestId('logo')).toHaveAttribute('data-pulsing', 'true');
    act(() => homeControls.hydrated?.());
    act(() => idleControls.callback?.());
    expect(screen.getByTestId('logo')).toHaveAttribute('data-pulsing', 'false');
  });

  it('waits for unresolved initial checks and does not complete an interrupted intro', () => {
    appPage.value = 'loading';
    const view = renderAppShell();
    expect(screen.queryByTestId('intro-animation')).not.toBeInTheDocument();

    appPage.value = 'home';
    act(() => view.rerender(<AppShell />));
    expect(introControls.started).toBe(false);
    act(() => homeControls.hydrated?.());
    act(() => idleControls.callback?.());
    expect(introControls.complete).not.toBeNull();

    const interruptedCompletion = introControls.complete;
    appPage.value = 'login';
    act(() => view.rerender(<AppShell />));
    act(() => interruptedCompletion?.());
    expect(window._miauflixAnimationComplete).toBeUndefined();

    appPage.value = 'home';
    act(() => view.rerender(<AppShell />));
    expect(introControls.started).toBe(false);
    act(() => homeControls.hydrated?.());
    act(() => logoControls.centered?.());
    act(() => idleControls.callback?.());
    expect(screen.getByTestId('intro-animation')).toBeInTheDocument();
    act(() => introControls.complete?.());
    expect(window._miauflixAnimationComplete).toBe(true);
  });
});
