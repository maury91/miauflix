import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

import { ListConfigService } from '../src/config/config.service';

describe('ListConfigService', () => {
  it('keeps list configuration in its prefixed shared store', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'list-config-'));
    const configFilePath = join(dataDir, 'config.json');
    const keyFilePath = join(dataDir, '.list-key');
    try {
      const config = new ListConfigService(
        dataDir,
        {},
        configFilePath,
        keyFilePath,
        'https://api.trakt.tv'
      );
      config.registerProber({
        test: async () => ({ success: true, message: 'tested' }),
        activate: async () => ({ success: true, message: 'activated' }),
      });

      const result = await config.applyRemote({
        TRAKT_CLIENT_ID: 'client-id',
        TRAKT_CLIENT_SECRET: 'client-secret',
        TRAKT_REDIRECT_URI: 'https://miauflix.example/callback',
      });

      expect(result.success).toBe(true);
      expect(config.ready).toBe(true);
      expect(config.resolve('TRAKT_CLIENT_ID')).toBe('client-id');
      expect(readFileSync(configFilePath, 'utf8')).toContain('LIST__TRAKT_CLIENT_SECRET');
      expect(readFileSync(configFilePath, 'utf8')).not.toContain('client-secret');
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
