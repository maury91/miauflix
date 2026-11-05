import { describe, expect, it } from 'vitest';

import type { AppState } from './hooks/useAppState';
import type { AppRoute } from './router';
import { resolveScreen } from './screens';

const routes: Record<string, AppRoute> = {
  home: { type: 'home' },
  movie: { type: 'movieDetails', mediaId: 7 },
  player: { type: 'moviePlayer', mediaId: 7 },
  settings: { type: 'settings' },
  configuration: { type: 'configuration' },
  storage: { type: 'storage' },
  sources: { type: 'sources' },
  qr: { type: 'qrApproval', approvalToken: 'abc' },
  missing: { type: 'notFound', pathname: '/nope' },
  profiles: { type: 'profiles' },
  manageProfiles: { type: 'manageProfiles' },
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
    expect(resolve('manageProfiles', 'profiles')).toEqual({ kind: 'manageProfiles' });
    expect(resolve('newProfile', 'home')).toEqual({ kind: 'newProfile' });
    expect(resolve('editProfile', 'profiles')).toEqual({ kind: 'editProfile', userId: 'user-1' });
    expect(resolve('manageProfiles', 'login')).toEqual({ kind: 'login' });
  });

  it.each<[string, AppState, string]>([
    // Startup gates show over any route, so a deep link opens once they clear.
    ['movie', 'loading', 'loading'],
    ['movie', 'initial_setup', 'setup'],
    ['movie', 'login', 'login'],
    ['settings', 'login', 'login'],
    ['movie', 'config', 'optionalConfig'],
    ['player', 'config_wizard', 'requiredConfig'],
    // Signed in and configured: the route decides.
    ['home', 'home', 'media'],
    ['movie', 'home', 'media'],
    ['player', 'home', 'media'],
    ['settings', 'home', 'settings'],
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

  it.each(['configuration', 'storage', 'sources'])(
    'sends non-admins from %s to Settings',
    route => {
      expect(resolve(route, 'home', { isAdmin: false })).toEqual({
        kind: 'redirect',
        to: { type: 'settings' },
      });
    }
  );

  it('keeps the required wizard open until it is dismissed, even once configured', () => {
    expect(resolve('home', 'home', { requiredConfigActive: true }).kind).toBe('requiredConfig');
  });

  it('holds other pages for the opening logo, but mounts Home at once behind the intro', () => {
    expect(resolve('settings', 'home', { booted: false }).kind).toBe('loading');
    expect(resolve('home', 'home', { booted: false, homeEligible: true }).kind).toBe('media');
  });
});
