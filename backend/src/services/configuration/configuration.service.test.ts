jest.mock('fs', () => ({
  mkdirSync: jest.fn(),
  readFileSync: jest.fn(),
}));

import { readFileSync } from 'fs';

import type { ConfigurableService, ServiceInstanceStatus } from '@mytypes/configuration';
import { EncryptionService } from '@services/encryption/encryption.service';

import { ConfigurationService } from './configuration.service';

const tmdbEntries = (token: string) => [
  { key: 'TMDB_API_URL', value: 'https://api.themoviedb.org/3' },
  { key: 'TMDB_API_ACCESS_TOKEN', value: token },
  { key: 'EPISODE_SYNC_MODE', value: 'ON_DEMAND' },
];

function setupLiveTmdb() {
  const configuration = new ConfigurationService();
  let status: ServiceInstanceStatus = {
    status: 'error',
    errorMessage: 'not configured',
    error: null,
  };
  const instance: ConfigurableService = {
    testable: true,
    getStatus: () => status,
    reload: jest.fn(async () => {
      const token = configuration.get('TMDB_API_ACCESS_TOKEN');
      status =
        token === 'valid-token'
          ? { status: 'ready' }
          : { status: 'error', errorMessage: 'Invalid TMDB token', error: null };
    }),
  };
  configuration.registerService('TMDB', instance);
  return { configuration, instance };
}

describe('ConfigurationService web configuration actions', () => {
  it('decrypts encrypted values when loading config.json', () => {
    const configuration = new ConfigurationService();
    const encryption = new EncryptionService(Buffer.alloc(32, 1).toString('base64'));
    const encryptedToken = encryption.encryptString('saved-tmdb-token');
    const readConfigFile = jest.mocked(readFileSync);
    readConfigFile.mockReturnValue(
      JSON.stringify({ TMDB_API_ACCESS_TOKEN: `enc:${encryptedToken}` }) as never
    );
    Reflect.set(configuration, '_filePath', '/tmp/config.json');
    Reflect.set(configuration, '_encryptionService', encryption);

    Reflect.apply(Reflect.get(configuration, 'loadConfigFile') as () => void, configuration, []);

    const rawValues = Reflect.get(configuration, '_rawValues') as Map<string, string>;
    expect(rawValues.get('TMDB_API_ACCESS_TOKEN')).toBe('saved-tmdb-token');
  });

  it('ignores an encrypted value that cannot be decrypted', () => {
    const configuration = new ConfigurationService();
    const encryption = new EncryptionService(Buffer.alloc(32, 1).toString('base64'));
    const differentEncryption = new EncryptionService(Buffer.alloc(32, 2).toString('base64'));
    const encryptedToken = differentEncryption.encryptString('saved-tmdb-token');
    const readConfigFile = jest.mocked(readFileSync);
    readConfigFile.mockReturnValue(
      JSON.stringify({ TMDB_API_ACCESS_TOKEN: `enc:${encryptedToken}` }) as never
    );
    Reflect.set(configuration, '_filePath', '/tmp/config.json');
    Reflect.set(configuration, '_encryptionService', encryption);
    const rawValues = Reflect.get(configuration, '_rawValues') as Map<string, string>;
    rawValues.set('TMDB_API_ACCESS_TOKEN', 'environment-token');

    Reflect.apply(Reflect.get(configuration, 'loadConfigFile') as () => void, configuration, []);

    expect(rawValues.get('TMDB_API_ACCESS_TOKEN')).toBe('environment-token');
  });

  it('tests values transiently and restores the previous runtime configuration', async () => {
    const { configuration, instance } = setupLiveTmdb();

    const result = await configuration.testServiceConfigs('TMDB', tmdbEntries('valid-token'));

    expect(result).toEqual({
      success: true,
      services: [expect.objectContaining({ service: 'TMDB', success: true, testMode: 'live' })],
    });
    expect(configuration.get('TMDB_API_ACCESS_TOKEN')).toBeUndefined();
    expect(instance.reload).toHaveBeenCalledTimes(2);
  });

  it('keeps successful saved values active without restoring the draft', async () => {
    const { configuration, instance } = setupLiveTmdb();

    const result = await configuration.saveServiceConfigs('TMDB', tmdbEntries('valid-token'));

    expect(result.success).toBe(true);
    expect(result.changed).toEqual(['TMDB']);
    expect(result.restarted).toEqual(['TMDB']);
    expect(result.recovered).toEqual([{ service: 'TMDB', previousStatus: 'error' }]);
    expect(configuration.get('TMDB_API_ACCESS_TOKEN')).toBe('valid-token');
    expect(instance.reload).toHaveBeenCalledTimes(1);
  });

  it('does not retain values when a live save test fails', async () => {
    const { configuration, instance } = setupLiveTmdb();

    const result = await configuration.saveServiceConfigs('TMDB', tmdbEntries('bad-token'));

    expect(result.success).toBe(false);
    expect(result.changed).toEqual([]);
    expect(configuration.get('TMDB_API_ACCESS_TOKEN')).toBeUndefined();
    expect(instance.reload).toHaveBeenCalledTimes(2);
  });

  it('reports validation-only success for services without a live test', async () => {
    const configuration = new ConfigurationService();
    const storage: ConfigurableService = {
      testable: false,
      getStatus: () => ({ status: 'ready' }),
      reload: jest.fn().mockResolvedValue(undefined),
    };
    configuration.registerService('STORAGE', storage);

    const result = await configuration.saveServiceConfigs('STORAGE', [
      { key: 'STORAGE_THRESHOLD', value: '80GB' },
    ]);

    expect(result.services[0]).toEqual(
      expect.objectContaining({ success: true, testMode: 'validation' })
    );
    expect(storage.reload).toHaveBeenCalledTimes(1);
  });

  it('rolls back every service when one global validation fails', async () => {
    const { configuration } = setupLiveTmdb();

    const result = await configuration.testAndSaveConfigs([
      ...tmdbEntries('valid-token'),
      { key: 'STORAGE_THRESHOLD', value: 'not-a-size' },
    ]);

    expect(result.success).toBe(false);
    expect(result.changed).toEqual([]);
    expect(configuration.get('TMDB_API_ACCESS_TOKEN')).toBeUndefined();
    expect(configuration.get('STORAGE_THRESHOLD')).toBeUndefined();
  });
});
