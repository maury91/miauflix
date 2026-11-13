import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

import { transforms, variable } from '@utils/config';

import { ConfigurationStore, transformWithFallback } from './configuration.store';
import type { ExtendedVariableInfo, VariableName } from './configuration.types';

const clearEnvironmentVariable = jest.requireActual('../../../test-utils/environment')
  .clearEnvironmentVariable as (name: string) => () => void;

const PORT = 'PORT' as VariableName;
const TOKEN = 'OPENSUBTITLES_API_KEY' as VariableName;

const variablesInfo = new Map<VariableName, ExtendedVariableInfo>([
  [
    PORT,
    {
      ...variable({
        description: 'port',
        required: false,
        defaultValue: '3000',
        transform: transforms.number(),
      }),
      serviceName: 'SERVER',
    },
  ],
  [
    TOKEN,
    {
      ...variable({ description: 'token', required: false, password: true }),
      serviceName: 'SUBTITLES',
    },
  ],
]);

describe('transformWithFallback', () => {
  const info = variablesInfo.get(PORT)!;

  it('returns the transformed value when valid', () => {
    expect(transformWithFallback(PORT, info, '8080')).toEqual({ kind: 'valid', value: 8080 });
  });

  it('falls back to the transformed default when invalid', () => {
    expect(transformWithFallback(PORT, info, 'abc')).toEqual({
      kind: 'default',
      value: 3000,
      defaultRaw: '3000',
    });
  });

  it('reports empty when the default is invalid too', () => {
    const badDefault = variable({
      description: 'd',
      required: false,
      defaultValue: 'nope',
      transform: transforms.number(),
    });
    expect(transformWithFallback(PORT, badDefault, 'abc')).toEqual({ kind: 'empty' });
  });
});

describe('ConfigurationStore', () => {
  const makeStore = () => new ConfigurationStore(variablesInfo, new Set([PORT, TOKEN]));

  describe('setValue without init()', () => {
    it('updates raw and computed values without touching config.json', async () => {
      const store = makeStore();
      const save = jest.spyOn(store, 'save');

      expect(await store.setValue(PORT, '8080')).toBe(true);

      expect(store.raw.get(PORT)).toBe('8080');
      expect(store.computed[PORT as 'PORT']).toBe(8080);
      expect(save).not.toHaveBeenCalled();
    });

    it('returns false for an unchanged value and throws for an invalid one', async () => {
      const store = makeStore();
      await store.setValue(PORT, '8080');
      expect(await store.setValue(PORT, '8080')).toBe(false);
      await expect(store.setValue(PORT, 'abc')).rejects.toThrow('Invalid value for PORT');
      expect(store.raw.get(PORT)).toBe('8080');
    });
  });

  it('restores an earlier snapshot', () => {
    const store = makeStore();
    store.raw.set(PORT, '1');
    const snapshot = store.snapshot();
    store.raw.set(PORT, '2');
    store.restore(snapshot);
    expect(store.raw.get(PORT)).toBe('1');
  });

  it('shows draft values only inside withReadView', async () => {
    const store = makeStore();
    store.raw.set(PORT, '1');
    const draft = new Map([[PORT, '2']]);

    const seen = await store.withReadView(draft, { PORT: 2 } as never, async () => [
      store.readRaw().get(PORT),
      store.readComputed()[PORT as 'PORT'],
    ]);

    expect(seen).toEqual(['2', 2]);
    expect(store.readRaw().get(PORT)).toBe('1');
  });

  describe('after init()', () => {
    const restoreEnvironment: Array<() => void> = [];
    let dataDir: string;

    beforeEach(() => {
      dataDir = mkdtempSync(path.join(tmpdir(), 'miauflix-config-store-'));
      for (const name of ['DATA_DIR', 'SOURCE_SECURITY_KEY', 'PORT', 'OPENSUBTITLES_API_KEY'])
        restoreEnvironment.push(clearEnvironmentVariable(name));
      process.env.DATA_DIR = dataDir;
      process.env.SOURCE_SECURITY_KEY = Buffer.alloc(32, 7).toString('base64');
    });

    afterEach(() => {
      while (restoreEnvironment.length > 0) restoreEnvironment.pop()!();
      rmSync(dataDir, { recursive: true, force: true });
    });

    const readConfigFile = (): Record<string, string> =>
      JSON.parse(readFileSync(path.join(dataDir, 'config.json'), 'utf8'));

    const makeInitializedStore = async () => {
      const info = new Map(variablesInfo);
      for (const key of ['DATA_DIR', 'SOURCE_SECURITY_KEY'] as VariableName[])
        info.set(key, {
          ...variable({ description: key, required: false }),
          serviceName: 'SERVER',
        });
      const store = new ConfigurationStore(info, new Set([PORT, TOKEN]));
      store.autoConfigureDefaults(process.env);
      await store.init([PORT, TOKEN]);
      return store;
    };

    it('encrypts secrets in config.json and reads them back decrypted', async () => {
      const store = await makeInitializedStore();
      expect(store.isPersistent).toBe(true);
      expect(store.computed[PORT as 'PORT']).toBe(3000);

      await store.setValue(TOKEN, 'super-secret');
      await store.setValue(PORT, '8080');

      const file = readConfigFile();
      expect(file.PORT).toBe('8080');
      expect(file.OPENSUBTITLES_API_KEY).toMatch(/^enc:/);
      expect(file.OPENSUBTITLES_API_KEY).not.toContain('super-secret');

      const reloaded = await makeInitializedStore();
      expect(reloaded.raw.get(TOKEN)).toBe('super-secret');
      expect(reloaded.computed[PORT as 'PORT']).toBe(8080);
    });

    it('removes a staged key from config.json on save', async () => {
      const store = await makeInitializedStore();
      await store.setValue(PORT, '8080');
      store.removeFileValue(PORT);
      await store.save();
      expect(readConfigFile().PORT).toBeUndefined();
    });
  });
});
