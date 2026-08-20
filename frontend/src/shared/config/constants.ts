import { computedEnv, env } from './env';

export const API_URL = env.API_URL;
export const builtForTizen = env.TIZEN;
export const IS_TIZEN = typeof window !== 'undefined' && 'tizen' in window;
export const IS_TV = builtForTizen || IS_TIZEN;
export const IS_SLOW_DEVICE = IS_TV;
export const DISABLE_STREAMING = false;

// Re-export computed environment properties
export const { DEV, PROD } = computedEnv;

export const PALETTE = {
  color: {
    /** Miauflix identity and high-emphasis calls to action. */
    brand: '#db202c',
    brandHover: '#c01e28',
    /** Keyboard focus, selection, and enabled controls. */
    interactive: '#d6dbe0',
    interactiveSubtle: 'rgba(214, 219, 224, 0.18)',
    /** Informational links remain distinct from selection and validation states. */
    link: '#2cb8b2',
    /** Validation failures and destructive states only. */
    danger: '#ff5c68',
    dangerSubtle: 'rgba(255, 92, 104, 0.14)',
    dangerBorder: 'rgba(255, 92, 104, 0.42)',
    success: '#4caf50',
    warning: '#ffb74d',
  },
  background: {
    primary: '#d81f27',
    secondary: '#cdcdcd',
    disabled: '#a0a0a0',
    popup: '#444',
  },
  text: {
    primary: '#f7f7f7',
    secondary: '#000',
    disabled: '#222',
  },
};
