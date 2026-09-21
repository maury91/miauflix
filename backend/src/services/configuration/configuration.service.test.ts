import type { ConfigurableService, ServiceInstanceStatus } from '@mytypes/configuration';

import { ConfigurationService } from './configuration.service';

const clearEnvironmentVariable = jest.requireActual('../../../test-utils/environment')
  .clearEnvironmentVariable as (name: string) => () => void;

const catalogEntries = (url: string) => [
  { key: 'CATALOG_SERVICE_URL', value: url },
  { key: 'CATALOG_SERVICE_TIMEOUT_MS', value: '60000' },
];

const dynamicVariableName = 'DYNAMIC_OPTIONAL_STRING_DEFAULT_TEST';
let restoreDynamicVariable: (() => void) | undefined;

const setupTest = () => {
  restoreDynamicVariable = clearEnvironmentVariable(dynamicVariableName);
  return new ConfigurationService();
};

afterEach(() => {
  restoreDynamicVariable?.();
  restoreDynamicVariable = undefined;
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

describe('ConfigurationService web configuration actions', () => {
  it('applies a non-empty default to an absent optional dynamic string', () => {
    const configuration = setupTest();

    configuration.registerDynamicVariables(
      {
        [dynamicVariableName]: {
          description: 'Optional dynamic string',
          required: false,
          defaultValue: 'dynamic-default',
        },
      },
      'CATALOG'
    );

    expect(configuration.getDynamic(dynamicVariableName)).toBe('dynamic-default');
  });

  it('removes dynamic variables omitted from a rediscovered schema', () => {
    const configuration = setupTest();

    configuration.registerDynamicVariables(
      {
        CATALOG__RETAINED: { description: 'Retained', required: false, defaultValue: 'yes' },
        CATALOG__REMOVED: { description: 'Removed', required: false, defaultValue: 'no' },
      },
      'CATALOG'
    );
    configuration.registerDynamicVariables(
      { CATALOG__RETAINED: { description: 'Retained', required: false, defaultValue: 'yes' } },
      'CATALOG'
    );

    expect(configuration.getDynamic('CATALOG__RETAINED')).toBe('yes');
    expect(configuration.getDynamic('CATALOG__REMOVED')).toBeUndefined();
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
});
