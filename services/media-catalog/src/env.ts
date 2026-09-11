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
  return {
    host: env.CATALOG_HOST ?? '0.0.0.0',
    port: int(env.CATALOG_PORT, 3001),
    dataDir: env.CATALOG_DATA_DIR ?? env.DATA_DIR ?? './data',
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
