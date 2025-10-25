import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock environment variables
const mockEnvVars = {
  VITE_API_URL: 'http://localhost:3001',
  NODE_ENV: 'development',
  VITE_TIZEN: 'false',
};

// Mock process.env and import.meta.env
const originalProcessEnv = process.env;
const originalImportMeta = import.meta.env;

describe('Environment Configuration', () => {
  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Mock process.env
    process.env = { ...originalProcessEnv, ...mockEnvVars };

    // Mock import.meta.env
    Object.defineProperty(import.meta, 'env', {
      value: { ...mockEnvVars },
      writable: true,
    });
  });

  afterEach(() => {
    // Restore original values
    process.env = originalProcessEnv;
    Object.defineProperty(import.meta, 'env', {
      value: originalImportMeta,
      writable: true,
    });
  });

  it('should parse valid environment variables', async () => {
    // Dynamic import to get fresh module
    const { env, computedEnv } = await import('./env');

    expect(env.API_URL).toBe('http://localhost:3001');
    expect(env.NODE_ENV).toBe('development');
    expect(env.TIZEN).toBe(false);
    expect(computedEnv.DEV).toBe(true);
    expect(computedEnv.PROD).toBe(false);
  });

  it('should handle TIZEN flag correctly', async () => {
    process.env['VITE_TIZEN'] = 'true';
    Object.defineProperty(import.meta, 'env', {
      value: { ...mockEnvVars, VITE_TIZEN: 'true' },
      writable: true,
    });

    // Clear module cache to get fresh import
    vi.resetModules();
    const { env } = await import('./env');

    expect(env.TIZEN).toBe(true);
  });

  it('should use defaults when environment variables are missing', async () => {
    // Clear environment variables
    process.env = {};
    Object.defineProperty(import.meta, 'env', {
      value: {},
      writable: true,
    });

    vi.resetModules();
    const { env, computedEnv } = await import('./env');

    expect(env.API_URL).toBe('http://localhost:3001');
    expect(env.NODE_ENV).toBe('development');
    expect(env.TIZEN).toBe(false);
    expect(computedEnv.DEV).toBe(true);
  });

  it('should handle invalid API_URL gracefully', async () => {
    process.env['VITE_API_URL'] = 'not-a-valid-url';
    Object.defineProperty(import.meta, 'env', {
      value: { ...mockEnvVars, VITE_API_URL: 'not-a-valid-url' },
      writable: true,
    });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.resetModules();
    const { env } = await import('./env');

    // Should fall back to default
    expect(env.API_URL).toBe('http://localhost:3001');
    expect(consoleSpy).toHaveBeenCalledWith('❌ Environment validation failed:', expect.any(Error));

    consoleSpy.mockRestore();
  });

  it('should handle invalid NODE_ENV gracefully', async () => {
    process.env['NODE_ENV'] = 'invalid-env';
    Object.defineProperty(import.meta, 'env', {
      value: { ...mockEnvVars, NODE_ENV: 'invalid-env' },
      writable: true,
    });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.resetModules();
    const { env, computedEnv } = await import('./env');

    // Should fall back to default
    expect(env.NODE_ENV).toBe('development');
    expect(computedEnv.DEV).toBe(true);
    expect(consoleSpy).toHaveBeenCalledWith('❌ Environment validation failed:', expect.any(Error));

    consoleSpy.mockRestore();
  });

  it('should handle production environment correctly', async () => {
    process.env['NODE_ENV'] = 'production';
    Object.defineProperty(import.meta, 'env', {
      value: { ...mockEnvVars, NODE_ENV: 'production' },
      writable: true,
    });

    vi.resetModules();
    const { env, computedEnv } = await import('./env');

    expect(env.NODE_ENV).toBe('production');
    expect(computedEnv.DEV).toBe(false);
    expect(computedEnv.PROD).toBe(true);
  });
});
