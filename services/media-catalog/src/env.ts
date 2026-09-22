import { join } from 'node:path';

/**
 * Environment knobs of the media-catalog service.
 *
 * Only infrastructure is env-driven; every *catalog* variable (provider URL, token,
 * sync intervals...) is an ordinary config variable resolved through the config
 * precedence chain (push > env > file > default) — see src/config/config.service.ts.
 */

export interface ServiceEnv {
  host: string;
  port: number;
  dataDir: string;
  configFile?: string;
  keyFile?: string;
  disableBackgroundTasks: boolean;
  bunqueue: { host: string; port: number; token?: string };
}

const bool = (value: string | undefined): boolean =>
  value === '1' || value?.toLowerCase() === 'true' || value === 'yes';

const int = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export function loadEnv(env: Record<string, string | undefined> = process.env): ServiceEnv {
  const dataDir = env.CATALOG_DATA_DIR ?? env.DATA_DIR ?? './data';
  return {
    host: env.CATALOG_HOST ?? '0.0.0.0',
    port: int(env.CATALOG_PORT, 3001),
    dataDir,
    configFile: env.CATALOG_CONFIG_FILE ?? join(dataDir, 'config.json'),
    keyFile: env.CATALOG_KEY_FILE ?? join(dataDir, '.catalog-key'),
    disableBackgroundTasks: bool(
      env.CATALOG_DISABLE_BACKGROUND_TASKS ?? env.DISABLE_BACKGROUND_TASKS
    ),
    bunqueue: {
      host: env.BUNQUEUE_HOST ?? '127.0.0.1',
      port: int(env.BUNQUEUE_PORT, 6789),
      token: env.BUNQUEUE_TOKEN || undefined,
    },
  };
}
