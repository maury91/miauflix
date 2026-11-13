import { ContractError } from '@miauflix/contract';
import { Hono } from 'hono';

import { UserRole } from '@entities/user.entity';
import { AuthError, RoleError } from '@errors/auth.errors';
import type { SourcesClientService } from '@services/sources-client/sources-client.service';

import { createSourcesRoutes } from './sources.routes';

const setupTest = (role: UserRole | null = UserRole.ADMIN) => {
  const sourcesClientService = {
    providers: jest.fn().mockResolvedValue([{ id: 'provider-a' }]),
    updateProvider: jest.fn().mockResolvedValue({ id: 'provider-a', enabled: false }),
    reorderProviders: jest.fn().mockResolvedValue([{ id: 'provider-a' }]),
    testProvider: jest.fn().mockResolvedValue({ success: true, message: 'ok' }),
    repositories: jest.fn().mockResolvedValue([]),
    addRepository: jest.fn().mockResolvedValue({ id: 'repo:1' }),
    removeRepository: jest.fn().mockResolvedValue(undefined),
    refreshRepository: jest.fn().mockResolvedValue({ id: 'repo:1' }),
    cardigannDefinitions: jest
      .fn()
      .mockResolvedValue({ entries: [{ id: 'nyaasi' }], total: 1, sync: {} }),
    syncCardigannDefinitions: jest.fn().mockResolvedValue({ syncing: true }),
    addCardigannProvider: jest.fn().mockResolvedValue({ id: 'jackett-nyaasi' }),
    addTorznabProvider: jest.fn().mockResolvedValue({ id: 'torznab-x' }),
    removeProvider: jest.fn().mockResolvedValue(undefined),
  };
  const app = new Hono();
  app.use('*', async (c, next) => {
    if (role)
      c.set('sessionInfo', {
        sessionId: 'session-1',
        user: { id: 'user-1', email: 'user@example.com', role },
      });
    await next();
  });
  app.onError((error, c) =>
    c.json(
      { error: error.message },
      error instanceof AuthError ? 401 : error instanceof RoleError ? 403 : 500
    )
  );
  app.route(
    '/sources',
    createSourcesRoutes({
      sourcesClientService: sourcesClientService as unknown as SourcesClientService,
      auditLogService: {} as never,
      configurationService: { get: () => undefined } as never,
    } as never)
  );
  return { app, sourcesClientService };
};
const json = (method: string, body?: unknown) => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
});

beforeAll(() => {
  process.env.RATE_LIMIT_TEST_MODE = 'true';
});
afterAll(() => {
  delete process.env.RATE_LIMIT_TEST_MODE;
});

describe('sources routes', () => {
  it('only admins can use them', async () => {
    for (const [role, status] of [
      [null, 401],
      [UserRole.USER, 403],
    ] as const) {
      const { app, sourcesClientService } = setupTest(role);
      expect((await app.request('/sources/providers')).status).toBe(status);
      expect(
        (await app.request('/sources/repositories', json('POST', { url: 'https://a.b' }))).status
      ).toBe(status);
      expect(sourcesClientService.providers).not.toHaveBeenCalled();
      expect(sourcesClientService.addRepository).not.toHaveBeenCalled();
    }
  });

  it('lists, updates, reorders and tests providers', async () => {
    const { app, sourcesClientService } = setupTest();
    expect(await (await app.request('/sources/providers')).json()).toEqual([{ id: 'provider-a' }]);
    const patched = await app.request(
      '/sources/providers/provider-a',
      json('PATCH', { enabled: false, priority: 5, settings: { dailyBudget: '10' } })
    );
    expect(patched.status).toBe(200);
    expect(sourcesClientService.updateProvider).toHaveBeenCalledWith({
      id: 'provider-a',
      enabled: false,
      priority: 5,
      settings: { dailyBudget: '10' },
    });
    const order = await app.request(
      '/sources/providers/order',
      json('PUT', { ids: ['provider-a'] })
    );
    expect(order.status).toBe(200);
    expect(sourcesClientService.reorderProviders).toHaveBeenCalledWith(['provider-a']);
    const test = await app.request('/sources/providers/provider-a/test', json('POST'));
    expect(await test.json()).toEqual({ success: true, message: 'ok' });
  });

  it('validates input before calling the service', async () => {
    const { app, sourcesClientService } = setupTest();
    expect(
      (await app.request('/sources/providers/provider-a', json('PATCH', { priority: 0 }))).status
    ).toBe(400);
    expect((await app.request('/sources/repositories', json('POST', { url: 'nope' }))).status).toBe(
      400
    );
    expect((await app.request('/sources/providers/order', json('PUT', { ids: 'x' }))).status).toBe(
      400
    );
    expect(sourcesClientService.updateProvider).not.toHaveBeenCalled();
    expect(sourcesClientService.addRepository).not.toHaveBeenCalled();
  });

  it('maps service errors to HTTP statuses', async () => {
    const { app, sourcesClientService } = setupTest();
    sourcesClientService.updateProvider.mockRejectedValueOnce(
      new ContractError('not_found', 'Unknown provider x')
    );
    const missing = await app.request('/sources/providers/x', json('PATCH', { enabled: true }));
    expect(missing.status).toBe(404);
    sourcesClientService.addRepository.mockRejectedValueOnce(
      new ContractError('bad_request', 'Repository already added')
    );
    const duplicate = await app.request(
      '/sources/repositories',
      json('POST', { url: 'https://repo.example/list.json' })
    );
    expect(duplicate.status).toBe(400);
    expect(await duplicate.json()).toEqual({ error: 'Repository already added' });
    sourcesClientService.refreshRepository.mockRejectedValueOnce(
      new ContractError('unsupported', 'old service')
    );
    expect((await app.request('/sources/repositories/r/refresh', json('POST'))).status).toBe(503);
  });

  it('adds, refreshes and removes repositories', async () => {
    const { app, sourcesClientService } = setupTest();
    const added = await app.request(
      '/sources/repositories',
      json('POST', { url: 'https://repo.example/list.json' })
    );
    expect(added.status).toBe(201);
    expect((await app.request('/sources/repositories/repo:1/refresh', json('POST'))).status).toBe(
      200
    );
    expect((await app.request('/sources/repositories/repo:1', json('DELETE'))).status).toBe(204);
    expect(sourcesClientService.removeRepository).toHaveBeenCalledWith('repo:1');
  });

  it('installs Jackett definitions and Torznab indexers and removes them again', async () => {
    const { app, sourcesClientService } = setupTest();
    const catalog = await app.request(
      '/sources/definitions?query=nya&source=Prowlarr%2FIndexers&imdb=true&publicOnly=true&movies=false&offset=40&limit=20'
    );
    expect(await catalog.json()).toEqual({ entries: [{ id: 'nyaasi' }], total: 1, sync: {} });
    expect(sourcesClientService.cardigannDefinitions).toHaveBeenLastCalledWith({
      query: 'nya',
      source: 'Prowlarr/Indexers',
      imdb: true,
      publicOnly: true,
      movies: false,
      offset: 40,
      limit: 20,
    });
    await app.request('/sources/definitions');
    expect(sourcesClientService.cardigannDefinitions).toHaveBeenLastCalledWith({
      offset: 0,
      limit: 40,
    });
    for (const bad of ['limit=101', 'offset=-1', 'imdb=yes'])
      expect((await app.request(`/sources/definitions?${bad}`)).status).toBe(400);
    const sync = await app.request('/sources/definitions/sync', json('POST'));
    expect(await sync.json()).toEqual({ syncing: true });
    const cardigann = await app.request(
      '/sources/providers/cardigann',
      json('POST', { id: 'nyaasi', source: 'Prowlarr/Indexers@master:definitions/v11' })
    );
    expect(cardigann.status).toBe(201);
    expect(sourcesClientService.addCardigannProvider).toHaveBeenCalledWith({
      id: 'nyaasi',
      source: 'Prowlarr/Indexers@master:definitions/v11',
    });
    const torznab = await app.request(
      '/sources/providers/torznab',
      json('POST', { name: ' Mine ', baseUrl: 'http://jackett:9117/api', apiKey: 'k' })
    );
    expect(torznab.status).toBe(201);
    expect(sourcesClientService.addTorznabProvider).toHaveBeenCalledWith({
      name: 'Mine',
      baseUrl: 'http://jackett:9117/api',
      apiKey: 'k',
    });
    expect((await app.request('/sources/providers/torznab-x', json('DELETE'))).status).toBe(204);
    expect(sourcesClientService.removeProvider).toHaveBeenCalledWith('torznab-x');
    for (const [path, body] of [
      ['/sources/providers/cardigann', { id: '../x' }],
      ['/sources/providers/torznab', { name: '', baseUrl: 'nope' }],
    ] as const)
      expect((await app.request(path, json('POST', body))).status).toBe(400);
    sourcesClientService.addCardigannProvider.mockRejectedValueOnce(
      new ContractError('bad_request', 'Unsupported Cardigann feature: login')
    );
    expect(
      (await app.request('/sources/providers/cardigann', json('POST', { id: 'private' }))).status
    ).toBe(400);
  });
});
