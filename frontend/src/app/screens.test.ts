import { describe, expect, it } from 'vitest';

import type { AppState } from './hooks/useAppState';
import type { AppRoute } from './router';
import { resolveScreen } from './screens';

const routes: Record<string, AppRoute> = {
  home: { type: 'home' },
  movie: { type: 'movieDetails', mediaId: 7 },
  player: { type: 'moviePlayer', mediaId: 7 },
  search: { type: 'search' },
  configuration: { type: 'configuration' },
  storage: { type: 'storage' },
  sources: { type: 'sources' },
  qr: { type: 'qrApproval', approvalToken: 'abc' },
  missing: { type: 'notFound', pathname: '/nope' },
  profiles: { type: 'profiles' },
  newProfile: { type: 'newProfile' },
  editProfile: { type: 'editProfile', userId: 'user-1' },
};

const resolve = (
  route: string,
  appState: AppState,
  overrides: Partial<Parameters<typeof resolveScreen>[0]> = {}
) =>
  resolveScreen({
    route: routes[route]!,
    appState,
    booted: true,
    homeEligible: false,
    requiredConfigActive: false,
    isAdmin: true,
    ...overrides,
  });

describe('resolveScreen', () => {
  it('shows Who’s watching over any route until a profile is chosen', () => {
    expect(resolve('movie', 'profiles')).toEqual({ kind: 'whosWatching', startup: true });
    expect(resolve('profiles', 'profiles')).toEqual({ kind: 'whosWatching', startup: true });
    expect(resolve('profiles', 'home')).toEqual({ kind: 'whosWatching', startup: false });
  });

  it('opens profile management before and after a profile is chosen, but not before sign-in', () => {
    expect(resolve('newProfile', 'home')).toEqual({ kind: 'newProfile' });
    expect(resolve('editProfile', 'profiles')).toEqual({ kind: 'editProfile', userId: 'user-1' });
    expect(resolve('editProfile', 'login')).toEqual({ kind: 'login' });
  });

  it.each<[string, AppState, string]>([
    // Startup gates show over any route, so a deep link opens once they clear.
    ['movie', 'loading', 'loading'],
    ['movie', 'initial_setup', 'setup'],
    ['movie', 'login', 'login'],
    ['search', 'login', 'login'],
    ['movie', 'config', 'optionalConfig'],
    ['player', 'config_wizard', 'requiredConfig'],
    // Signed in and configured: the route decides.
    ['home', 'home', 'media'],
    ['movie', 'home', 'media'],
    ['player', 'home', 'media'],
    ['configuration', 'home', 'configuration'],
    ['storage', 'home', 'storage'],
    ['sources', 'home', 'sources'],
    ['missing', 'home', 'notFound'],
  ])('%s while %s → %s', (route, appState, kind) => {
    expect(resolve(route, appState).kind).toBe(kind);
  });

  it('opens QR approval before signing in or finishing setup', () => {
    for (const appState of ['loading', 'initial_setup', 'login', 'home'] as const)
      expect(resolve('qr', appState)).toEqual({ kind: 'qrApproval', approvalToken: 'abc' });
  });

  it.each(['configuration', 'storage', 'sources'])('sends non-admins from %s to Home', route => {
    expect(resolve(route, 'home', { isAdmin: false })).toEqual({
      kind: 'redirect',
      to: { type: 'home' },
    });
  });

  it('keeps the required wizard open until it is dismissed, even once configured', () => {
    expect(resolve('home', 'home', { requiredConfigActive: true }).kind).toBe('requiredConfig');
  });

  it('holds other pages for the opening logo, but mounts Home at once behind the intro', () => {
    expect(resolve('search', 'home', { booted: false }).kind).toBe('loading');
    expect(resolve('home', 'home', { booted: false, homeEligible: true }).kind).toBe('media');
  });

  it('keeps choosing sources open until dismissed, behind the required wizard', () => {
    expect(resolve('home', 'sources_setup', { sourcesSetupActive: true }).kind).toBe(
      'sourcesSetup'
    );
    // Turning a source on can surface optional settings: the page stays
    expect(resolve('home', 'config', { sourcesSetupActive: true }).kind).toBe('sourcesSetup');
    expect(resolve('home', 'config').kind).toBe('optionalConfig');
    expect(
      resolve('home', 'sources_setup', { sourcesSetupActive: true, requiredConfigActive: true })
        .kind
    ).toBe('requiredConfig');
  });
});
