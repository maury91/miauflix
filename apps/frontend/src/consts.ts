export const API_URL = window.API_URL;
export const builtForTizen = import.meta.env['VITE_TIZEN'] === 'true';
export const IS_TIZEN = 'tizen' in window;
export const IS_TV = builtForTizen || IS_TIZEN;
export const IS_SLOW_DEVICE = IS_TV;
export const DISABLE_STREAMING = false;

export const PALETTE = {
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
