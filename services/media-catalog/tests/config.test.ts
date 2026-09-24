import type { ConfigurationProbe } from '@miauflix/service-configuration';
import { describe, expect, it } from 'bun:test';

import { CatalogConfigService } from '../src/config/config.service';

const prober = (healthy = true): ConfigurationProbe => ({
  test: async () => ({ success: healthy, message: healthy ? 'provider ready' : 'probe failed' }),
  activate: async () => ({
    success: healthy,
    message: healthy ? 'provider ready' : 'probe failed',
  }),
});

const snapshot = (token = 'provider-token') => ({
  TMDB_API_URL: 'https://api.themoviedb.org/3',
  TMDB_API_ACCESS_TOKEN: token,
  EPISODE_SYNC_MODE: 'ON_DEMAND',
  CATALOG_HYDRATION_TTL_MS: '86400000',
});

describe('CatalogConfigService', () => {
  it('publishes distinct TMDB and catalog runtime groups', () => {
    const config = new CatalogConfigService();

    expect(config.getSchema().groups.map(group => group.id)).toEqual(['TMDB', 'CATALOG_RUNTIME']);
    expect(config.getSchema().groups[0]?.variables.map(variable => variable.key)).toContain(
      'TMDB_API_ACCESS_TOKEN'
    );
  });

  it('stays in standby until the backend pushes its complete snapshot', () => {
    const config = new CatalogConfigService();

    expect(config.state).toBe('standby');
    expect(config.resolve('TMDB_API_ACCESS_TOKEN')).toBe('');
    expect(config.missingVars()).toEqual(['TMDB_API_ACCESS_TOKEN']);
  });

  it('tests without activating, then activates a complete backend snapshot in memory', async () => {
    const config = new CatalogConfigService();
    config.registerProber(prober());

    const tested = await config.test(snapshot());
    expect(tested.success).toBe(true);
    expect(config.resolve('TMDB_API_ACCESS_TOKEN')).toBe('');
    expect(config.state).toBe('standby');

    const applied = await config.applyRemote(snapshot());
    expect(applied).toMatchObject({ success: true, activated: true });
    expect(config.resolve('TMDB_API_ACCESS_TOKEN')).toBe('provider-token');
    expect(config.ready).toBe(true);
  });

  it('rejects incomplete or invalid snapshots before provider activation', async () => {
    const config = new CatalogConfigService();
    let calls = 0;
    const activate = async () => {
      calls += 1;
      return { success: true, message: 'activated' };
    };
    config.registerProber({ test: activate, activate });

    const missing = await config.applyRemote({ TMDB_API_URL: 'https://api.themoviedb.org/3' });
    const invalid = await config.applyRemote({ ...snapshot(), EPISODE_SYNC_MODE: 'BOGUS' });

    expect(missing.success).toBe(false);
    expect(invalid.success).toBe(false);
    expect(calls).toBe(0);
    expect(config.state).toBe('standby');
  });

  it('keeps the previous active snapshot when activation rejects a candidate', async () => {
    const config = new CatalogConfigService();
    let activeToken = '';
    config.registerProber({
      test: async () => ({ success: true, message: 'tested' }),
      activate: async values => {
        if (values.TMDB_API_ACCESS_TOKEN === 'bad-token')
          return { success: false, message: 'candidate rejected' };
        activeToken = values.TMDB_API_ACCESS_TOKEN;
        return { success: true, message: 'provider ready' };
      },
    });

    await config.applyRemote(snapshot('known-good-token'));
    const rejected = await config.applyRemote(snapshot('bad-token'));

    expect(rejected.success).toBe(false);
    expect(config.resolve('TMDB_API_ACCESS_TOKEN')).toBe('known-good-token');
    expect(activeToken).toBe('known-good-token');
    expect(config.state).toBe('ready');
  });
});
