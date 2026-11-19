import { computedEnv, env } from './env';
import { readTvServer } from './tv-server';

export const builtForTizen = env.TIZEN;
/** localStorage[key], or null when storage is missing or blocked (reading it can throw). */
function readStorage(key: string): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
  } catch {
    return null;
  }
}
/** Spike (VITE_TV_GL_ROWS): Home's rows drawn in one WebGL canvas on the TV build. */
export const glRowsEnabled =
  (builtForTizen && env.TV_GL_ROWS) ||
  // Development: localStorage['miauflix:gl-rows'] = '1' tries it in a browser. Keys only: the
  // canvas draws the cards, and the (hidden) DOM buttons under it aren't where they're drawn
  (import.meta.env.DEV && readStorage('miauflix:gl-rows') === '1');
/**
 * Debugging the GL surface on the TV (and in development): localStorage['miauflix:gl-tuning'] as
 * JSON, e.g. {"antialias": false, "textureBudget": 33554432}, read at start.
 */
export const glTuningOverride: Record<string, unknown> | undefined = (() => {
  if (!(builtForTizen || import.meta.env.DEV)) return;
  const raw = readStorage('miauflix:gl-tuning');
  try {
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
})();
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
