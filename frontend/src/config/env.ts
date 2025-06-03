// Environment configuration for MiauFlix frontend
// Phase 0 bootstrap - handles environment variables safely

export interface EnvConfig {
  API_URL: string;
  NODE_ENV: string;
  DEV: boolean;
  PROD: boolean;
  TIZEN: boolean;
}

// Safe environment variable access with fallbacks
function getEnvVar(key: string, defaultValue: string = ''): string {
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    return import.meta.env[key] || defaultValue;
  }
  return defaultValue;
}

// Development detection
const isDev = getEnvVar('NODE_ENV', 'development') === 'development';
const isProd = getEnvVar('NODE_ENV', 'development') === 'production';

// Default API URL based on environment
const getDefaultApiUrl = (): string => {
  if (isProd) {
    return '/api'; // Production: assume same origin
  }
  // Development: try to detect backend port or fallback
  return 'http://localhost:3001'; // Default backend port
};

export const env: EnvConfig = {
  API_URL: getEnvVar('VITE_API_URL', getDefaultApiUrl()),
  NODE_ENV: getEnvVar('NODE_ENV', 'development'),
  DEV: isDev,
  PROD: isProd,
  TIZEN: getEnvVar('VITE_TIZEN', 'false') === 'true',
};

// Development logging
if (env.DEV) {
  console.log('🚀 MiauFlix Frontend Environment:', {
    API_URL: env.API_URL,
    NODE_ENV: env.NODE_ENV,
    TIZEN: env.TIZEN,
  });
}
