import type { AppState } from '@app/hooks/useAppState';
import type { AppRoute } from '@app/router';

/** What the app shows. Home, details and player are one screen (`media`) driven by the route. */
export type AppScreen =
  | { kind: 'qrApproval'; approvalToken: string }
  | { kind: 'loading' }
  | { kind: 'setup' }
  | { kind: 'login' }
  /** Who's watching: at startup (`startup`, nothing to go back to) or opened from Home. */
  | { kind: 'whosWatching'; startup: boolean }
  | { kind: 'manageProfiles' }
  | { kind: 'newProfile' }
  | { kind: 'editProfile'; userId: string }
  /** Something is not configured, but the app can be used: the admin may skip it. */
  | { kind: 'optionalConfig' }
  /** Essential configuration is missing (or the admin is still finishing it). */
  | { kind: 'requiredConfig' }
  | { kind: 'configuration' }
  | { kind: 'storage' }
  | { kind: 'sources' }
  | { kind: 'settings' }
  | { kind: 'search' }
  | { kind: 'notFound' }
  | { kind: 'media' }
  /** The route is not allowed; replace it without showing the page. */
  | { kind: 'redirect'; to: AppRoute };

const SETTINGS: AppRoute = { type: 'settings' };

/**
 * Decide the screen from the route and the app's startup state, top to bottom. Startup gates
 * (setup, login, configuration) show over the route without changing it, so a deep link opens
 * once they are cleared. QR approval works before signing in. Admin pages redirect others to
 * Settings without mounting.
 */
export function resolveScreen({
  route,
  appState,
  booted,
  homeEligible,
  requiredConfigActive,
  isAdmin,
}: {
  route: AppRoute;
  appState: AppState;
  /** The opening logo has been shown; pages other than Home wait for it. */
  booted: boolean;
  /** Home is what will show, so it mounts at once behind the intro. */
  homeEligible: boolean;
  /** The required configuration wizard was opened and not yet dismissed. */
  requiredConfigActive: boolean;
  isAdmin: boolean;
}): AppScreen {
  if (route.type === 'qrApproval')
    return { kind: 'qrApproval', approvalToken: route.approvalToken };
  if (appState === 'loading' || (!booted && !homeEligible)) return { kind: 'loading' };
  if (appState === 'initial_setup') return { kind: 'setup' };
  if (appState === 'login') return { kind: 'login' };
  // Profiles are managed before anyone is watching too, so they come before the other gates.
  if (route.type === 'profiles') return { kind: 'whosWatching', startup: appState === 'profiles' };
  if (route.type === 'manageProfiles') return { kind: 'manageProfiles' };
  if (route.type === 'newProfile') return { kind: 'newProfile' };
  if (route.type === 'editProfile') return { kind: 'editProfile', userId: route.userId };
  if (appState === 'profiles') return { kind: 'whosWatching', startup: true };
  if (appState === 'config') return { kind: 'optionalConfig' };
  if (requiredConfigActive || appState === 'config_wizard') return { kind: 'requiredConfig' };
  // Past the gates the user is signed in.
  if (route.type === 'configuration' || route.type === 'storage' || route.type === 'sources')
    return isAdmin ? { kind: route.type } : { kind: 'redirect', to: SETTINGS };
  if (route.type === 'settings') return { kind: 'settings' };
  if (route.type === 'search') return { kind: 'search' };
  if (route.type === 'notFound') return { kind: 'notFound' };
  return { kind: 'media' };
}
