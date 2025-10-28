// Environment configuration for MiauFlix frontend
// Phase 0 bootstrap - handles environment variables safely
import { z } from 'zod';

// Environment variable schema
const envSchema = z.object({
  API_URL: z
    .string()
    .refine(
      val => {
        // Allow relative paths starting with /
        if (val.startsWith('/')) {
          return true;
        }
        // For URLs starting with http, validate as proper URL
        if (val.startsWith('http')) {
          try {
            new URL(val);
            return true;
          } catch {
            return false;
          }
        }
        return false;
      },
      {
        message: "API_URL must be a valid URL (http/https) or relative path starting with '/'",
      }
    )
    .default('http://localhost:3000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  TIZEN: z
    .string()
    .transform(val => val === 'true')
    .default(false),
});

export type EnvConfig = z.infer<typeof envSchema>;

// Safe environment variable access with validation
function getEnvVars(): Record<string, string> {
  const envVars: Record<string, string> = {};

  // Jest environment check
  if (typeof process !== 'undefined' && process.env) {
    Object.assign(envVars, process.env);
  }
  // Vite environment check
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    Object.assign(envVars, import.meta.env);
  }

  return envVars;
}

// Parse and validate environment variables
function parseEnv(): EnvConfig {
  const rawEnv = getEnvVars();
  const defaultApiUrl = rawEnv['NODE_ENV'] === 'production' ? '/' : 'http://localhost:3001';

  // Map Vite env vars to our schema
  const envData = {
    API_URL: rawEnv['VITE_API_URL'] || rawEnv['API_URL'] || defaultApiUrl,
    NODE_ENV: rawEnv['NODE_ENV'],
    TIZEN: rawEnv['VITE_TIZEN'] || rawEnv['TIZEN'],
  };

  try {
    return envSchema.parse(envData);
  } catch (error) {
    console.error('❌ Environment validation failed:', error);
    console.error('Raw environment data:', envData);

    // Return safe defaults in case of validation failure
    return {
      API_URL: defaultApiUrl,
      NODE_ENV: 'development',
      TIZEN: false,
    };
  }
}

export const env: EnvConfig = parseEnv();

// Add computed properties for backward compatibility
export const computedEnv = {
  ...env,
  DEV: env.NODE_ENV === 'development',
  PROD: env.NODE_ENV === 'production',
};

// Development logging
if (computedEnv.DEV) {
  console.log('🚀 MiauFlix Frontend Environment:', {
    API_URL: env.API_URL,
    NODE_ENV: env.NODE_ENV,
    TIZEN: env.TIZEN,
    DEV: computedEnv.DEV,
    PROD: computedEnv.PROD,
  });
}
