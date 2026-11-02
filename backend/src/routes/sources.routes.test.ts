import { ContractError } from '@miauflix/contract';
import { Hono } from 'hono';

import { UserRole } from '@entities/user.entity';
import { AuthError, RoleError } from '@errors/auth.errors';
import type { SourcesClientService } from '@services/sources/sources-client.service';

import { createSourcesRoutes } from './sources.routes';

const setupTest = (role: UserRole | null = UserRole.ADMIN) => {
  const sourcesClientService = {
    providers: jest.fn().mockResolvedValue([{ id: 'yts' }]),
    updateProvider: jest.fn().mockResolvedValue({ id: 'yts', enabled: false }),
    reorderProviders: jest.fn().mockResolvedValue([{ id: 'yts' }]),
    testProvider: jest.fn().mockResolvedValue({ success: true, message: 'ok' }),
    repositories: jest.fn().mockResolvedValue([]),
    addRepository: jest.fn().mockResolvedValue({ id: 'repo:1' }),
    removeRepository: jest.fn().mockResolvedValue(undefined),
    refreshRepository: jest.fn().mockResolvedValue({ id: 'repo:1' }),
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
    expect(await (await app.request('/sources/providers')).json()).toEqual([{ id: 'yts' }]);
    const patched = await app.request(
      '/sources/providers/yts',
      json('PATCH', { enabled: false, priority: 5, settings: { dailyBudget: '10' } })
    );
    expect(patched.status).toBe(200);
    expect(sourcesClientService.updateProvider).toHaveBeenCalledWith({
      id: 'yts',
      enabled: false,
      priority: 5,
      settings: { dailyBudget: '10' },
    });
    const order = await app.request('/sources/providers/order', json('PUT', { ids: ['yts'] }));
    expect(order.status).toBe(200);
    expect(sourcesClientService.reorderProviders).toHaveBeenCalledWith(['yts']);
    const test = await app.request('/sources/providers/yts/test', json('POST'));
    expect(await test.json()).toEqual({ success: true, message: 'ok' });
  });

  it('validates input before calling the service', async () => {
    const { app, sourcesClientService } = setupTest();
    expect(
      (await app.request('/sources/providers/yts', json('PATCH', { priority: 0 }))).status
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
});
