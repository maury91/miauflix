import { configureFakerSeed } from '@__test-utils__/utils';
import { SERVICE_MANIFEST_PATH } from '@miauflix/service-contracts';
import { z } from 'zod';

import { RemoteServiceManager } from '@services/remote/remote-service.manager';

const manifest = {
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
};

const setupTest = () => {
  const values: Record<string, unknown> = {
    CATALOG_SERVICE_URL: 'http://catalog:3001',
    CATALOG_SERVICE_TIMEOUT_MS: 1_000,
  };
  const configuration = {
    getDynamic: jest.fn((key: string) => values[key]),
    registerRemoteConfiguration: jest.fn(),
    getServiceConfigSnapshot: jest.fn(),
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
  beforeAll(() => {
    configureFakerSeed();
  });

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('discovers capability metadata and registers namespaced configuration', async () => {
    const { configuration, manager } = setupTest();
    jest.spyOn(global, 'fetch').mockImplementation(async input => {
      const path = new URL(String(input)).pathname;
      if (path === SERVICE_MANIFEST_PATH) return Response.json(manifest);
      if (path === '/configuration/schema') {
        return Response.json({
          groups: [
            {
              id: 'TMDB',
              name: 'TMDB',
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
            },
          ],
        });
      }
      if (path === '/configuration') {
        return Response.json({ success: true, activated: true });
      }
      if (path === '/status') return Response.json({ state: 'ready' });
      throw new Error(`Unexpected request ${path}`);
    });

    await manager.initialize();
    manager.stop();

    expect(manager.capabilityBasePath).toBe('/v1/catalog');
    expect(manager.getStatus()).toEqual({ status: 'ready' });
    expect(configuration.registerRemoteConfiguration).toHaveBeenCalledWith(
      'CATALOG',
      expect.objectContaining({ groups: [expect.objectContaining({ id: 'TMDB' })] })
    );
  });

  it('reapplies the complete backend snapshot when a running service returns to standby', async () => {
    const { configuration, manager } = setupTest();
    configuration.getServiceConfigSnapshot.mockReturnValue({
      TMDB_API_ACCESS_TOKEN: 'backend-owned-token',
    });
    let statusRequests = 0;
    const applyRequests: unknown[] = [];
    jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      const path = new URL(String(input)).pathname;
      if (path === SERVICE_MANIFEST_PATH) return Response.json(manifest);
      if (path === '/configuration/schema') return Response.json({ groups: [] });
      if (path === '/configuration' && init?.method === 'PUT') {
        applyRequests.push(JSON.parse(String(init.body)));
        return Response.json({ success: true, activated: true });
      }
      if (path === '/status') {
        statusRequests += 1;
        return Response.json({ state: statusRequests === 2 ? 'standby' : 'ready' });
      }
      throw new Error(`Unexpected request ${path}`);
    });

    await manager.initialize();
    expect(manager.getStatus()).toEqual({ status: 'ready' });

    await jest.advanceTimersByTimeAsync(15_000);
    manager.stop();

    expect(applyRequests).toEqual([
      { values: { TMDB_API_ACCESS_TOKEN: 'backend-owned-token' } },
      { values: { TMDB_API_ACCESS_TOKEN: 'backend-owned-token' } },
    ]);
    expect(manager.getStatus()).toEqual({ status: 'ready' });
  });

  it('preserves remote presentation metadata and generated secret defaults', async () => {
    const { configuration, manager } = setupTest();
    jest.spyOn(global, 'fetch').mockImplementation(async input => {
      const path = new URL(String(input)).pathname;
      if (path === SERVICE_MANIFEST_PATH) return Response.json(manifest);
      if (path === '/configuration/schema') {
        return Response.json({
          groups: [
            {
              id: 'TMDB',
              name: 'TMDB',
              description: 'Catalog settings',
              variables: [
                {
                  key: 'REDIRECT_URI',
                  label: 'Redirect URI',
                  description: 'Registered callback URI',
                  required: true,
                  inputType: 'text',
                  advanced: true,
                  defaultValueSource: 'browser-origin',
                },
                {
                  key: 'ENCRYPTION_KEY',
                  description: 'Generated key',
                  required: true,
                  inputType: 'password',
                  skipUserInteraction: true,
                  defaultValue: 'generated-secret',
                },
              ],
            },
          ],
        });
      }
      if (path === '/configuration') return Response.json({ success: true, activated: true });
      if (path === '/status') return Response.json({ state: 'ready' });
      throw new Error(`Unexpected request ${path}`);
    });

    await manager.initialize();
    manager.stop();

    const schema = configuration.registerRemoteConfiguration.mock.calls[0]?.[1] as {
      groups: Array<{ variables: Array<Record<string, unknown>> }>;
    };
    const variables = Object.fromEntries(
      schema.groups.flatMap(group => group.variables.map(variable => [variable.key, variable]))
    );
    expect(variables.REDIRECT_URI).toMatchObject({
      label: 'Redirect URI',
      advanced: true,
      defaultValueSource: 'browser-origin',
    });
    expect(variables.ENCRYPTION_KEY).toMatchObject({
      inputType: 'password',
      skipUserInteraction: true,
      defaultValue: 'generated-secret',
    });
  });

  it('reports incompatible capability versions as a service error', async () => {
    const { manager } = setupTest();
    jest.spyOn(global, 'fetch').mockResolvedValue(
      Response.json({
        ...manifest,
        capabilities: { catalog: { version: 2, basePath: '/v1/catalog' } },
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

  it('retries discovery after the initial schema request fails', async () => {
    const { configuration, manager } = setupTest();
    let schemaRequests = 0;
    jest.spyOn(global, 'fetch').mockImplementation(async input => {
      const path = new URL(String(input)).pathname;
      if (path === SERVICE_MANIFEST_PATH) return Response.json(manifest);
      if (path === '/configuration/schema') {
        schemaRequests += 1;
        if (schemaRequests === 1) throw new Error('schema unavailable');
        return Response.json({
          groups: [],
        });
      }
      if (path === '/configuration') return Response.json({ success: true, activated: true });
      if (path === '/status') return Response.json({ state: 'ready' });
      throw new Error(`Unexpected request ${path}`);
    });

    await manager.initialize();
    expect(manager.getStatus()).toEqual(
      expect.objectContaining({ status: 'error', errorMessage: 'schema unavailable' })
    );

    await jest.advanceTimersByTimeAsync(15_000);
    manager.stop();

    expect(schemaRequests).toBe(2);
    expect(manager.getStatus()).toEqual({ status: 'ready' });
    expect(configuration.registerRemoteConfiguration).toHaveBeenCalledTimes(1);
  });

  it('keeps the previous discovery state when a rediscovered schema is invalid', async () => {
    const { manager } = setupTest();
    let schemaRequests = 0;
    jest.spyOn(global, 'fetch').mockImplementation(async input => {
      const path = new URL(String(input)).pathname;
      if (path === SERVICE_MANIFEST_PATH) {
        return Response.json({
          ...manifest,
          capabilities: {
            catalog: {
              version: 1,
              basePath: '/v1/catalog',
            },
          },
        });
      }
      if (path === '/configuration/schema') {
        schemaRequests += 1;
        if (schemaRequests === 1) {
          return Response.json({
            groups: [],
          });
        }
        throw new Error('schema unavailable');
      }
      if (path === '/configuration') return Response.json({ success: true, activated: true });
      if (path === '/status') return Response.json({ state: 'ready' });
      throw new Error(`Unexpected request ${path}`);
    });

    await manager.initialize();
    await expect((manager as unknown as { discover(): Promise<void> }).discover()).rejects.toThrow(
      'schema unavailable'
    );

    expect(manager.capabilityBasePath).toBe('/v1/catalog');
    manager.stop();
  });

  it('replaces remote configuration keys when rediscovery removes a variable', async () => {
    const { configuration, manager } = setupTest();
    let discovery = 0;
    const requests: Array<{ path: string; body?: unknown }> = [];
    jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      const path = new URL(String(input)).pathname;
      requests.push({
        path,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      if (path === SERVICE_MANIFEST_PATH) return Response.json(manifest);
      if (path === '/configuration/schema') {
        discovery += 1;
        return Response.json({
          groups: [
            {
              id: 'TMDB',
              name: 'TMDB',
              description: 'Catalog settings',
              variables: [
                {
                  key: 'API_TOKEN',
                  description: 'Provider token',
                  required: true,
                  inputType: 'password',
                },
                ...(discovery === 1
                  ? [
                      {
                        key: 'REMOVED_KEY',
                        description: 'Removed later',
                        required: false,
                        inputType: 'string',
                      },
                    ]
                  : []),
              ],
            },
          ],
        });
      }
      if (path === '/configuration') return Response.json({ success: true, activated: true });
      if (path === '/status') return Response.json({ state: 'ready' });
      throw new Error(`Unexpected request ${path}`);
    });

    await manager.initialize();
    (manager as unknown as { manifest: null }).manifest = null;
    requests.length = 0;
    await manager.reload();
    manager.stop();

    expect(requests.filter(request => request.path === '/configuration')).toEqual([]);
    expect(
      configuration.registerRemoteConfiguration.mock.calls
        .at(-1)?.[1]
        .groups[0]?.variables.map((v: { key: string }) => v.key)
    ).toEqual(['API_TOKEN']);
  });

  it('retains a rejected remote fetch error instead of treating it as missing configuration', async () => {
    const { manager } = setupTest();
    const transportError = new Error('connection reset by peer');
    jest.spyOn(global, 'fetch').mockRejectedValue(transportError);

    await expect(manager.request(z.object({}), '/health')).rejects.toBe(transportError);
  });

  it('times out while consuming a remote response body and clears its timer', async () => {
    const { configuration, manager } = setupTest();
    (configuration.getDynamic as jest.Mock).mockImplementation((key: string) =>
      key === 'CATALOG_SERVICE_TIMEOUT_MS' ? 25 : 'http://catalog:3001'
    );
    jest.spyOn(global, 'fetch').mockImplementation(async (_input, init) => {
      const signal = init?.signal as AbortSignal;
      return {
        ok: true,
        status: 200,
        json: () =>
          new Promise((_, reject) => {
            signal.addEventListener('abort', () => reject(new Error('body aborted')), {
              once: true,
            });
          }),
      } as Response;
    });

    const request = expect(manager.request(z.object({}), '/health')).rejects.toThrow(
      'CATALOG request timed out after 25ms'
    );
    await jest.advanceTimersByTimeAsync(25);

    await request;
    expect(jest.getTimerCount()).toBe(0);
  });

  it('parses CRLF-delimited status events', async () => {
    const { manager } = setupTest();
    const eventManifest = {
      ...manifest,
      management: { ...manifest.management, statusEventsPath: '/events' },
    };
    jest.spyOn(global, 'fetch').mockImplementation(async input => {
      const path = new URL(String(input)).pathname;
      if (path === SERVICE_MANIFEST_PATH) return Response.json(eventManifest);
      if (path === '/configuration/schema') {
        return Response.json({ groups: [] });
      }
      if (path === '/configuration') return Response.json({ success: true, activated: true });
      if (path === '/status') return Response.json({ state: 'ready' });
      if (path === '/events') {
        const body = new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode('data: {"state":"error","message":"degraded"}\r\n\r\n')
            );
            controller.close();
          },
        });
        return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
      }
      throw new Error(`Unexpected request ${path}`);
    });

    await manager.initialize();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(manager.getStatus()).toEqual(
      expect.objectContaining({ status: 'error', errorMessage: 'degraded' })
    );
    manager.stop();
  });

  it('retains readiness when the optional status stream transport fails', async () => {
    const { manager } = setupTest();
    const streamError = new Error('connection reset by peer');
    const eventManifest = {
      ...manifest,
      management: { ...manifest.management, statusEventsPath: '/events' },
    };
    jest.spyOn(global, 'fetch').mockImplementation(async input => {
      const path = new URL(String(input)).pathname;
      if (path === SERVICE_MANIFEST_PATH) return Response.json(eventManifest);
      if (path === '/configuration/schema') {
        return Response.json({ groups: [] });
      }
      if (path === '/configuration') return Response.json({ success: true, activated: true });
      if (path === '/status') return Response.json({ state: 'ready' });
      if (path === '/events') {
        const body = new ReadableStream({
          start(controller) {
            controller.error(streamError);
          },
        });
        return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
      }
      throw new Error(`Unexpected request ${path}`);
    });

    await manager.initialize();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(manager.getStatus()).toEqual({ status: 'ready' });
    manager.stop();
  });

  it('uses the remote observational configuration test endpoint without applying values', async () => {
    const { manager } = setupTest();
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
          groups: [
            {
              id: 'TMDB',
              name: 'TMDB',
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
            },
          ],
        });
      }
      if (path === '/configuration') return Response.json({ success: true, activated: true });
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
    await expect(
      manager.testConfiguration([{ key: 'API_TOKEN', value: 'draft-token' }])
    ).resolves.toEqual({ success: true, mode: 'live', message: 'Catalog provider is reachable' });
    manager.stop();

    expect(requests).toEqual([
      {
        path: '/configuration/test',
        method: 'POST',
        body: { values: { API_TOKEN: 'draft-token' } },
      },
    ]);
  });
});
