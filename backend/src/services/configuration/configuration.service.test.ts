import { SERVICE_MANIFEST_PATH, type ServiceConfigSchema } from '@miauflix/service-contracts';

import type { ConfigurableService, ServiceInstanceStatus } from '@mytypes/configuration';
import * as configurationUtils from '@services/configuration/configuration.utils';
import { RemoteServiceManager } from '@services/remote/remote-service.manager';

import { ConfigurationService } from './configuration.service';

const clearEnvironmentVariable = jest.requireActual('../../../test-utils/environment')
  .clearEnvironmentVariable as (name: string) => () => void;

const catalogEntries = (url: string) => [
  { key: 'CATALOG_SERVICE_URL', value: url },
  { key: 'CATALOG_SERVICE_TIMEOUT_MS', value: '60000' },
];

const setupTest = () => {
  clearEnvironmentVariable('DYNAMIC_OPTIONAL_STRING_DEFAULT_TEST')();
  return new ConfigurationService();
};

afterEach(() => {
  // Dynamic schema registration updates a process-wide presentation registry.
  new ConfigurationService().registerRemoteConfiguration('CATALOG', { groups: [] });
  new ConfigurationService().registerRemoteConfiguration('LIST', { groups: [] });
});

function setupLiveCatalog() {
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
      const url = configuration.get('CATALOG_SERVICE_URL');
      status =
        url === 'http://catalog:3001'
          ? { status: 'ready' }
          : { status: 'error', errorMessage: 'Catalog is unreachable', error: null };
    }),
  };
  configuration.registerService('CATALOG', instance);
  return { configuration, instance };
}

const registerCatalogProvider = (
  configuration: ConfigurationService,
  testConfiguration: ConfigurableService['testConfiguration'],
  applyConfiguration = jest.fn().mockResolvedValue({ success: true })
) => {
  configuration.registerRemoteConfiguration('CATALOG', {
    groups: [
      {
        id: 'CATALOG_PROVIDER_ISOLATION_TEST',
        name: 'Catalog provider',
        description: 'Catalog provider settings',
        variables: [
          {
            key: 'DYNAMIC_CATALOG_ISOLATION_TOKEN_TEST',
            description: 'Provider token',
            required: true,
            inputType: 'text',
          },
        ],
      },
    ],
  });
  configuration.registerService('CATALOG', {
    testable: true,
    getStatus: () => ({ status: 'ready' }),
    reload: jest.fn().mockResolvedValue(undefined),
    testConfiguration,
    applyConfiguration,
  });
};

describe('ConfigurationService web configuration actions', () => {
  it('registers discovered canonical keys and builds complete remote snapshots', () => {
    const configuration = setupTest();

    const schema: ServiceConfigSchema = {
      groups: [
        {
          id: 'DYNAMIC_TEST_GROUP',
          name: 'Dynamic test',
          description: 'Test settings',
          variables: [
            {
              key: 'DYNAMIC_OPTIONAL_STRING_DEFAULT_TEST',
              description: 'Optional dynamic string',
              required: false,
              inputType: 'text',
              defaultValue: 'dynamic-default',
            },
          ],
        },
      ],
    };
    configuration.registerRemoteConfiguration('CATALOG', schema);

    expect(configuration.getDynamic('DYNAMIC_OPTIONAL_STRING_DEFAULT_TEST')).toBe(
      'dynamic-default'
    );
    expect(configuration.getServiceConfigSnapshot('CATALOG')).toEqual({
      DYNAMIC_OPTIONAL_STRING_DEFAULT_TEST: 'dynamic-default',
    });
  });

  it('seeds remote values through defaults without persisting remote generated defaults', async () => {
    const keys = [
      'DYNAMIC_REMOTE_STORED_TEST',
      'DYNAMIC_REMOTE_ENV_TEST',
      'DYNAMIC_REMOTE_DEFAULT_TEST',
      'DYNAMIC_REMOTE_GENERATED_TEST',
    ];
    const clearKeys = keys.map(clearEnvironmentVariable);
    for (const clear of clearKeys) clear();
    process.env.DYNAMIC_REMOTE_ENV_TEST = 'environment-value';
    const saveDefaults = jest.spyOn(configurationUtils, 'saveToEnvFile');
    const configuration = setupTest();
    await configuration.setValue('DYNAMIC_REMOTE_STORED_TEST' as never, 'stored-value');

    configuration.registerRemoteConfiguration('CATALOG', {
      groups: [
        {
          id: 'REMOTE_SEED_TEST',
          name: 'Remote seed test',
          description: 'Remote defaults',
          variables: [
            {
              key: 'DYNAMIC_REMOTE_STORED_TEST',
              description: 'Stored value',
              required: false,
              inputType: 'text',
              defaultValue: 'ignored-default',
            },
            {
              key: 'DYNAMIC_REMOTE_ENV_TEST',
              description: 'Environment value',
              required: false,
              inputType: 'text',
              defaultValue: 'ignored-default',
            },
            {
              key: 'DYNAMIC_REMOTE_DEFAULT_TEST',
              description: 'Schema default',
              required: false,
              inputType: 'text',
              defaultValue: 'schema-default',
            },
            {
              key: 'DYNAMIC_REMOTE_GENERATED_TEST',
              description: 'Generated secret',
              required: true,
              inputType: 'password',
              secret: true,
              skipUserInteraction: true,
              defaultValue: 'generated-secret',
            },
          ],
        },
      ],
    });

    expect(configuration.getServiceConfigSnapshot('CATALOG')).toEqual({
      DYNAMIC_REMOTE_STORED_TEST: 'stored-value',
      DYNAMIC_REMOTE_ENV_TEST: 'environment-value',
      DYNAMIC_REMOTE_DEFAULT_TEST: 'schema-default',
      DYNAMIC_REMOTE_GENERATED_TEST: 'generated-secret',
    });
    expect(saveDefaults).not.toHaveBeenCalled();
    saveDefaults.mockRestore();
    for (const clear of clearKeys) clear();
  });

  it('falls back from invalid seeded remote values without losing discovery', () => {
    const restoreDefault = clearEnvironmentVariable('DYNAMIC_INVALID_DEFAULT_TEST');
    const restoreRequired = clearEnvironmentVariable('DYNAMIC_INVALID_REQUIRED_TEST');
    process.env.DYNAMIC_INVALID_DEFAULT_TEST = 'INVALID';
    process.env.DYNAMIC_INVALID_REQUIRED_TEST = 'INVALID';
    try {
      const configuration = setupTest();
      expect(() =>
        configuration.registerRemoteConfiguration('CATALOG', {
          groups: [
            {
              id: 'DYNAMIC_INVALID_GROUP',
              name: 'Invalid seed test',
              description: 'Invalid seed test',
              variables: [
                {
                  key: 'DYNAMIC_INVALID_DEFAULT_TEST',
                  description: 'With default',
                  required: true,
                  inputType: 'select',
                  options: { VALID: 'Valid' },
                  defaultValue: 'VALID',
                },
                {
                  key: 'DYNAMIC_INVALID_REQUIRED_TEST',
                  description: 'Without default',
                  required: true,
                  inputType: 'select',
                  options: { VALID: 'Valid' },
                },
              ],
            },
          ],
        })
      ).not.toThrow();
      expect(configuration.getDynamic('DYNAMIC_INVALID_DEFAULT_TEST')).toBe('VALID');
      expect(configuration.getServiceConfigSnapshot('CATALOG')).toBeUndefined();
    } finally {
      restoreDefault();
      restoreRequired();
    }
  });

  it('removes omitted group variables from presentation on rediscovery without discarding stored values', async () => {
    const configuration = setupTest();

    configuration.registerRemoteConfiguration('CATALOG', {
      groups: [
        {
          id: 'DYNAMIC_TEST_GROUP',
          name: 'Dynamic test',
          description: 'Test settings',
          variables: [
            {
              key: 'DYNAMIC_RETAINED_TEST',
              description: 'Retained',
              required: false,
              inputType: 'text',
              defaultValue: 'yes',
            },
            {
              key: 'DYNAMIC_REMOVED_TEST',
              description: 'Removed',
              required: false,
              inputType: 'text',
              defaultValue: 'no',
            },
          ],
        },
      ],
    });
    configuration.registerRemoteConfiguration('CATALOG', {
      groups: [
        {
          id: 'DYNAMIC_TEST_GROUP',
          name: 'Dynamic test',
          description: 'Test settings',
          variables: [
            {
              key: 'DYNAMIC_RETAINED_TEST',
              description: 'Retained',
              required: false,
              inputType: 'text',
              defaultValue: 'yes',
            },
          ],
        },
      ],
    });

    const entries = await configuration.getAllConfigs();
    expect(entries.some(entry => entry.key === 'DYNAMIC_RETAINED_TEST')).toBe(true);
    expect(entries.some(entry => entry.key === 'DYNAMIC_REMOVED_TEST')).toBe(false);
    expect(configuration.getServiceConfigSnapshot('CATALOG')).toEqual({
      DYNAMIC_RETAINED_TEST: 'yes',
    });
  });

  it('tests and applies one canonical Trakt snapshot to every declared consumer', async () => {
    const configuration = setupTest();
    const schema: ServiceConfigSchema = {
      groups: [
        {
          id: 'TRAKT',
          name: 'Trakt',
          description: 'Shared Trakt application settings.',
          variables: [
            { key: 'TRAKT_CLIENT_ID', description: 'Client ID', required: true, inputType: 'text' },
            {
              key: 'TRAKT_CLIENT_SECRET',
              description: 'Client secret',
              required: true,
              inputType: 'password',
              secret: true,
            },
          ],
        },
      ],
    };
    configuration.registerRemoteConfiguration('CATALOG', schema);
    configuration.registerRemoteConfiguration('LIST', schema);
    await configuration.setValue('TRAKT_CLIENT_SECRET' as never, 'saved-secret');
    expect(configuration.getMissingVarsForGroup('CATALOG')).toEqual(['TRAKT_CLIENT_ID']);

    const testedSnapshots: Record<string, string>[] = [];
    const appliedSnapshots: Record<string, string>[] = [];
    for (const service of ['CATALOG', 'LIST'] as const) {
      configuration.registerService(service, {
        testable: true,
        getStatus: () => ({ status: 'ready' }),
        reload: jest.fn().mockResolvedValue(undefined),
        testConfiguration: jest.fn(async entries => {
          testedSnapshots.push(
            Object.fromEntries((entries ?? []).map(({ key, value }) => [key, value]))
          );
          return { success: true, message: 'validated' };
        }),
        applyConfiguration: jest.fn(async entries => {
          appliedSnapshots.push(Object.fromEntries(entries.map(({ key, value }) => [key, value])));
          return { success: true };
        }),
      });
    }

    const test = await configuration.testServiceConfigs('TRAKT', [
      { key: 'TRAKT_CLIENT_ID', value: 'new-client-id' },
    ]);
    expect(test.success).toBe(true);
    expect(testedSnapshots).toEqual([
      { TRAKT_CLIENT_ID: 'new-client-id', TRAKT_CLIENT_SECRET: 'saved-secret' },
      { TRAKT_CLIENT_ID: 'new-client-id', TRAKT_CLIENT_SECRET: 'saved-secret' },
    ]);
    expect(appliedSnapshots).toEqual([]);
    expect(
      (await configuration.getAllConfigs()).find(entry => entry.key === 'TRAKT_CLIENT_SECRET')
    ).toMatchObject({
      isSecret: true,
      hasValue: true,
      value: expect.not.stringContaining('saved-secret'),
    });

    const saved = await configuration.saveServiceConfigs('TRAKT', [
      { key: 'TRAKT_CLIENT_ID', value: 'new-client-id' },
    ]);
    expect(saved.success).toBe(true);
    expect(saved.restarted).toEqual(['CATALOG', 'LIST']);
    expect(appliedSnapshots).toEqual([
      { TRAKT_CLIENT_ID: 'new-client-id', TRAKT_CLIENT_SECRET: 'saved-secret' },
      { TRAKT_CLIENT_ID: 'new-client-id', TRAKT_CLIENT_SECRET: 'saved-secret' },
    ]);
  });

  it('tests a draft remote endpoint with its stored provider snapshot without saving either draft', async () => {
    const configuration = setupTest();
    await configuration.setValue('CATALOG_SERVICE_URL', 'http://catalog-original:3001');
    await configuration.setValue('CATALOG_SERVICE_TIMEOUT_MS', '1000');
    await configuration.setValue('DYNAMIC_CATALOG_TOKEN_TEST' as never, 'stored-provider-token');
    const testRequests: Array<{ url: string; body: unknown }> = [];
    jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname === SERVICE_MANIFEST_PATH) {
        return Response.json({
          id: 'media-catalog',
          name: 'Media Catalog',
          description: 'Catalog',
          version: '1.0.0',
          managementProtocolVersion: 2,
          capabilities: { catalog: { version: 1, basePath: '/v1/catalog' } },
          management: {
            statusPath: '/status',
            configurationSchemaPath: '/configuration/schema',
            configurationTestPath: '/configuration/test',
            configurationApplyPath: '/configuration',
          },
        });
      }
      if (url.pathname === '/configuration/schema') {
        return Response.json({
          groups: [
            {
              id: 'TMDB',
              name: 'TMDB',
              description: 'Provider',
              variables: [
                {
                  key: 'DYNAMIC_CATALOG_TOKEN_TEST',
                  description: 'Provider token',
                  required: true,
                  inputType: 'password',
                  secret: true,
                },
              ],
            },
          ],
        });
      }
      if (url.pathname === '/configuration')
        return Response.json({ success: true, activated: true });
      if (url.pathname === '/status') return Response.json({ state: 'ready' });
      if (url.pathname === '/configuration/test') {
        testRequests.push({ url: url.origin, body: JSON.parse(String(init?.body)) });
        return Response.json({ success: true, mode: 'live', message: 'provider valid' });
      }
      throw new Error(`Unexpected request ${url.pathname}`);
    });

    const manager = new RemoteServiceManager(configuration, {
      serviceName: 'CATALOG',
      urlKey: 'CATALOG_SERVICE_URL',
      timeoutKey: 'CATALOG_SERVICE_TIMEOUT_MS',
      capability: 'catalog',
      capabilityVersion: 1,
    });
    configuration.registerService('CATALOG', manager);
    await manager.initialize();
    const result = await configuration.testServiceConfigs('CATALOG', [
      { key: 'CATALOG_SERVICE_URL', value: 'http://catalog-candidate:3001' },
      { key: 'CATALOG_SERVICE_TIMEOUT_MS', value: '2000' },
    ]);
    manager.stop();

    expect(result.success).toBe(true);
    expect(testRequests).toEqual([
      {
        url: 'http://catalog-candidate:3001',
        body: { values: { DYNAMIC_CATALOG_TOKEN_TEST: 'stored-provider-token' } },
      },
    ]);
    expect(configuration.get('CATALOG_SERVICE_URL')).toBe('http://catalog-original:3001');
    expect(configuration.get('CATALOG_SERVICE_TIMEOUT_MS')).toBe(1000);
    expect(configuration.getDynamic('DYNAMIC_CATALOG_TOKEN_TEST')).toBe('stored-provider-token');
  });

  it('rejects a conflicting duplicate key instead of replacing the first declaration', async () => {
    const configuration = setupTest();
    configuration.registerRemoteConfiguration('CATALOG', {
      groups: [
        {
          id: 'TRAKT',
          name: 'Trakt',
          description: 'Shared Trakt settings.',
          variables: [
            {
              key: 'TRAKT_CLIENT_ID',
              description: 'Client ID',
              required: true,
              inputType: 'select',
              options: { APP: 'First application' },
            },
          ],
        },
      ],
    });

    expect(() =>
      configuration.registerRemoteConfiguration('LIST', {
        groups: [
          {
            id: 'TRAKT',
            name: 'Trakt',
            description: 'Shared Trakt settings.',
            variables: [
              {
                key: 'TRAKT_CLIENT_ID',
                description: 'Client ID',
                required: true,
                inputType: 'select',
                options: { APP: 'Different application' },
              },
            ],
          },
        ],
      })
    ).toThrow("Configuration key 'TRAKT_CLIENT_ID' has conflicting declarations");

    const clientId = (await configuration.getAllConfigs()).find(
      entry => entry.key === 'TRAKT_CLIENT_ID'
    );
    expect(clientId?.description).toBe('Client ID');
  });

  it('returns already-applied consumers to standby when a first save cannot activate every consumer', async () => {
    const configuration = setupTest();
    configuration.registerRemoteConfiguration('CATALOG', {
      groups: [
        {
          id: 'TRAKT',
          name: 'Trakt',
          description: 'Shared Trakt settings.',
          variables: [
            { key: 'TRAKT_CLIENT_ID', description: 'Client ID', required: true, inputType: 'text' },
          ],
        },
      ],
    });
    configuration.registerRemoteConfiguration('LIST', {
      groups: [
        {
          id: 'TRAKT',
          name: 'Trakt',
          description: 'Shared Trakt settings.',
          variables: [
            { key: 'TRAKT_CLIENT_ID', description: 'Client ID', required: true, inputType: 'text' },
          ],
        },
      ],
    });
    const clearConfiguration = jest.fn().mockResolvedValue({ success: true });
    for (const service of ['CATALOG', 'LIST'] as const) {
      configuration.registerService(service, {
        testable: true,
        getStatus: () => ({ status: 'ready' }),
        reload: jest.fn().mockResolvedValue(undefined),
        testConfiguration: jest.fn().mockResolvedValue({ success: true, message: 'validated' }),
        applyConfiguration: jest
          .fn()
          .mockResolvedValue(
            service === 'LIST'
              ? { success: false, message: 'activation failed' }
              : { success: true }
          ),
        clearConfiguration,
      });
    }

    const result = await configuration.saveServiceConfigs('TRAKT', [
      { key: 'TRAKT_CLIENT_ID', value: 'first-client' },
    ]);

    expect(result.success).toBe(false);
    expect(result.services.find(item => item.service === 'LIST')).toMatchObject({
      success: false,
      message: 'activation failed',
    });
    expect(clearConfiguration).toHaveBeenCalledTimes(2);
    expect(configuration.getDynamic('TRAKT_CLIENT_ID')).toBeUndefined();
  });

  it('tests values transiently and restores the previous runtime configuration', async () => {
    const { configuration, instance } = setupLiveCatalog();

    const result = await configuration.testServiceConfigs(
      'CATALOG',
      catalogEntries('http://catalog:3001')
    );

    expect(result).toEqual({
      success: true,
      services: [expect.objectContaining({ service: 'CATALOG', success: true, testMode: 'live' })],
    });
    expect(configuration.get('CATALOG_SERVICE_URL')).toBeUndefined();
    expect(instance.reload).toHaveBeenCalledTimes(2);
  });

  it('uses an observational configuration test when the service provides one', async () => {
    const configuration = new ConfigurationService();
    const testConfiguration = jest.fn().mockResolvedValue({
      success: true,
      message: 'Catalog provider is reachable',
    });
    const instance: ConfigurableService & { testConfiguration: typeof testConfiguration } = {
      testable: true,
      getStatus: () => ({ status: 'error', errorMessage: 'not configured', error: null }),
      reload: jest.fn().mockResolvedValue(undefined),
      testConfiguration,
    };
    configuration.registerService('CATALOG', instance);

    const result = await configuration.testServiceConfigs(
      'CATALOG',
      catalogEntries('http://catalog:3001')
    );

    expect(result).toEqual({
      success: true,
      services: [
        expect.objectContaining({
          service: 'CATALOG',
          success: true,
          testMode: 'live',
          message: 'Catalog provider is reachable',
        }),
      ],
    });
    expect(testConfiguration).toHaveBeenCalledTimes(1);
    expect(instance.reload).not.toHaveBeenCalled();
  });

  it('observationally tests CATALOG and LIST draft endpoints with stored provider snapshots', async () => {
    const configuration = setupTest();
    await configuration.setValue('CATALOG_SERVICE_URL', 'http://catalog-original:3001');
    await configuration.setValue('CATALOG_SERVICE_TIMEOUT_MS', '1000');
    await configuration.setValue('LIST_SERVICE_URL', 'http://list-original:3002');
    await configuration.setValue('LIST_SERVICE_TIMEOUT_MS', '1000');
    for (const [service, group, key, value] of [
      ['CATALOG', 'CATALOG_PROVIDER_TEST', 'CATALOG_PROVIDER_TOKEN_TEST', 'catalog-token'],
      ['LIST', 'LIST_PROVIDER_TEST', 'LIST_PROVIDER_TOKEN_TEST', 'list-token'],
    ] as const) {
      configuration.registerRemoteConfiguration(service, {
        groups: [
          {
            id: group,
            name: group,
            description: group,
            variables: [{ key, description: key, required: true, inputType: 'text' }],
          },
        ],
      });
      await configuration.setValue(key as never, value);
    }
    const tested: Array<{ endpoint: unknown; snapshot: Record<string, string> | undefined }> = [];
    for (const service of ['CATALOG', 'LIST'] as const) {
      configuration.registerService(service, {
        testable: true,
        getStatus: () => ({ status: 'ready' }),
        reload: jest.fn().mockResolvedValue(undefined),
        testConfiguration: jest.fn(async () => {
          tested.push({
            endpoint: configuration.get(`${service}_SERVICE_URL` as never),
            snapshot: configuration.getServiceConfigSnapshot(service),
          });
          return { success: true, message: 'provider valid' };
        }),
      });
    }

    const catalogTest = await configuration.testServiceConfigs('CATALOG', [
      { key: 'CATALOG_SERVICE_URL', value: 'http://catalog-draft:3001' },
      { key: 'CATALOG_SERVICE_TIMEOUT_MS', value: '2000' },
    ]);
    const listTest = await configuration.testServiceConfigs('LIST', [
      { key: 'LIST_SERVICE_URL', value: 'http://list-draft:3002' },
      { key: 'LIST_SERVICE_TIMEOUT_MS', value: '3000' },
    ]);

    expect(catalogTest.success).toBe(true);
    expect(listTest.success).toBe(true);
    expect(tested).toEqual([
      {
        endpoint: 'http://catalog-draft:3001',
        snapshot: { CATALOG_PROVIDER_TOKEN_TEST: 'catalog-token' },
      },
      {
        endpoint: 'http://list-draft:3002',
        snapshot: { LIST_PROVIDER_TOKEN_TEST: 'list-token' },
      },
    ]);
    expect(configuration.get('CATALOG_SERVICE_URL')).toBe('http://catalog-original:3001');
    expect(configuration.get('LIST_SERVICE_URL')).toBe('http://list-original:3002');
  });

  it('keeps successful saved values active without restoring the draft', async () => {
    const { configuration, instance } = setupLiveCatalog();
    const changed = jest.fn();
    configuration.subscribeChanges(changed);

    const result = await configuration.saveServiceConfigs(
      'CATALOG',
      catalogEntries('http://catalog:3001')
    );

    expect(result.success).toBe(true);
    expect(result.changed).toEqual(['CATALOG']);
    expect(result.restarted).toEqual(['CATALOG']);
    expect(result.recovered).toEqual([{ service: 'CATALOG', previousStatus: 'error' }]);
    expect(configuration.get('CATALOG_SERVICE_URL')).toBe('http://catalog:3001');
    expect(instance.reload).toHaveBeenCalledTimes(1);
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('notifies subscribers after a direct successful service restart', async () => {
    const configuration = new ConfigurationService();
    const instance: ConfigurableService = {
      testable: true,
      getStatus: () => ({ status: 'ready' }),
      reload: jest.fn().mockResolvedValue(undefined),
    };
    const changed = jest.fn();
    configuration.registerService('CATALOG', instance);
    configuration.subscribeChanges(changed);

    await expect(configuration.restartService('CATALOG')).resolves.toBeNull();

    expect(instance.reload).toHaveBeenCalledTimes(1);
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('does not retain values when a live save test fails', async () => {
    const { configuration, instance } = setupLiveCatalog();

    const result = await configuration.saveServiceConfigs(
      'CATALOG',
      catalogEntries('http://bad:1')
    );

    expect(result.success).toBe(false);
    expect(result.changed).toEqual([]);
    expect(configuration.get('CATALOG_SERVICE_URL')).toBeUndefined();
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
    const { configuration } = setupLiveCatalog();

    const result = await configuration.testAndSaveConfigs([
      ...catalogEntries('http://catalog:3001'),
      { key: 'STORAGE_THRESHOLD', value: 'not-a-size' },
    ]);

    expect(result.success).toBe(false);
    expect(result.changed).toEqual([]);
    expect(configuration.get('CATALOG_SERVICE_URL')).toBeUndefined();
    expect(configuration.get('STORAGE_THRESHOLD')).toBeUndefined();
  });

  it('tests all groups before persisting or applying a multi-group save', async () => {
    const configuration = setupTest();
    const makeSchema = (id: string, key: string): ServiceConfigSchema => ({
      groups: [
        {
          id,
          name: id,
          description: `${id} settings`,
          variables: [{ key, description: key, required: true, inputType: 'text' }],
        },
      ],
    });
    configuration.registerRemoteConfiguration(
      'CATALOG',
      makeSchema('CATALOG_PROVIDER', 'CATALOG_TOKEN_TEST')
    );
    configuration.registerRemoteConfiguration(
      'LIST',
      makeSchema('LIST_PROVIDER', 'LIST_TOKEN_TEST')
    );
    const catalogApply = jest.fn().mockResolvedValue({ success: true });
    const listApply = jest.fn().mockResolvedValue({ success: true });
    for (const [service, apply, test] of [
      ['CATALOG', catalogApply, jest.fn().mockResolvedValue({ success: true })],
      ['LIST', listApply, jest.fn().mockResolvedValue({ success: false, message: 'rejected' })],
    ] as const) {
      configuration.registerService(service, {
        testable: true,
        getStatus: () => ({ status: 'ready' }),
        reload: jest.fn().mockResolvedValue(undefined),
        testConfiguration: test,
        applyConfiguration: apply,
      });
    }
    const saveConfigFile = jest
      .spyOn(configuration as unknown as { saveConfigFile: () => Promise<void> }, 'saveConfigFile')
      .mockResolvedValue(undefined);

    const result = await configuration.testAndSaveConfigs([
      { key: 'CATALOG_TOKEN_TEST', value: 'catalog-token' },
      { key: 'LIST_TOKEN_TEST', value: 'list-token' },
    ]);

    expect(result.success).toBe(false);
    expect(saveConfigFile).not.toHaveBeenCalled();
    expect(catalogApply).not.toHaveBeenCalled();
    expect(listApply).not.toHaveBeenCalled();
    expect(configuration.getDynamic('CATALOG_TOKEN_TEST')).toBeUndefined();
  });

  it('persists once and applies after every group probe passes', async () => {
    const configuration = setupTest();
    configuration.registerRemoteConfiguration('CATALOG', {
      groups: [
        {
          id: 'CATALOG_PROVIDER',
          name: 'Catalog provider',
          description: 'Catalog settings',
          variables: [
            { key: 'CATALOG_TOKEN_TEST', description: 'Token', required: true, inputType: 'text' },
          ],
        },
      ],
    });
    const apply = jest.fn().mockResolvedValue({ success: true });
    const test = jest.fn().mockResolvedValue({ success: true, mode: 'live', message: 'valid' });
    configuration.registerService('CATALOG', {
      testable: true,
      getStatus: () => ({ status: 'ready' }),
      reload: jest.fn().mockResolvedValue(undefined),
      testConfiguration: test,
      applyConfiguration: apply,
    });
    const saveConfigFile = jest
      .spyOn(configuration as unknown as { saveConfigFile: () => Promise<void> }, 'saveConfigFile')
      .mockResolvedValue(undefined);

    const result = await configuration.testAndSaveConfigs([
      { key: 'CATALOG_TOKEN_TEST', value: 'catalog-token' },
    ]);

    expect(result.success).toBe(true);
    expect(result.changed).toEqual(['CATALOG_PROVIDER']);
    expect(saveConfigFile).toHaveBeenCalledTimes(1);
    expect(test).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(configuration.getDynamic('CATALOG_TOKEN_TEST')).toBe('catalog-token');
  });

  it('probes remote values through the candidate service URL before saving', async () => {
    const configuration = setupTest();
    configuration.registerRemoteConfiguration('CATALOG', {
      groups: [
        {
          id: 'CATALOG_PROVIDER',
          name: 'Catalog provider',
          description: 'Settings',
          variables: [
            { key: 'CATALOG_TOKEN_TEST', description: 'Token', required: true, inputType: 'text' },
          ],
        },
      ],
    });
    const seenUrls: unknown[] = [];
    configuration.registerService('CATALOG', {
      testable: true,
      getStatus: () => ({ status: 'ready' }),
      reload: jest.fn().mockResolvedValue(undefined),
      testConfiguration: jest.fn().mockImplementation(async () => {
        seenUrls.push(configuration.get('CATALOG_SERVICE_URL'));
        return { success: true, message: 'valid' };
      }),
      applyConfiguration: jest.fn().mockResolvedValue({ success: true }),
    });
    jest
      .spyOn(configuration as unknown as { saveConfigFile: () => Promise<void> }, 'saveConfigFile')
      .mockResolvedValue(undefined);

    const result = await configuration.testAndSaveConfigs([
      { key: 'CATALOG_SERVICE_URL', value: 'http://candidate:3001' },
      { key: 'CATALOG_TOKEN_TEST', value: 'candidate-token' },
    ]);

    expect(result.success).toBe(true);
    expect(seenUrls).toEqual(['http://candidate:3001']);
  });

  it('isolates candidate reads to the probe async context', async () => {
    const configuration = setupTest();
    await configuration.setValue('CATALOG_SERVICE_URL', 'http://catalog-original:3001');
    await configuration.setValue('CATALOG_SERVICE_TIMEOUT_MS', '1000');
    await configuration.setValue(
      'DYNAMIC_CATALOG_ISOLATION_TOKEN_TEST' as never,
      'stored-provider-token'
    );
    let release!: () => void;
    let entered!: () => void;
    const probeEntered = new Promise<void>(resolve => {
      entered = resolve;
    });
    const probeGate = new Promise<void>(resolve => {
      release = resolve;
    });
    const testConfiguration = jest.fn(async () => {
      expect(configuration.get('CATALOG_SERVICE_URL')).toBe('http://catalog-candidate:3001');
      expect(configuration.getDynamic('DYNAMIC_CATALOG_ISOLATION_TOKEN_TEST')).toBe(
        'candidate-provider-token'
      );
      expect(configuration.getServiceConfigSnapshot('CATALOG')).toEqual({
        DYNAMIC_CATALOG_ISOLATION_TOKEN_TEST: 'candidate-provider-token',
      });
      entered();
      await probeGate;
      return { success: true, message: 'validated' };
    });
    registerCatalogProvider(configuration, testConfiguration);

    const save = configuration.testAndSaveConfigs([
      { key: 'CATALOG_SERVICE_URL', value: 'http://catalog-candidate:3001' },
      { key: 'CATALOG_SERVICE_TIMEOUT_MS', value: '2000' },
      { key: 'DYNAMIC_CATALOG_ISOLATION_TOKEN_TEST', value: 'candidate-provider-token' },
    ]);
    await probeEntered;

    expect(configuration.get('CATALOG_SERVICE_URL')).toBe('http://catalog-original:3001');
    expect(configuration.getDynamic('DYNAMIC_CATALOG_ISOLATION_TOKEN_TEST')).toBe(
      'stored-provider-token'
    );
    expect(configuration.getServiceConfigSnapshot('CATALOG')).toEqual({
      DYNAMIC_CATALOG_ISOLATION_TOKEN_TEST: 'stored-provider-token',
    });

    release();
    await expect(save).resolves.toMatchObject({ success: true });
    expect(configuration.get('CATALOG_SERVICE_URL')).toBe('http://catalog-candidate:3001');
    expect(configuration.getDynamic('DYNAMIC_CATALOG_ISOLATION_TOKEN_TEST')).toBe(
      'candidate-provider-token'
    );
  });

  it('serializes a later direct mutation behind a pending configuration probe', async () => {
    const configuration = setupTest();
    await configuration.setValue('CATALOG_SERVICE_URL', 'http://catalog-original:3001');
    await configuration.setValue('CATALOG_SERVICE_TIMEOUT_MS', '1000');
    await configuration.setValue(
      'DYNAMIC_CATALOG_ISOLATION_TOKEN_TEST' as never,
      'stored-provider-token'
    );
    let release!: () => void;
    let entered!: () => void;
    const probeEntered = new Promise<void>(resolve => {
      entered = resolve;
    });
    const probeGate = new Promise<void>(resolve => {
      release = resolve;
    });
    registerCatalogProvider(
      configuration,
      jest.fn(async () => {
        entered();
        await probeGate;
        return { success: true, message: 'validated' };
      })
    );

    const save = configuration.testAndSaveConfigs([
      { key: 'CATALOG_SERVICE_URL', value: 'http://catalog-candidate:3001' },
      { key: 'CATALOG_SERVICE_TIMEOUT_MS', value: '2000' },
      { key: 'DYNAMIC_CATALOG_ISOLATION_TOKEN_TEST', value: 'candidate-provider-token' },
    ]);
    await probeEntered;

    let laterMutationSettled = false;
    const laterMutation = configuration
      .setValue('CATALOG_SERVICE_URL', 'http://catalog-later:3001')
      .then(() => {
        laterMutationSettled = true;
      });
    await Promise.resolve();
    expect(laterMutationSettled).toBe(false);

    release();
    await save;
    await laterMutation;
    expect(configuration.get('CATALOG_SERVICE_URL')).toBe('http://catalog-later:3001');
  });

  it('does not publish or persist a failed candidate probe', async () => {
    const configuration = setupTest();
    await configuration.setValue(
      'DYNAMIC_CATALOG_ISOLATION_TOKEN_TEST' as never,
      'stored-provider-token'
    );
    const applyConfiguration = jest.fn().mockResolvedValue({ success: true });
    const testConfiguration = jest.fn().mockResolvedValue({
      success: false,
      message: 'provider rejected candidate',
    });
    registerCatalogProvider(configuration, testConfiguration, applyConfiguration);
    const saveConfigFile = jest
      .spyOn(configuration as unknown as { saveConfigFile: () => Promise<void> }, 'saveConfigFile')
      .mockResolvedValue(undefined);

    const result = await configuration.testAndSaveConfigs([
      { key: 'DYNAMIC_CATALOG_ISOLATION_TOKEN_TEST', value: 'candidate-provider-token' },
    ]);

    expect(result.success).toBe(false);
    expect(configuration.getDynamic('DYNAMIC_CATALOG_ISOLATION_TOKEN_TEST')).toBe(
      'stored-provider-token'
    );
    expect(saveConfigFile).not.toHaveBeenCalled();
    expect(applyConfiguration).not.toHaveBeenCalled();
  });

  it('reports unknown and unsupported keys before probing any service', async () => {
    const configuration = setupTest();
    const result = await configuration.testAndSaveConfigs([
      { key: 'UNKNOWN_CONFIG_KEY', value: 'value' },
    ]);

    expect(result.success).toBe(false);
    expect(result.invalidKeys).toEqual(['UNKNOWN_CONFIG_KEY']);
    expect(result.services).toEqual([
      expect.objectContaining({
        success: false,
        message: 'Unknown or unsupported configuration keys: UNKNOWN_CONFIG_KEY',
      }),
    ]);
  });

  it('rolls back every attempted remote on a lost multi-group apply response', async () => {
    const configuration = setupTest();
    const makeSchema = (id: string, key: string): ServiceConfigSchema => ({
      groups: [
        {
          id,
          name: id,
          description: `${id} settings`,
          variables: [{ key, description: key, required: true, inputType: 'text' }],
        },
      ],
    });
    configuration.registerRemoteConfiguration(
      'CATALOG',
      makeSchema('CATALOG_PROVIDER', 'CATALOG_TOKEN_TEST')
    );
    configuration.registerRemoteConfiguration(
      'LIST',
      makeSchema('LIST_PROVIDER', 'LIST_TOKEN_TEST')
    );
    const catalogClear = jest.fn().mockResolvedValue({ success: true });
    const listClear = jest.fn().mockResolvedValue({ success: true });
    const catalogApply = jest.fn().mockResolvedValue({ success: true });
    const listApply = jest.fn().mockRejectedValue(new Error('connection lost after apply'));
    for (const [service, apply, clear] of [
      ['CATALOG', catalogApply, catalogClear],
      ['LIST', listApply, listClear],
    ] as const) {
      configuration.registerService(service, {
        testable: true,
        getStatus: () => ({ status: 'ready' }),
        reload: jest.fn().mockResolvedValue(undefined),
        testConfiguration: jest.fn().mockResolvedValue({ success: true }),
        applyConfiguration: apply,
        clearConfiguration: clear,
      });
    }

    const result = await configuration.testAndSaveConfigs([
      { key: 'CATALOG_TOKEN_TEST', value: 'catalog-token' },
      { key: 'LIST_TOKEN_TEST', value: 'list-token' },
    ]);

    expect(result.success).toBe(false);
    expect(catalogClear).toHaveBeenCalledTimes(1);
    expect(listClear).toHaveBeenCalledTimes(1);
    expect(configuration.getDynamic('CATALOG_TOKEN_TEST')).toBeUndefined();
    expect(configuration.getDynamic('LIST_TOKEN_TEST')).toBeUndefined();
  });

  it('continues remote consumer rollback when restoring the config file fails', async () => {
    const configuration = setupTest();
    const key = 'REMOTE_GROUP_ROLLBACK_TOKEN_TEST';
    configuration.registerRemoteConfiguration('CATALOG', {
      groups: [
        {
          id: 'REMOTE_GROUP_ROLLBACK',
          name: 'Remote rollback',
          description: 'Remote rollback settings',
          variables: [{ key, description: 'Token', required: true, inputType: 'text' }],
        },
      ],
    });
    const clearConfiguration = jest.fn().mockResolvedValue({ success: true });
    const applyConfiguration = jest.fn().mockResolvedValue({
      success: false,
      message: 'candidate rejected after activation attempt',
    });
    configuration.registerService('CATALOG', {
      testable: true,
      getStatus: () => ({ status: 'ready' }),
      reload: jest.fn().mockResolvedValue(undefined),
      testConfiguration: jest.fn().mockResolvedValue({ success: true }),
      applyConfiguration,
      clearConfiguration,
    });
    const saveConfigFile = jest
      .spyOn(configuration as unknown as { saveConfigFile: () => Promise<void> }, 'saveConfigFile')
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('disk restore failed'));

    const result = await configuration.saveServiceConfigs('REMOTE_GROUP_ROLLBACK', [
      { key, value: 'candidate-token' },
    ]);

    expect(result.success).toBe(false);
    expect(result.services[0]).toEqual(
      expect.objectContaining({
        service: 'CATALOG',
        success: false,
        message: 'candidate rejected after activation attempt',
      })
    );
    expect(saveConfigFile).toHaveBeenCalledTimes(2);
    expect(clearConfiguration).toHaveBeenCalledTimes(1);
    expect(configuration.getDynamic(key as never)).toBeUndefined();
  });
});
