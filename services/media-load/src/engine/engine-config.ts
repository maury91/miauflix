import { SIZE_PATTERN } from '../config/schema';

/** The engine's settings, parsed as the backend parsed them (sizes as bigint bytes). */
export interface EngineSettings {
  CONTENT_DOWNLOAD_LIMIT: bigint;
  CONTENT_UPLOAD_LIMIT: bigint;
  CONTENT_CONNECTION_LIMIT: number;
  CONTENT_CONNECTION_BUDGET: number;
  CONTENT_SEED_DURATION_SECONDS: number;
  DISABLE_DISCOVERY: boolean;
  STORAGE_PAD_FILE_SIZES: boolean;
  STATIC_TRACKERS: string[];
  BEST_TRACKERS_DOWNLOAD_URL: string;
  BLACKLISTED_TRACKERS_DOWNLOAD_URL: string;
  DOWNLOAD_PATH: string;
  STORAGE_THRESHOLD: bigint;
  STORAGE_PLAYBACK_RESERVE: bigint;
  /** Delivered with `attach`, never as a setting. */
  SOURCE_SECURITY_KEY: string;
}

/** What the engine reads its settings through (the backend's `ConfigService` shape). */
export interface EngineConfig {
  getOrThrow<K extends keyof EngineSettings>(key: K): EngineSettings[K];
  get<K extends keyof EngineSettings>(key: K): EngineSettings[K] | undefined;
}

const UNITS: Record<string, bigint> = {
  B: 1n,
  KB: 1024n,
  MB: 1024n ** 2n,
  GB: 1024n ** 3n,
  TB: 1024n ** 4n,
};

export class InvalidSettingsError extends Error {
  constructor(readonly keys: string[]) {
    super(`Invalid media load settings: ${keys.join(', ')}`);
  }
}

/**
 * Parse applied values (every schema key, defaults filled in by the host) into settings.
 * @throws InvalidSettingsError naming every key that does not parse.
 */
export const parseEngineSettings = (
  values: Record<string, string>,
  securityKey: string
): EngineSettings => {
  const invalid: string[] = [];
  const size = (key: string, fallback?: bigint): bigint => {
    const match = (values[key] ?? '').trim().match(SIZE_PATTERN);
    if (!match) {
      if (fallback !== undefined && !values[key]) return fallback;
      invalid.push(key);
      return 0n;
    }
    return BigInt(match[1]) * UNITS[match[2].toUpperCase()];
  };
  const integer = (key: string, min: number): number => {
    const value = Number(values[key]);
    if (!Number.isInteger(value) || value < min) invalid.push(key);
    return value;
  };
  const text = (key: string, minLength = 0): string => {
    const value = (values[key] ?? '').trim();
    if (value.length < minLength) invalid.push(key);
    return value;
  };
  const flag = (key: string): boolean => {
    const value = (values[key] ?? 'false').trim().toLowerCase();
    if (!['true', 'false', '1', '0', 'yes', 'no', ''].includes(value)) invalid.push(key);
    return ['true', '1', 'yes'].includes(value);
  };
  const settings: EngineSettings = {
    CONTENT_DOWNLOAD_LIMIT: size('CONTENT_DOWNLOAD_LIMIT'),
    CONTENT_UPLOAD_LIMIT: size('CONTENT_UPLOAD_LIMIT'),
    CONTENT_CONNECTION_LIMIT: integer('CONTENT_CONNECTION_LIMIT', 1),
    CONTENT_CONNECTION_BUDGET: integer('CONTENT_CONNECTION_BUDGET', 1),
    CONTENT_SEED_DURATION_SECONDS: integer('CONTENT_SEED_DURATION_SECONDS', 0),
    DISABLE_DISCOVERY: flag('DISABLE_DISCOVERY'),
    STORAGE_PAD_FILE_SIZES: flag('STORAGE_PAD_FILE_SIZES'),
    STATIC_TRACKERS: (values.STATIC_TRACKERS ?? '')
      .split(',')
      .map(item => item.trim())
      .filter(Boolean),
    BEST_TRACKERS_DOWNLOAD_URL: text('BEST_TRACKERS_DOWNLOAD_URL'),
    BLACKLISTED_TRACKERS_DOWNLOAD_URL: text('BLACKLISTED_TRACKERS_DOWNLOAD_URL'),
    DOWNLOAD_PATH: text('DOWNLOAD_PATH', 1),
    STORAGE_THRESHOLD: size('STORAGE_THRESHOLD', 50n * UNITS.GB),
    STORAGE_PLAYBACK_RESERVE: size('STORAGE_PLAYBACK_RESERVE', 0n),
    SOURCE_SECURITY_KEY: securityKey,
  };
  if (invalid.length) throw new InvalidSettingsError(invalid);
  return settings;
};

/** A config view over settings that can be replaced while the engine runs. */
export const engineConfig = (current: () => EngineSettings): EngineConfig => ({
  getOrThrow: key => current()[key],
  get: key => current()[key],
});
