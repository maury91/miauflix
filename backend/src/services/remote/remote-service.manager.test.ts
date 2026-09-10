import { SERVICE_MANIFEST_PATH } from '@miauflix/service-contracts';
import { z } from 'zod';

import { RemoteServiceManager } from '@services/remote/remote-service.manager';

const manifest = {
  id: 'media-catalog',
  name: 'Media Catalog',
  description: 'Catalog',
  version: '1.0.0',
  managementProtocolVersion: 1,
  capabilities: { catalog: { version: 1, basePath: '/v1/catalog' } },
  management: {
    statusPath: '/status',
    configurationSchemaPath: '/configuration/schema',
    configurationStatePath: '/configuration',
    configurationTestPath: '/configuration/test',
    configurationApplyPath: '/configuration',
  },
};

const setupTest = () => {
  const values: Record<string, unknown> = {
    CATALOG_SERVICE_URL: 'http://catalog:3001',
    CATALOG_SERVICE_TIMEOUT_MS: 1_000,
  };
  const configuration = {
    getDynamic: jest.fn((key: string) => values[key]),
    registerDynamicVariables: jest.fn((variables: Record<string, unknown>) => {
      Object.assign(
        values,
        Object.fromEntries(Object.keys(variables).map(key => [key, undefined]))
      );
    }),
  };
  const manager = new RemoteServiceManager(configuration as never, {
    serviceName: 'CATALOG',
    urlKey: 'CATALOG_SERVICE_URL',
    timeoutKey: 'CATALOG_SERVICE_TIMEOUT_MS',
    capability: 'catalog',
    capabilityVersion: 1,
  });
  return { configuration, manager };
};

describe('RemoteServiceManager', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('discovers capability metadata and registers namespaced configuration', async () => {
    const { configuration, manager } = setupTest();
    jest.spyOn(global, 'fetch').mockImplementation(async input => {
      const path = new URL(String(input)).pathname;
      if (path === SERVICE_MANIFEST_PATH) return Response.json(manifest);
      if (path === '/configuration/schema') {
        return Response.json({
          name: 'Media Catalog',
          description: 'Catalog settings',
          variables: [
            {
              key: 'API_TOKEN',
              description: 'Provider token',
              required: true,
              secret: true,
              inputType: 'password',
            },
          ],
        });
      }
      if (path === '/configuration') {
        return Response.json({ success: true, reloaded: true });
      }
      if (path === '/status') return Response.json({ state: 'ready' });
      throw new Error(`Unexpected request ${path}`);
    });

    await manager.initialize();
    manager.stop();

    expect(manager.capabilityBasePath).toBe('/v1/catalog');
    expect(manager.getStatus()).toEqual({ status: 'ready' });
    expect(configuration.registerDynamicVariables).toHaveBeenCalledWith(
      expect.objectContaining({ CATALOG__API_TOKEN: expect.any(Object) }),
      'CATALOG'
    );
  });

  it('reports incompatible capability versions as a service error', async () => {
    const { manager } = setupTest();
    jest.spyOn(global, 'fetch').mockResolvedValue(
      Response.json({
        ...manifest,
        capabilities: { catalog: { version: 2, basePath: '/v2/catalog' } },
      })
    );

    await manager.initialize();
    manager.stop();

    expect(manager.getStatus()).toEqual(
      expect.objectContaining({
        status: 'error',
        errorMessage: expect.stringContaining('expected v1'),
      })
    );
  });

  it('retains a rejected remote fetch error instead of treating it as missing configuration', async () => {
    const { manager } = setupTest();
    const transportError = new Error('connection reset by peer');
    jest.spyOn(global, 'fetch').mockRejectedValue(transportError);

    await expect(manager.request(z.object({}), '/health')).rejects.toBe(transportError);
  });

  it('uses the remote observational configuration test endpoint without applying values', async () => {
    const { configuration, manager } = setupTest();
    const requests: Array<{ path: string; method: string; body?: unknown }> = [];
    jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      const path = new URL(String(input)).pathname;
      requests.push({
        path,
        method: init?.method ?? 'GET',
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      if (path === SERVICE_MANIFEST_PATH) return Response.json(manifest);
      if (path === '/configuration/schema') {
        return Response.json({
          name: 'Media Catalog',
          description: 'Catalog settings',
          variables: [
            {
              key: 'API_TOKEN',
              description: 'Provider token',
              required: true,
              secret: true,
              inputType: 'password',
            },
          ],
        });
      }
      if (path === '/configuration') return Response.json({ success: true, reloaded: true });
      if (path === '/configuration/test') {
        return Response.json({
          success: true,
          mode: 'live',
          message: 'Catalog provider is reachable',
        });
      }
      if (path === '/status') return Response.json({ state: 'ready' });
      throw new Error(`Unexpected request ${path}`);
    });

    await manager.initialize();
    requests.length = 0;
    (configuration.getDynamic as jest.Mock).mockReturnValueOnce('draft-token');

    await expect(
      (manager as unknown as { testConfiguration(): Promise<unknown> }).testConfiguration()
    ).resolves.toEqual({ success: true, mode: 'live', message: 'Catalog provider is reachable' });
    manager.stop();

    expect(requests).toEqual([
      {
        path: '/configuration/test',
        method: 'POST',
        body: { values: { API_TOKEN: 'draft-token' }, unsetKeys: [] },
      },
    ]);
  });
});
