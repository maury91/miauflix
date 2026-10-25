import { ConfigStore } from '@miauflix/service-contracts';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

import { ConfigurationService } from './configuration.service';

const clearEnvironmentVariable = jest.requireActual('../../../test-utils/environment')
  .clearEnvironmentVariable as (name: string) => () => void;

const GENERATED_SECRETS = [
  'JWT_SECRET',
  'STREAM_TOKEN_SECRET',
  'STREAM_KEY_SALT',
  'SOURCE_SECURITY_KEY',
] as const;

const restoreEnvironment: Array<() => void> = [];
let dataDir: string;

beforeEach(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'miauflix-config-secrets-'));
  for (const name of [...GENERATED_SECRETS, 'DATA_DIR', 'OPENSUBTITLES_API_KEY']) {
    restoreEnvironment.push(clearEnvironmentVariable(name));
  }
  process.env.DATA_DIR = dataDir;
});

afterEach(() => {
  while (restoreEnvironment.length > 0) restoreEnvironment.pop()!();
  rmSync(dataDir, { recursive: true, force: true });
});

const setupTest = async () => {
  const configuration = new ConfigurationService();
  await configuration.init();
  return configuration;
};

const readSecrets = (configuration: ConfigurationService) =>
  Object.fromEntries(GENERATED_SECRETS.map(name => [name, configuration.get(name)]));

const readConfigFile = (): Record<string, string> =>
  JSON.parse(readFileSync(path.join(dataDir, 'config.json'), 'utf8'));

describe('ConfigurationService generated secrets', () => {
  it('keeps the same generated secrets across two init() runs on the same data dir', async () => {
    const first = readSecrets(await setupTest());
    const second = readSecrets(await setupTest());

    for (const name of GENERATED_SECRETS) expect(first[name]).toBeTruthy();
    expect(second).toEqual(first);
    expect(readConfigFile()).toMatchObject(first);
  });

  it('generates different secrets for a fresh data dir', async () => {
    const first = readSecrets(await setupTest());
    rmSync(path.join(dataDir, 'config.json'));
    const second = readSecrets(await setupTest());

    for (const name of GENERATED_SECRETS) expect(second[name]).not.toBe(first[name]);
  });

  it('adds generated secrets to an existing config.json without touching other values', async () => {
    writeFileSync(
      path.join(dataDir, 'config.json'),
      JSON.stringify({ TMDB_API_ACCESS_TOKEN: 'tmdb-token' })
    );

    const secrets = readSecrets(await setupTest());

    expect(readConfigFile()).toEqual({ TMDB_API_ACCESS_TOKEN: 'tmdb-token', ...secrets });
  });

  it('decrypts values encrypted on a previous boot with the persisted SOURCE_SECURITY_KEY', async () => {
    const first = await setupTest();
    await first.setValue('OPENSUBTITLES_API_KEY', 'opensubtitles-key');
    expect(readConfigFile().OPENSUBTITLES_API_KEY).toMatch(/^enc:/);

    const second = await setupTest();

    expect(second.get('OPENSUBTITLES_API_KEY')).toBe('opensubtitles-key');
  });

  it('lets an explicit environment variable win over a persisted secret', async () => {
    const persisted = readSecrets(await setupTest());
    process.env.JWT_SECRET = 'jwt-from-environment';
    process.env.SOURCE_SECURITY_KEY = Buffer.alloc(32, 7).toString('base64');

    const configuration = await setupTest();

    expect(configuration.get('JWT_SECRET')).toBe('jwt-from-environment');
    expect(configuration.get('SOURCE_SECURITY_KEY')).toBe(process.env.SOURCE_SECURITY_KEY);
    expect(configuration.get('STREAM_KEY_SALT')).toBe(persisted.STREAM_KEY_SALT);
    // The persisted value is kept for when the environment variable is removed
    expect(readConfigFile().JWT_SECRET).toBe(persisted.JWT_SECRET);
  });

  it('keeps the bootstrap-time environment precedence if process.env changes during init()', async () => {
    const persisted = readSecrets(await setupTest());
    process.env.JWT_SECRET = 'jwt-from-environment';
    const originalReadAllSync = ConfigStore.prototype.readAllSync;
    const readAllSync = jest
      .spyOn(ConfigStore.prototype, 'readAllSync')
      .mockImplementation(function (this: ConfigStore) {
        delete process.env.JWT_SECRET;
        return originalReadAllSync.call(this);
      });

    try {
      const configuration = await setupTest();

      expect(configuration.get('JWT_SECRET')).toBe('jwt-from-environment');
      expect(readConfigFile().JWT_SECRET).toBe(persisted.JWT_SECRET);
    } finally {
      readAllSync.mockRestore();
    }
  });

  it('does not persist secrets provided through the environment', async () => {
    process.env.JWT_SECRET = 'jwt-from-environment';

    await setupTest();

    expect(readConfigFile().JWT_SECRET).toBeUndefined();
  });
});
