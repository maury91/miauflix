import { Hono } from 'hono';

import { UserRole } from '@entities/user.entity';
import { AuthError } from '@errors/auth.errors';
import type { ProgressService } from '@services/progress/progress.service';

import { createProgressRoutes } from './progress.routes';

const update = {
  playable: { kind: 'movie', mediaId: 123 },
  positionSeconds: 30,
  durationSeconds: 100,
  state: 'paused',
};

const setupTest = (authenticated = true) => {
  const service = {
    update: jest.fn().mockResolvedValue(undefined),
    findByUser: jest.fn().mockResolvedValue([]),
  };
  const app = new Hono();
  app.use('*', async (c, next) => {
    if (authenticated)
      c.set('sessionInfo', {
        sessionId: 'session-1',
        user: { id: 'user-1', email: 'user@example.com', role: UserRole.USER },
      });
    await next();
  });
  app.onError((error, c) =>
    c.json({ error: error.message }, error instanceof AuthError ? 401 : 500)
  );
  app.route(
    '/progress',
    createProgressRoutes({ progressService: service as unknown as ProgressService })
  );
  return { app, service };
};

describe('progress routes', () => {
  it('delegates validated updates for the authenticated user and returns 204', async () => {
    const { app, service } = setupTest();
    const response = await app.request('/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update),
    });
    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    expect(service.update).toHaveBeenCalledWith('user-1', update);
  });

  it('returns service progress in the existing response shape', async () => {
    const { app, service } = setupTest();
    const progress = [{ ...update, updatedAt: '2026-10-04T10:00:00Z' }];
    service.findByUser.mockResolvedValue(progress);
    const response = await app.request('/progress');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ progress });
    expect(service.findByUser).toHaveBeenCalledWith('user-1');
  });

  it('rejects invalid positions before calling the service', async () => {
    const { app, service } = setupTest();
    const response = await app.request('/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...update, positionSeconds: 101 }),
    });
    expect(response.status).toBe(400);
    expect(service.update).not.toHaveBeenCalled();
  });

  it.each(['GET', 'POST'])('requires authentication for %s', async method => {
    const { app, service } = setupTest(false);
    const response = await app.request('/progress', {
      method,
      headers: { 'Content-Type': 'application/json' },
      ...(method === 'POST' ? { body: JSON.stringify(update) } : {}),
    });
    expect(response.status).toBe(401);
    expect(service.update).not.toHaveBeenCalled();
    expect(service.findByUser).not.toHaveBeenCalled();
  });
});
