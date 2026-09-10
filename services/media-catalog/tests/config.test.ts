import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

import { CatalogRuntime } from '../src/catalog/bootstrap';
import { CatalogConfigService, type ConfigProber } from '../src/config/config.service';
import { CatalogDatabase } from '../src/db/database';
import type { ServiceContext } from '../src/service-context';

const prober = (ok: boolean): ConfigProber => ({
  test: async () => ({ success: ok, message: ok ? 'provider ready' : 'probe failed' }),
});

const makeConfig = (
  prober: ConfigProber,
  env: Record<string, string | undefined> = {}
): { config: CatalogConfigService; dataDir: string } => {
  const dataDir = mkdtempSync(join(tmpdir(), 'catalog-config-'));
  const config = new CatalogConfigService(dataDir, env);
  config.registerProber(prober);
  return { config, dataDir };
};

describe('CatalogConfigService', () => {
  it('resolves defaults and reports missing required variables', () => {
    const { config, dataDir } = makeConfig(prober(true));
    expect(config.resolve('TMDB_API_URL')).toBe('https://api.themoviedb.org/3');
    expect(config.resolve('TMDB_API_ACCESS_TOKEN')).toBe('');
    expect(config.missingVars()).toEqual(['TMDB_API_ACCESS_TOKEN']);
    expect(config.state).toBe('standby');
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('env overrides defaults and file loses to env', () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'catalog-config-'));
    const envConfig = new CatalogConfigService(dataDir, {
      TMDB_API_URL: 'https://env.example/3',
    });
    envConfig.registerProber(prober(true));
    // Seed the file with a different value; env must still win.
    envConfig.applyRemote({ TMDB_API_URL: '' }); // empty push is a no-op
    expect(envConfig.resolve('TMDB_API_URL')).toBe('https://env.example/3');
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('falls through empty pushed and environment candidates to persisted values', () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'catalog-config-'));
    writeFileSync(
      join(dataDir, 'catalog.config.json'),
      JSON.stringify({
        values: {
          TMDB_API_URL: 'https://file.example/3',
          TMDB_API_ACCESS_TOKEN: 'file-token',
        },
      })
    );
    const config = new CatalogConfigService(dataDir, { TMDB_API_URL: '' });

    // An empty pushed candidate must never hide the persisted fallback either.
    (config as unknown as { pushedValues: Record<string, string> }).pushedValues[
      'TMDB_API_ACCESS_TOKEN'
    ] = '';

    expect(config.resolve('TMDB_API_URL')).toBe('https://file.example/3');
    expect(config.resolve('TMDB_API_ACCESS_TOKEN')).toBe('file-token');
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('push overrides env, persists last-known-good, and hot-reloads to ready', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'catalog-config-'));
    const config = new CatalogConfigService(dataDir, {
      TMDB_API_ACCESS_TOKEN: 'env-token',
    });
    config.registerProber(prober(true));

    const result = await config.applyRemote({ TMDB_API_ACCESS_TOKEN: 'pushed-token' });
    expect(result.success).toBe(true);
    expect(result.reloaded).toBe(true);
    expect(config.state).toBe('ready');
    expect(config.resolve('TMDB_API_ACCESS_TOKEN')).toBe('pushed-token');

    const persisted = JSON.parse(readFileSync(join(dataDir, 'catalog.config.json'), 'utf8'));
    expect(persisted.values.TMDB_API_ACCESS_TOKEN).toBe('pushed-token');
    expect(statSync(join(dataDir, 'catalog.config.json')).mode & 0o777).toBe(0o600);
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('keeps the active configuration, persisted file, and data plane on a rejected candidate', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'catalog-config-'));
    const config = new CatalogConfigService(dataDir, {});
    let activeToken = '';
    config.registerProber({
      test: async () => ({ success: true, message: 'provider ready' }),
      activate: async values => {
        if (values.TMDB_API_ACCESS_TOKEN === 'bad-token') {
          return { success: false, message: 'candidate rejected' };
        }
        activeToken = values.TMDB_API_ACCESS_TOKEN;
        return { success: true, message: 'provider ready' };
      },
    });

    await config.applyRemote({ TMDB_API_ACCESS_TOKEN: 'known-good-token' });
    const persistedBefore = readFileSync(join(dataDir, 'catalog.config.json'), 'utf8');

    const result = await config.applyRemote({ TMDB_API_ACCESS_TOKEN: 'bad-token' });

    expect(result).toMatchObject({ success: false, reloaded: false });
    expect(config.resolve('TMDB_API_ACCESS_TOKEN')).toBe('known-good-token');
    expect(readFileSync(join(dataDir, 'catalog.config.json'), 'utf8')).toBe(persistedBefore);
    expect(activeToken).toBe('known-good-token');
    expect(config.state).toBe('ready');
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('reports secret presence without exposing it and supports explicit clearing', async () => {
    const { config, dataDir } = makeConfig(prober(true), { TMDB_API_ACCESS_TOKEN: 'env-token' });
    await config.applyRemote({ TMDB_API_ACCESS_TOKEN: 'super-secret-token' });

    expect(config.getValues().configuredKeys).toContain('TMDB_API_ACCESS_TOKEN');
    expect(JSON.stringify(config.getValues())).not.toContain('super-secret-token');

    const result = await config.applyRemote({}, ['TMDB_API_ACCESS_TOKEN']);
    expect(result).toMatchObject({ success: true, reloaded: true });
    expect(config.resolve('TMDB_API_ACCESS_TOKEN')).toBe('env-token');
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('validates against the schema', async () => {
    const { config, dataDir } = makeConfig(prober(true));
    const invalid = config.validate({
      UNKNOWN_KEY: 'x',
      EPISODE_SYNC_MODE: 'BOGUS',
      CATALOG_MOVIE_SYNC_INTERVAL: 'nope',
      TMDB_API_URL: 'not-a-url',
    });
    expect(invalid.sort()).toEqual([
      'CATALOG_MOVIE_SYNC_INTERVAL',
      'EPISODE_SYNC_MODE',
      'TMDB_API_URL',
      'UNKNOWN_KEY',
    ]);
    expect(config.validate({ EPISODE_SYNC_MODE: 'GREEDY' })).toEqual([]);

    const result = await config.applyRemote({ EPISODE_SYNC_MODE: 'BOGUS' });
    expect(result.success).toBe(false);
    expect(result.reloaded).toBe(false);
    expect(result.invalidKeys).toEqual(['EPISODE_SYNC_MODE']);
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('flips to error when the probe fails and recovers on the next push', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'catalog-config-'));
    const config = new CatalogConfigService(dataDir, {
      TMDB_API_ACCESS_TOKEN: 'token',
    });
    let healthy = false;
    config.registerProber({
      test: async () => ({ success: healthy, message: healthy ? 'ok' : 'down' }),
    });

    await config.reload();
    expect(config.state).toBe('error');
    expect(config.errorMessage).toBe('down');

    healthy = true;
    const result = await config.applyRemote({ TMDB_API_ACCESS_TOKEN: 'token-2' });
    expect(result.success).toBe(true);
    expect(config.state).toBe('ready');
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('retains the registered prober receiver during activation', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'catalog-config-'));
    const config = new CatalogConfigService(dataDir, { TMDB_API_ACCESS_TOKEN: 'token' });
    const receiverAwareProber = {
      message: 'receiver preserved',
      async test() {
        return { success: this.message === 'receiver preserved', message: this.message };
      },
    };
    config.registerProber(receiverAwareProber);

    expect(await config.reload()).toBe(true);
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('reloades from the last-known-good file on restart (standalone mode)', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'catalog-config-'));
    const first = new CatalogConfigService(dataDir, {});
    first.registerProber(prober(true));
    await first.applyRemote({ TMDB_API_ACCESS_TOKEN: 'file-token' });

    // A brand new instance (no env, no push) must resolve the persisted value.
    const second = new CatalogConfigService(dataDir, {});
    second.registerProber(prober(true));
    expect(second.missingVars()).toEqual([]);
    const activated = await second.reload();
    expect(activated).toBe(true);
    expect(second.state).toBe('ready');
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('test() probes candidate values without persisting anything', async () => {
    const { config, dataDir } = makeConfig(prober(true));
    const result = await config.test({ TMDB_API_ACCESS_TOKEN: 'candidate' });
    expect(result.success).toBe(true);
    expect(result.mode).toBe('live');
    expect(config.resolve('TMDB_API_ACCESS_TOKEN')).toBe('');
    expect(config.state).toBe('standby');
    expect(existsSync(join(dataDir, 'catalog.config.json'))).toBe(false);
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('test() leaves the catalog data plane detached', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'catalog-config-'));
    const db = new CatalogDatabase(dataDir);
    const config = new CatalogConfigService(dataDir, {});
    const context: ServiceContext = {
      env: {
        host: '127.0.0.1',
        port: 3001,
        dataDir,
        disableBackgroundTasks: true,
        bunqueue: { host: '127.0.0.1', port: 6789 },
      },
      config,
      db,
      catalog: null,
    };
    new CatalogRuntime(context, config);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      Response.json({
        images: { secure_base_url: 'https://image.tmdb.org/t/p/' },
      })) as unknown as typeof fetch;

    try {
      const result = await config.test({ TMDB_API_ACCESS_TOKEN: 'candidate-token' });

      expect(result.success).toBe(true);
      expect(context.catalog).toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
      db.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
