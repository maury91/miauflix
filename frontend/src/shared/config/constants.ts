import { computedEnv, env } from './env';
import { readTvServer } from './tv-server';

export const builtForTizen = env.TIZEN;
/**
 * The backend. The TV app uses the server picked on the TV (see features/server-discovery), or
 * the one it was packaged with; '' until one is picked.
 */
export const API_URL = builtForTizen
  ? (readTvServer() ?? (/^https?:\/\//.test(env.API_URL) ? env.API_URL : ''))
  : env.API_URL;
/** The pairing service the TV app looks servers up at, '' when packaged without it ('off'). */
export const TV_PAIRING_URL =
  env.TV_PAIRING_URL === 'off' ? '' : env.TV_PAIRING_URL.replace(/\/+$/, '');
export const IS_TIZEN = typeof window !== 'undefined' && 'tizen' in window;
export const IS_TV = builtForTizen || IS_TIZEN;
export const IS_SLOW_DEVICE = IS_TV;
/** The TV app authenticates with headers; the backend allows its origin without credentials. */
export const API_CREDENTIALS: RequestCredentials = builtForTizen ? 'omit' : 'include';
export const DISABLE_STREAMING = false;

/**
 * Where the web app is served: this page's origin, or for the TV app, whose page is a local file,
 * the backend's (which serves the web app).
 */
export function webAppOrigin(): string {
  return builtForTizen ? new URL(API_URL).origin : window.location.origin;
}

// Re-export computed environment properties
export const { DEV, PROD } = computedEnv;

export { PALETTE, SETTINGS_PALETTE } from '../ui/tokens';
