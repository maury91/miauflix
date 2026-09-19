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
    brand: '#D81F27',
    brandHover: '#EA2932',
    brandPressed: '#B71820',
    interactive: '#D81F27',
    interactiveSubtle: 'rgba(216, 31, 39, 0.18)',
    link: '#D81F27',
    success: '#42B883',
    warning: '#E5A63B',
    danger: '#EF4B52',
    dangerSubtle: 'rgba(239, 75, 82, 0.14)',
    dangerBorder: 'rgba(239, 75, 82, 0.42)',
  },
  background: {
    primary: '#0A0D0F',
    surface1: '#0C1214',
    surface2: '#111719',
    surfaceHover: '#182023',
    input: '#242729',
    border: '#253034',
  },
  text: {
    primary: '#F5F5F5',
    secondary: '#A6ADAF',
    muted: '#70777A',
    disabled: '#50585B',
  },
};

/** Semantic palette for configuration and account setup surfaces. */
export const SETTINGS_PALETTE = {
  background: {
    primary: '#0A0D0F',
    surface: '#111719',
    input: '#242729',
    border: '#30383B',
  },
  text: {
    primary: '#F5F5F5',
    secondary: '#A6ADAF',
    optional: '#70777A',
  },
  color: {
    primaryButton: '#E9ECEE',
    primaryButtonHover: '#FFFFFF',
    primaryButtonPressed: '#CDD2D4',
    interactive: '#5C7CFA',
    interactiveHover: '#748FFC',
    interactiveSubtle: 'rgba(92, 124, 250, 0.18)',
    success: '#42B883',
    warning: '#E5A63B',
    danger: '#D81F27',
    dangerSubtle: 'rgba(216, 31, 39, 0.14)',
    dangerBorder: 'rgba(216, 31, 39, 0.42)',
  },
};
