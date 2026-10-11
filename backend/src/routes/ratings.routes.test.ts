jest.mock('@middleware/rate-limit.middleware', () => ({
  createRateLimitMiddlewareFactory:
    () => () => async (_context: unknown, next: () => Promise<void>) =>
      next(),
}));

import { Hono } from 'hono';

import { UserRole } from '@entities/user.entity';
import { AuthError } from '@errors/auth.errors';
import type { MediaRatingRepository } from '@repositories/media-rating.repository';

import { createRatingRoutes } from './ratings.routes';

const setupTest = (authenticated = true) => {
  const repository = {
    get: jest.fn().mockResolvedValue('like'),
    set: jest.fn().mockResolvedValue(undefined),
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
    '/ratings',
    createRatingRoutes({
      mediaRatingRepository: repository as unknown as MediaRatingRepository,
      auditLogService: {} as never,
      configurationService: { get: () => undefined } as never,
    })
  );
  return { app, repository };
};

const put = (app: ReturnType<typeof setupTest>['app'], item: unknown) =>
  app.request('/ratings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(item),
  });
const media = { mediaType: 'movie', mediaId: 123 };

describe('account ratings routes', () => {
  it('reads the signed-in account rating', async () => {
    const { app, repository } = setupTest();
    const response = await app.request('/ratings?mediaType=movie&mediaId=123');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ...media, rating: 'like' });
    expect(repository.get).toHaveBeenCalledWith('user-1', media);
  });

  it.each(['like', 'love', 'dislike', null])(
    'saves or clears %s for the signed-in account',
    async rating => {
      const { app, repository } = setupTest();
      expect((await put(app, { ...media, rating })).status).toBe(200);
      expect(repository.set).toHaveBeenCalledWith('user-1', media, rating);
    }
  );

  it.each([
    { rating: 'bad' },
    { mediaId: -1 },
    { mediaType: 'episode' },
    { userId: 'another-user' },
  ])('rejects invalid input %j', async invalid => {
    const { app, repository } = setupTest();
    expect((await put(app, { ...media, rating: 'like', ...invalid })).status).toBe(400);
    expect(repository.set).not.toHaveBeenCalled();
  });

  it('requires authentication for reads and writes', async () => {
    const { app, repository } = setupTest(false);
    expect((await app.request('/ratings?mediaType=movie&mediaId=123')).status).toBe(401);
    expect((await put(app, { ...media, rating: 'like' })).status).toBe(401);
    expect(repository.get).not.toHaveBeenCalled();
    expect(repository.set).not.toHaveBeenCalled();
  });

  it('does not report a failed write as saved', async () => {
    const { app, repository } = setupTest();
    repository.set.mockRejectedValueOnce(new Error('write failed'));
    expect((await put(app, { ...media, rating: 'like' })).status).toBe(500);
  });
});
