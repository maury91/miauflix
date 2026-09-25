import { describe, expect, it } from 'bun:test';

import { ListConfigService } from '../src/config/config.service';

const snapshot = (clientId = 'client-id') => ({
  TRAKT_API_URL: 'https://api.trakt.tv',
  TRAKT_CLIENT_ID: clientId,
  TRAKT_CLIENT_SECRET: 'client-secret',
  TRAKT_REDIRECT_URI: 'https://miauflix.example/callback',
});

describe('ListConfigService', () => {
  it('publishes Trakt settings in their own configuration group', () => {
    const config = new ListConfigService();

    expect(config.schema.groups.map(group => group.id)).toEqual(['TRAKT']);
    expect(config.schema.groups[0]?.variables.map(variable => variable.key)).toContain(
      'TRAKT_CLIENT_ID'
    );
  });

  it('waits for a complete backend snapshot and activates it in memory', async () => {
    const config = new ListConfigService();
    config.registerProber({
      test: async () => ({ success: true, message: 'Trakt reachable' }),
      activate: async () => ({ success: true, message: 'activated' }),
    });

    expect(config.ready).toBe(false);
    expect(config.state).toBe('standby');
    const result = await config.applyRemote(snapshot());

    expect(result.success).toBe(true);
    expect(config.ready).toBe(true);
    expect(config.resolve('TRAKT_CLIENT_ID')).toBe('client-id');
  });

  it('rejects incomplete snapshots without activating', async () => {
    const config = new ListConfigService();
    let activated = false;
    config.registerProber({
      test: async () => ({ success: true, message: 'tested' }),
      activate: async () => {
        activated = true;
        return { success: true, message: 'activated' };
      },
    });

    const result = await config.applyRemote({ TRAKT_CLIENT_ID: 'client-id' });

    expect(result.success).toBe(false);
    expect(activated).toBe(false);
    expect(config.ready).toBe(false);
  });
});
